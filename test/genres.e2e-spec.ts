import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Song } from '../src/catalog/entities/song.entity';
import { SongsService } from '../src/catalog/songs.service';
import { DefaultPlaylistTrack } from '../src/playlists/entities/default-playlist-track.entity';
import { DefaultPlaylist } from '../src/playlists/entities/default-playlist.entity';
import {
  authed,
  createTestApp,
  createVenueWithStaff,
  VenueFixture,
} from './e2e-helpers';
import request from 'supertest';

describe('Genres (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let bar: VenueFixture;
  let otherBar: VenueFixture;
  let qrToken: string;
  let songCounter = 0;
  const songs: Record<string, Song> = {};

  async function createSong(title: string): Promise<Song> {
    songCounter += 1;
    return dataSource.getRepository(Song).save({
      youtubeVideoId: `gn-e2e-${String(songCounter).padStart(4, '0')}`,
      title,
      durationSeconds: 200,
    });
  }

  const requestSong = (song: Song) =>
    authed(app, 'post', `/qr/${qrToken}/requests`)
      .send({
        installationId: randomUUID(),
        youtubeVideoId: song.youtubeVideoId,
      })
      .expect(200);

  async function openSession(): Promise<string> {
    const response = await authed(
      app,
      'post',
      `/venues/${bar.venue.id}/sessions`,
      bar.tokens.admin,
    )
      .send({})
      .expect(201);
    return response.body.data.id as string;
  }

  const closeSession = (sessionId: string) =>
    authed(
      app,
      'post',
      `/venues/${bar.venue.id}/sessions/${sessionId}/close`,
      bar.tokens.admin,
    ).expect(200);

  const put = (
    fixture: VenueFixture,
    songId: string,
    genre: unknown,
    token: string,
  ) =>
    request(app.getHttpServer())
      .put(`/venues/${fixture.venue.id}/songs/${songId}/genre`)
      .set('Authorization', `Bearer ${token}`)
      .send({ genre });

  const get = (path: string, token = bar.tokens.admin, venue = bar) =>
    authed(app, 'get', `/venues/${venue.venue.id}${path}`, token);

  const today = () =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    bar = await createVenueWithStaff(app, 'genres-e2e-bar', [
      ['admin', 'ADMIN'],
      ['dj', 'DJ'],
    ]);
    otherBar = await createVenueWithStaff(app, 'genres-e2e-other', [
      ['admin', 'ADMIN'],
    ]);
    const qr = await authed(
      app,
      'post',
      `/venues/${bar.venue.id}/qr/regenerate`,
      bar.tokens.admin,
    ).expect(200);
    qrToken = qr.body.data.publicToken as string;

    jest
      .spyOn(app.get(SongsService), 'resolvePlayableSong')
      .mockImplementation((youtubeVideoId: string) =>
        dataSource.getRepository(Song).findOneByOrFail({ youtubeVideoId }),
      );

    for (const name of ['A', 'B', 'C', 'D', 'E']) {
      songs[name] = await createSong(`Cancion ${name}`);
    }
    // A se pide en dos noches, B y C en una: A=2, B=1, C=1.
    const first = await openSession();
    await requestSong(songs.A);
    await requestSong(songs.B);
    await closeSession(first);
    const second = await openSession();
    await requestSong(songs.A);
    await requestSong(songs.C);
    await closeSession(second);
    // D solo esta en la lista por defecto del bar; E no pasa por el bar.
    const playlist = await dataSource
      .getRepository(DefaultPlaylist)
      .save({ venueId: bar.venue.id, name: 'Lista' });
    await dataSource.getRepository(DefaultPlaylistTrack).save({
      playlistId: playlist.id,
      venueId: bar.venue.id,
      songId: songs.D.id,
      position: 1,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('el DJ no clasifica', async () => {
    await get('/genres', bar.tokens.dj).expect(403);
    await put(bar, songs.A.id, 'POP', bar.tokens.dj).expect(403);
  });

  it('lista cerrada de generos', async () => {
    const response = await get('/genres').expect(200);
    expect(response.body.data).toHaveLength(13);
    expect(response.body.data[0]).toEqual({ code: 'SALSA', label: 'Salsa' });
  });

  it('cobertura inicial 0 de 4, y null sin solicitudes', async () => {
    const response = await get(
      `/genres/coverage?from=${today()}&to=${today()}`,
    ).expect(200);
    expect(response.body.data).toEqual({
      totalRequests: 4,
      classifiedRequests: 0,
      coveragePercent: 0,
    });
    const empty = await get(
      '/genres/coverage',
      otherBar.tokens.admin,
      otherBar,
    ).expect(200);
    expect(empty.body.data.coveragePercent).toBeNull();
    const future = await get('/genres/coverage?from=2999-01-01').expect(200);
    expect(future.body.data.totalRequests).toBe(0);
    await get('/genres/coverage?from=2026-13-01').expect(400);
  });

  it('sin clasificar: las mas solicitadas primero, a igualdad la mas reciente', async () => {
    const response = await get('/genres/unclassified-songs').expect(200);
    const items = response.body.data.items as Array<{
      songId: string;
      requestCount: number;
    }>;
    expect(items.map((i) => [i.songId, i.requestCount])).toEqual([
      [songs.A.id, 2],
      [songs.C.id, 1],
      [songs.B.id, 1],
    ]);
    expect(response.body.data.meta.totalItems).toBe(3);
    const page = await get('/genres/unclassified-songs?limit=1&page=2').expect(
      200,
    );
    expect(
      page.body.data.items.map((i: { songId: string }) => i.songId),
    ).toEqual([songs.C.id]);
    expect(page.body.data.meta).toMatchObject({ totalItems: 3, totalPages: 3 });
  });

  it('asignar y cambiar, con quien y cuando, y bitacora', async () => {
    await put(bar, songs.A.id, 'salsa', bar.tokens.admin).expect(400);
    await put(bar, songs.A.id, undefined, bar.tokens.admin).expect(400);
    const set = await put(bar, songs.A.id, 'POP', bar.tokens.admin).expect(200);
    expect(set.body.data).toMatchObject({
      songId: songs.A.id,
      genre: 'POP',
      title: 'Cancion A',
    });
    expect(set.body.data.genreSetAt).toBeTruthy();
    const changed = await put(bar, songs.A.id, 'ROCK', bar.tokens.admin).expect(
      200,
    );
    expect(changed.body.data.genre).toBe('ROCK');

    const [row] = await dataSource.query<
      Array<{ genre: string; by: string; at: Date }>
    >(
      `SELECT s.genre, s.genre_set_by_staff_id AS by, s.genre_set_at AS at
         FROM tunio.songs s WHERE s.id = $1`,
      [songs.A.id],
    );
    const [{ staff_user_id: adminId }] = await dataSource.query<
      Array<{ staff_user_id: string }>
    >(
      `SELECT staff_user_id FROM tunio.venue_staff WHERE venue_id = $1 AND role = 'ADMIN'`,
      [bar.venue.id],
    );
    expect(row).toMatchObject({ genre: 'ROCK', by: adminId });

    const actions = await get('/admin-actions?limit=10').expect(200);
    const genreSets = (
      actions.body.data.items as Array<{
        action: string;
        details: Record<string, unknown>;
      }>
    ).filter((i) => i.action === 'GENRE_SET');
    expect(
      genreSets.map((i) => [
        i.details.genre,
        i.details.previousGenre,
        i.details.songTitle,
      ]),
    ).toEqual([
      ['ROCK', 'POP', 'Cancion A'],
      ['POP', null, 'Cancion A'],
    ]);
    const [{ count }] = await dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*) AS count FROM tunio.activity_events
        WHERE event_type = 'ADMIN_ACTION' AND song_id = $1 AND details->>'action' = 'GENRE_SET'`,
      [songs.A.id],
    );
    expect(Number(count)).toBe(2);
  });

  it('la cobertura y la lista reflejan la clasificacion', async () => {
    const coverage = await get('/genres/coverage').expect(200);
    expect(coverage.body.data).toEqual({
      totalRequests: 4,
      classifiedRequests: 2,
      coveragePercent: 50,
    });
    const list = await get('/genres/unclassified-songs').expect(200);
    expect(
      list.body.data.items.map((i: { songId: string }) => i.songId),
    ).toEqual([songs.C.id, songs.B.id]);
  });

  it('solo canciones del local', async () => {
    await put(otherBar, songs.B.id, 'POP', otherBar.tokens.admin).expect(404);
    await put(bar, songs.E.id, 'POP', bar.tokens.admin).expect(404);
    await put(bar, randomUUID(), 'POP', bar.tokens.admin).expect(404);
    await put(bar, 'not-a-uuid', 'POP', bar.tokens.admin).expect(400);
    const fromPlaylist = await put(
      bar,
      songs.D.id,
      'VALLENATO',
      bar.tokens.admin,
    ).expect(200);
    expect(fromPlaylist.body.data.genre).toBe('VALLENATO');
    // Un rechazo no deja bitacora.
    const actions = await get('/admin-actions?limit=10').expect(200);
    expect(
      (actions.body.data.items as Array<{ action: string }>).filter(
        (i) => i.action === 'GENRE_SET',
      ),
    ).toHaveLength(3);
  });
});
