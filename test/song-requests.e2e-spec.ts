import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Song } from '../src/catalog/entities/song.entity';
import { SongsService } from '../src/catalog/songs.service';
import { DevicesService } from '../src/devices/devices.service';
import { BlockedSong } from '../src/moderation/entities/blocked-song.entity';
import { QueueItem } from '../src/queue/entities/queue-item.entity';
import { Vote } from '../src/queue/entities/vote.entity';
import { StaffUser } from '../src/staff/entities/staff-user.entity';
import {
  authed,
  createTestApp,
  createVenueWithStaff,
  VenueFixture,
} from './e2e-helpers';

const CONCURRENT_DEVICES = 8;
// TUNIO_MAX_REQUESTS_PER_HOUR en .env.test.
const MAX_REQUESTS_PER_HOUR = 5;

describe('Song requests (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let bar: VenueFixture;
  let closedBar: VenueFixture;
  let qrToken: string;
  let closedQrToken: string;
  let sessionId: string;
  let videoCounter = 0;

  // Ids de 11 caracteres unicos en toda la corrida.
  async function createSong(): Promise<Song> {
    videoCounter += 1;
    return dataSource.getRepository(Song).save({
      youtubeVideoId: `sr-e2e-${String(videoCounter).padStart(4, '0')}`,
      title: `Cancion ${videoCounter}`,
      durationSeconds: 200,
    });
  }

  function request(song: Song, installationId: string, token = qrToken) {
    return authed(app, 'post', `/qr/${token}/requests`).send({
      installationId,
      youtubeVideoId: song.youtubeVideoId,
    });
  }

  async function generateQr(fixture: VenueFixture): Promise<string> {
    const response = await authed(
      app,
      'post',
      `/venues/${fixture.venue.id}/qr/regenerate`,
      fixture.tokens.admin,
    ).expect(200);
    return response.body.data.publicToken as string;
  }

  const sessionPath = (action: string) =>
    `/venues/${bar.venue.id}/sessions/${sessionId}/${action}`;

  const countEvents = async (eventType: string, songId: string) =>
    Number(
      (
        await dataSource.query<Array<{ count: string }>>(
          `SELECT COUNT(*) AS count FROM tunio.activity_events
            WHERE event_type = $1 AND song_id = $2`,
          [eventType, songId],
        )
      )[0].count,
    );

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    bar = await createVenueWithStaff(app, 'requests-e2e-bar', [
      ['admin', 'ADMIN'],
    ]);
    closedBar = await createVenueWithStaff(app, 'requests-e2e-closed', [
      ['admin', 'ADMIN'],
    ]);
    qrToken = await generateQr(bar);
    closedQrToken = await generateQr(closedBar);
    const session = await authed(
      app,
      'post',
      `/venues/${bar.venue.id}/sessions`,
      bar.tokens.admin,
    )
      .send({})
      .expect(201);
    sessionId = session.body.data.id as string;

    // Sin YouTube: la cancion ya existe en la base y se da por reproducible.
    jest
      .spyOn(app.get(SongsService), 'resolvePlayableSong')
      .mockImplementation((youtubeVideoId: string) =>
        dataSource.getRepository(Song).findOneByOrFail({ youtubeVideoId }),
      );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('pedir y votar', () => {
    let song: Song;
    const firstDevice = randomUUID();
    const secondDevice = randomUUID();

    it('una cancion que no esta en la cola entra con 1 voto', async () => {
      song = await createSong();

      const response = await request(song, firstDevice).expect(200);

      expect(response.body.data).toMatchObject({
        outcome: 'REQUESTED',
        voteCount: 1,
      });
      const item = await dataSource.getRepository(QueueItem).findOneByOrFail({
        id: response.body.data.queueItemId as string,
      });
      expect(item).toMatchObject({ sessionId, status: 'PENDING' });
      await expect(
        dataSource
          .getRepository(Vote)
          .findBy({ queueItemId: item.id, origin: 'REQUEST' }),
      ).resolves.toHaveLength(1);
      expect(await countEvents('SONG_REQUESTED', song.id)).toBe(1);
    });

    it('pedirla otra vez desde otro telefono es un voto', async () => {
      const response = await request(song, secondDevice).expect(200);

      expect(response.body.data).toMatchObject({
        outcome: 'VOTED',
        voteCount: 2,
      });
      expect(await countEvents('VOTE_CAST', song.id)).toBe(1);
    });

    it('el mismo telefono no puede votar dos veces: 409 y evento de rechazo', async () => {
      const response = await request(song, secondDevice).expect(409);

      expect(response.body.error.message).toBe(
        'You already voted for this song',
      );
      expect(await countEvents('VOTE_REJECTED', song.id)).toBe(1);
      const [{ votes }] = await dataSource.query<Array<{ votes: string }>>(
        `SELECT COUNT(*) AS votes FROM tunio.votes v
           JOIN tunio.queue_items q ON q.id = v.queue_item_id
          WHERE q.song_id = $1`,
        [song.id],
      );
      expect(Number(votes)).toBe(2);
    });

    it('la cola trae el video de cada entrada, para votar desde ella', async () => {
      const response = await authed(app, 'get', `/qr/${qrToken}/queue`)
        .set('X-Installation-Id', firstDevice)
        .expect(200);

      const entry = (
        response.body.data.entries as Array<{ songId: string }>
      ).find((candidate) => candidate.songId === song.id);
      expect(entry).toMatchObject({
        youtubeVideoId: song.youtubeVideoId,
        votedByDevice: true,
      });
    });
  });

  describe('concurrencia', () => {
    // Sin esto la prueba no demuestra nada: cada transaccion dura tan poco
    // que las peticiones llegan en fila y la carrera nunca ocurre. La barrera
    // retiene las primeras N transacciones justo antes de buscar la entrada
    // de cola y las suelta a la vez, cuando ninguna puede verla todavia.
    function holdTransactionsUntilAllArrive(count: number): jest.SpyInstance {
      const devices = app.get(DevicesService);
      const original = devices.identifyDevice.bind(devices);
      let arrived = 0;
      let releaseAll!: () => void;
      const allArrived = new Promise<void>((resolve) => (releaseAll = resolve));
      return jest
        .spyOn(devices, 'identifyDevice')
        .mockImplementation(async (...args) => {
          const deviceId = await original(...args);
          arrived += 1;
          if (arrived === count) {
            releaseAll();
          }
          // Los reintentos (llegada N+1 en adelante) pasan sin esperar.
          if (arrived <= count) {
            await allArrived;
          }
          return deviceId;
        });
    }

    it(`${CONCURRENT_DEVICES} solicitudes simultaneas de la misma cancion dan una entrada con ${CONCURRENT_DEVICES} votos`, async () => {
      const song = await createSong();
      const barrier = holdTransactionsUntilAllArrive(CONCURRENT_DEVICES);

      const responses = await Promise.all(
        Array.from({ length: CONCURRENT_DEVICES }, () =>
          request(song, randomUUID()),
        ),
      );
      const identifyCalls = barrier.mock.calls.length;
      barrier.mockRestore();
      // La carrera ocurrio de verdad: hubo transacciones que perdieron contra
      // el indice y se reintentaron como voto.
      expect(identifyCalls).toBeGreaterThan(CONCURRENT_DEVICES);

      expect(responses.map((response) => response.status)).toEqual(
        Array(CONCURRENT_DEVICES).fill(200),
      );
      const outcomes = responses.map(
        (response) => response.body.data.outcome as string,
      );
      expect(
        outcomes.filter((outcome) => outcome === 'REQUESTED'),
      ).toHaveLength(1);
      const items = await dataSource
        .getRepository(QueueItem)
        .findBy({ sessionId, songId: song.id });
      expect(items).toHaveLength(1);
      await expect(
        dataSource.getRepository(Vote).countBy({ queueItemId: items[0].id }),
      ).resolves.toBe(CONCURRENT_DEVICES);
      // Todas las respuestas apuntan a la misma entrada.
      expect(
        new Set(responses.map((response) => response.body.data.queueItemId)),
      ).toEqual(new Set([items[0].id]));
    });

    it('el mismo telefono votando a la vez varias veces cuenta un solo voto', async () => {
      const song = await createSong();
      await request(song, randomUUID()).expect(200);
      const device = randomUUID();

      const responses = await Promise.all(
        Array.from({ length: CONCURRENT_DEVICES }, () => request(song, device)),
      );

      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([
        200,
        ...Array<number>(CONCURRENT_DEVICES - 1).fill(409),
      ]);
      const [item] = await dataSource
        .getRepository(QueueItem)
        .findBy({ sessionId, songId: song.id });
      await expect(
        dataSource.getRepository(Vote).countBy({ queueItemId: item.id }),
      ).resolves.toBe(2);
    });
  });

  describe('validaciones', () => {
    it('con el servicio pausado no se acepta nada, y al reanudar si', async () => {
      const song = await createSong();
      await authed(app, 'post', sessionPath('pause'), bar.tokens.admin).expect(
        200,
      );

      const response = await request(song, randomUUID()).expect(409);
      expect(response.body.error.message).toBe('The service is paused');
      await expect(
        dataSource.getRepository(QueueItem).countBy({ songId: song.id }),
      ).resolves.toBe(0);

      await authed(app, 'post', sessionPath('resume'), bar.tokens.admin).expect(
        200,
      );
      await request(song, randomUUID()).expect(200);
    });

    it('una cancion bloqueada se rechaza con el motivo', async () => {
      const song = await createSong();
      const admin = await dataSource
        .getRepository(StaffUser)
        .findOneByOrFail({ email: 'admin@requests-e2e-bar.test' });
      await dataSource.getRepository(BlockedSong).save({
        venueId: bar.venue.id,
        songId: song.id,
        blockedByStaffId: admin.id,
        reason: 'No va con la noche',
        expiresAt: new Date(Date.now() + 3_600_000),
      });

      const response = await request(song, randomUUID()).expect(403);
      expect(response.body.error.message).toBe(
        'This song is blocked in the venue: No va con la noche',
      );
    });

    it('un bloqueo vencido ya no impide pedirla', async () => {
      const song = await createSong();
      const admin = await dataSource
        .getRepository(StaffUser)
        .findOneByOrFail({ email: 'admin@requests-e2e-bar.test' });
      await dataSource.getRepository(BlockedSong).save({
        venueId: bar.venue.id,
        songId: song.id,
        blockedByStaffId: admin.id,
        blockedAt: new Date(Date.now() - 7_200_000),
        expiresAt: new Date(Date.now() - 3_600_000),
      });

      await request(song, randomUUID()).expect(200);
    });

    it(`el limite es de ${MAX_REQUESTS_PER_HOUR} solicitudes por hora; votar sigue permitido`, async () => {
      const device = randomUUID();
      for (let i = 0; i < MAX_REQUESTS_PER_HOUR; i++) {
        await request(await createSong(), device).expect(200);
      }

      const response = await request(await createSong(), device).expect(429);
      expect(response.body.error.message).toBe(
        `Request limit reached: ${MAX_REQUESTS_PER_HOUR} per hour`,
      );

      const popular = await createSong();
      await request(popular, randomUUID()).expect(200);
      const vote = await request(popular, device).expect(200);
      expect(vote.body.data.outcome).toBe('VOTED');
    });

    it('sin sesion abierta responde 409', async () => {
      const song = await createSong();
      const response = await request(song, randomUUID(), closedQrToken).expect(
        409,
      );
      expect(response.body.error.message).toBe('The venue has no open session');
    });

    it('datos mal formados responden 400', async () => {
      await authed(app, 'post', `/qr/${qrToken}/requests`)
        .send({ installationId: 'not-a-uuid', youtubeVideoId: 'Nmb80HXWsFQ' })
        .expect(400);
      await authed(app, 'post', `/qr/${qrToken}/requests`)
        .send({ installationId: randomUUID(), youtubeVideoId: 'too-short' })
        .expect(400);
    });
  });

  it('un telefono registrado antes de abrir la sesion se adhiere al pedir', async () => {
    const device = randomUUID();
    // Lo registra en el otro local, que no tiene sesion abierta.
    await authed(app, 'post', `/qr/${closedQrToken}/devices`)
      .send({ installationId: device })
      .expect(200);
    const session = await authed(
      app,
      'post',
      `/venues/${closedBar.venue.id}/sessions`,
      closedBar.tokens.admin,
    )
      .send({})
      .expect(201);
    const closedBarSessionId = session.body.data.id as string;

    await request(await createSong(), device, closedQrToken).expect(200);

    const [{ count }] = await dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*) AS count FROM tunio.activity_events
        WHERE session_id = $1 AND event_type = 'DEVICE_JOINED'`,
      [closedBarSessionId],
    );
    expect(Number(count)).toBe(1);
  });
});
