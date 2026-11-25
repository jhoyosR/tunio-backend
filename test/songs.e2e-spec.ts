import {
  INestApplication,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { Song } from '../src/catalog/entities/song.entity';
import { SongsService } from '../src/catalog/songs.service';
import {
  VideoDetails,
  YoutubeClient,
  YoutubeUnavailableError,
} from '../src/catalog/youtube.client';
import {
  currentQuotaDate,
  YoutubeQuotaService,
} from '../src/catalog/youtube-quota.service';
import { createTestApp } from './e2e-helpers';

const CONCURRENT_REQUESTS = 5;

const details = (id: string, playable = true): VideoDetails => ({
  playable,
  song: {
    youtubeVideoId: id,
    title: 'La Gota Fría',
    artistDisplay: 'Carlos Vives',
    channelTitle: 'Carlos Vives',
    durationSeconds: 218,
    thumbnailUrl: `https://img/${id}.jpg`,
  },
});

describe('SongsService (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let songs: SongsService;
  let songRepository: Repository<Song>;
  let getVideosSpy: jest.SpyInstance;

  // Cada prueba usa su propio id: todas las suites comparten la base.
  const respondWith = (video: VideoDetails | undefined) =>
    getVideosSpy.mockImplementation((ids: string[]) =>
      Promise.resolve(new Map(video ? [[ids[0], video]] : [])),
    );

  async function setQuotaUsed(units: number): Promise<void> {
    await dataSource.query(
      `INSERT INTO tunio.youtube_quota_usage (usage_date, units_consumed)
       VALUES ($1, $2)
       ON CONFLICT (usage_date) DO UPDATE SET units_consumed = EXCLUDED.units_consumed`,
      [currentQuotaDate(), units],
    );
  }

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    songs = app.get(SongsService);
    songRepository = dataSource.getRepository(Song);
  });

  beforeEach(async () => {
    await setQuotaUsed(0);
    getVideosSpy = jest.spyOn(app.get(YoutubeClient), 'getVideos');
  });

  afterEach(() => getVideosSpy.mockRestore());

  afterAll(async () => {
    await app.close();
  });

  it('una cancion nueva y reproducible se guarda verificada, cobrando 1 unidad', async () => {
    respondWith(details('songs-new'));

    const song = await songs.resolvePlayableSong('songs-new');

    expect(song).toMatchObject({
      youtubeVideoId: 'songs-new',
      title: 'La Gota Fría',
      artistDisplay: 'Carlos Vives',
      durationSeconds: 218,
      lastKnownPlayable: true,
    });
    expect(song.verifiedAt).toBeInstanceOf(Date);
    const [{ units_consumed }] = await dataSource.query<
      Array<{ units_consumed: number }>
    >(
      `SELECT units_consumed FROM tunio.youtube_quota_usage WHERE usage_date = $1`,
      [currentQuotaDate()],
    );
    expect(units_consumed).toBe(1);
  });

  it('volver a verificarla no pisa el titulo ni el artista corregidos a mano', async () => {
    await songRepository.save({
      youtubeVideoId: 'songs-curated',
      title: 'Titulo corregido',
      artistDisplay: 'Artista corregido',
      durationSeconds: 200,
      lastKnownPlayable: false,
    });
    respondWith(details('songs-curated'));

    const song = await songs.resolvePlayableSong('songs-curated');

    expect(song).toMatchObject({
      title: 'Titulo corregido',
      artistDisplay: 'Artista corregido',
      lastKnownPlayable: true,
    });
  });

  it('si deja de ser reproducible se marca y se rechaza con 422', async () => {
    await songRepository.save({
      youtubeVideoId: 'songs-blocked',
      title: 'Cancion',
      durationSeconds: 200,
    });
    respondWith(details('songs-blocked', false));

    await expect(
      songs.resolvePlayableSong('songs-blocked'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    const stored = await songRepository.findOneByOrFail({
      youtubeVideoId: 'songs-blocked',
    });
    expect(stored.lastKnownPlayable).toBe(false);
    expect(stored.verifiedAt).not.toBeNull();
  });

  it('un video que YouTube ya no devuelve se rechaza sin guardarlo', async () => {
    respondWith(undefined);

    await expect(
      songs.resolvePlayableSong('songs-deleted'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      songRepository.countBy({ youtubeVideoId: 'songs-deleted' }),
    ).resolves.toBe(0);
  });

  describe('sin poder verificar', () => {
    it('YouTube caido: una cancion conocida y reproducible se acepta', async () => {
      await songRepository.save({
        youtubeVideoId: 'songs-known',
        title: 'Cancion',
        durationSeconds: 200,
      });
      getVideosSpy.mockRejectedValue(new YoutubeUnavailableError('timeout'));

      await expect(
        songs.resolvePlayableSong('songs-known'),
      ).resolves.toMatchObject({ youtubeVideoId: 'songs-known' });
    });

    it('cuota agotada: una cancion nueva no se puede aceptar (503)', async () => {
      await setQuotaUsed(app.get(YoutubeQuotaService).dailyQuota);
      respondWith(details('songs-no-quota'));

      await expect(
        songs.resolvePlayableSong('songs-no-quota'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(getVideosSpy).not.toHaveBeenCalled();
    });

    it('la reserva de cuota queda para verificar, aunque las busquedas la agotaron', async () => {
      await setQuotaUsed(app.get(YoutubeQuotaService).searchBudget);
      respondWith(details('songs-reserve'));

      await expect(
        songs.resolvePlayableSong('songs-reserve'),
      ).resolves.toMatchObject({ lastKnownPlayable: true });
    });
  });

  it('pedidos simultaneos de la misma cancion nueva dejan una sola fila', async () => {
    respondWith(details('songs-race'));

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () =>
        songs.resolvePlayableSong('songs-race'),
      ),
    );

    expect(new Set(results.map((song) => song.id)).size).toBe(1);
    await expect(
      songRepository.countBy({ youtubeVideoId: 'songs-race' }),
    ).resolves.toBe(1);
  });
});
