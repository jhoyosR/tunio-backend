import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Song } from '../src/catalog/entities/song.entity';
import { SongsService } from '../src/catalog/songs.service';
import {
  authed,
  createTestApp,
  createVenueWithStaff,
  VenueFixture,
} from './e2e-helpers';

const TIMEZONE = 'America/Bogota';

// Cinco noches de un mismo local, construidas por la API y movidas despues
// en el calendario (solo started_at), para probar las definiciones de
// docs/08 con cifras que se pueden contar a mano.
describe('Analytics (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let bar: VenueFixture;
  let otherBar: VenueFixture;
  let qrToken: string;
  let songCounter = 0;
  const sessions: string[] = [];
  const songs: Song[] = [];
  // Telefonos que vuelven todas las noches: cuentan una vez en el periodo.
  const regulars = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const newcomer = randomUUID();

  async function createSong(): Promise<Song> {
    songCounter += 1;
    return dataSource.getRepository(Song).save({
      youtubeVideoId: `an-e2e-${String(songCounter).padStart(4, '0')}`,
      title: `Cancion ${songCounter}`,
      durationSeconds: 200,
    });
  }

  const ask = (song: Song, installationId: string) =>
    authed(app, 'post', `/qr/${qrToken}/requests`)
      .send({ installationId, youtubeVideoId: song.youtubeVideoId })
      .expect(200);

  const staff = (
    method: 'get' | 'post',
    path: string,
    token = bar.tokens.admin,
  ) => authed(app, method, `/venues/${bar.venue.id}${path}`, token);

  async function openSession(): Promise<string> {
    const response = await staff('post', '/sessions').send({}).expect(201);
    sessions.push(response.body.data.id as string);
    return response.body.data.id as string;
  }

  const closeSession = (id: string) =>
    staff('post', `/sessions/${id}/close`).expect(200);

  // Mueve el inicio de la sesion a otro dia local, a una hora dada.
  async function moveStart(id: string, daysAgo: number, localTime: string) {
    await dataSource.query(
      `UPDATE tunio.music_sessions
          SET started_at = (CAST(CAST(now() AT TIME ZONE $2 AS date) - $3::int AS timestamp)
                            + CAST($4 AS time)) AT TIME ZONE $2
        WHERE id = $1`,
      [id, TIMEZONE, daysAgo, localTime],
    );
  }

  const localDay = (daysAgo: number) =>
    new Date(Date.now() - daysAgo * 86_400_000).toLocaleDateString('en-CA', {
      timeZone: TIMEZONE,
    });

  const get = (path: string, token = bar.tokens.admin) =>
    staff('get', `/analytics${path}`, token);

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    bar = await createVenueWithStaff(app, 'analytics-e2e-bar', [
      ['admin', 'ADMIN'],
      ['dj', 'DJ'],
    ]);
    otherBar = await createVenueWithStaff(app, 'analytics-e2e-other', [
      ['admin', 'ADMIN'],
    ]);
    const qr = await staff('post', '/qr/regenerate').expect(200);
    qrToken = qr.body.data.publicToken as string;
    jest
      .spyOn(app.get(SongsService), 'resolvePlayableSong')
      .mockImplementation((youtubeVideoId: string) =>
        dataSource.getRepository(Song).findOneByOrFail({ youtubeVideoId }),
      );
    for (let i = 0; i < 8; i += 1) {
      songs.push(await createSong());
    }

    // Noches 0, 1 y 2 (hace 10, 9 y 8 dias): los cuatro habituales piden
    // una cancion cada uno. 4 usuarios unicos por noche.
    for (const daysAgo of [10, 9, 8]) {
      const id = await openSession();
      for (const [index, phone] of regulars.entries()) {
        await ask(songs[index], phone);
      }
      await closeSession(id);
      await moveStart(id, daysAgo, '21:00');
    }

    // Noche 3: empieza AYER a las 23:30 y todo pasa despues de medianoche.
    // Un solo telefono: 25 % del promedio historico (4) → baja. Su pedida
    // queda pendiente al cerrar: «La sesion cerro antes de su turno». Lo pide
    // el recien llegado: todas las entradas se crean ahora, y los habituales
    // ya llevan 3 en la hora (TUNIO_MAX_REQUESTS_PER_HOUR = 5).
    const late = await openSession();
    await ask(songs[0], newcomer);
    await closeSession(late);
    await moveStart(late, 1, '23:30');

    // Noche 4: hoy, abierta. Cinco canciones con votos 4, 3, 2, 1, 1:
    // las 3 primeras acaparan 9 de 11 (81,8 %) → alerta. Suena la primera y
    // termina; una se bloquea.
    // Quien pide cada cancion va rotando, para que nadie pase del limite.
    await openSession();
    const tonight = [...regulars, newcomer];
    for (const [index, votes] of [4, 3, 2, 1, 1].entries()) {
      for (let k = 0; k < votes; k += 1) {
        await ask(songs[index + 3], tonight[(index + k) % tonight.length]);
      }
    }
    const next = await staff('post', '/player/next').expect(200);
    await staff(
      'post',
      `/player/playbacks/${next.body.data.playbackId}/complete`,
    ).expect(200);
    await staff('post', '/blocks').send({ songId: songs[7].id }).expect(201);

    await request(app.getHttpServer())
      .put(`/venues/${bar.venue.id}/songs/${songs[3].id}/genre`)
      .set('Authorization', `Bearer ${bar.tokens.admin}`)
      .send({ genre: 'SALSA' })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('filtro', () => {
    it('sesion o periodo, no las dos cosas', async () => {
      const response = await get(
        `/summary?sessionId=${sessions[0]}&from=${localDay(0)}`,
      ).expect(400);
      expect(response.body.error.message).toBe(
        'Filter by sessionId or by from/to, not both',
      );
    });

    it('la sesion de otro local no existe', async () => {
      await authed(
        app,
        'get',
        `/venues/${otherBar.venue.id}/analytics/summary?sessionId=${sessions[0]}`,
        otherBar.tokens.admin,
      ).expect(404);
    });

    it('el DJ ve el resumen y nada mas', async () => {
      await get('/summary', bar.tokens.dj).expect(200);
      await get('/popularity', bar.tokens.dj).expect(403);
      await get('/night-comparison', bar.tokens.dj).expect(403);
    });
  });

  describe('regla de la noche', () => {
    it('una noche que empezo ayer cuenta ayer, aunque sus hechos sean de hoy', async () => {
      const yesterday = await get(
        `/summary?from=${localDay(1)}&to=${localDay(1)}`,
      ).expect(200);
      expect(yesterday.body.data).toMatchObject({
        sessionCount: 1,
        songRequests: 1,
      });
      const today = await get(
        `/summary?from=${localDay(0)}&to=${localDay(0)}`,
      ).expect(200);
      expect(today.body.data).toMatchObject({
        sessionCount: 1,
        songRequests: 5,
      });
    });

    it('la cobertura de BE-21 sigue la misma regla', async () => {
      const coverage = await staff(
        'get',
        `/genres/coverage?from=${localDay(1)}&to=${localDay(1)}`,
      ).expect(200);
      expect(coverage.body.data.totalRequests).toBe(1);
    });
  });

  describe('descriptivos', () => {
    it('resumen de todo el historial: los unicos no se suman por noche', async () => {
      const response = await get('/summary').expect(200);
      expect(response.body.data).toMatchObject({
        sessionCount: 5,
        songRequests: 18,
        votes: { total: 24, fromRequests: 18, support: 6 },
        // 4 habituales + el recien llegado, no 4+4+4+1+5.
        uniqueDevices: 5,
        completedPlaybacks: 1,
        // Terminar la primera empieza la siguiente (decision 13): las dos
        // empezaron a sonar, asi que hay dos esperas medidas.
        waitSeconds: { measured: 2 },
      });
      expect(response.body.data.mostPopularSong).toMatchObject({
        songId: songs[3].id,
        totalVotes: 7,
      });
    });

    it('popularidad paginada, de mas a menos votos', async () => {
      const response = await get('/popularity?limit=2').expect(200);
      expect(
        response.body.data.items.map(
          (i: { totalVotes: number }) => i.totalVotes,
        ),
      ).toEqual([7, 4]);
      expect(response.body.data.meta.totalItems).toBe(8);
    });

    it('participacion por hora del dia', async () => {
      const response = await get(
        `/hourly-participation?sessionId=${sessions[4]}`,
      ).expect(200);
      const total = (response.body.data as Array<{ votes: number }>).reduce(
        (sum, h) => sum + h.votes,
        0,
      );
      expect(total).toBe(11);
    });

    it('historial de reproducciones, lo mas reciente primero', async () => {
      const response = await get(`/playbacks?sessionId=${sessions[4]}`).expect(
        200,
      );
      expect(
        response.body.data.items.map(
          (i: { songId: string; status: string }) => [i.songId, i.status],
        ),
      ).toEqual([
        [songs[4].id, 'PLAYING'],
        [songs[3].id, 'COMPLETED'],
      ]);
    });

    it('generos sobre el total, con «Sin clasificar» al final y su cobertura', async () => {
      const response = await get(`/genres?sessionId=${sessions[4]}`).expect(
        200,
      );
      expect(response.body.data).toEqual({
        buckets: [
          { genre: 'SALSA', label: 'Salsa', requests: 1, percent: 20 },
          { genre: null, label: 'Sin clasificar', requests: 4, percent: 80 },
        ],
        coverage: {
          totalRequests: 5,
          classifiedRequests: 1,
          coveragePercent: 20,
        },
      });
    });
  });

  describe('diagnosticos', () => {
    it('no reproducidas con su motivo', async () => {
      const response = await get('/unplayed-requests').expect(200);
      expect(response.body.data.byReason).toEqual(
        expect.arrayContaining([
          { reason: 'La sesión cerró antes de su turno', count: 13 },
          { reason: 'Bloqueada por el personal', count: 1 },
        ]),
      );
      expect(response.body.data.meta.totalItems).toBe(14);
    });

    it('concentracion: alerta con 81,8 % y 5 canciones', async () => {
      const response = await get(
        `/vote-concentration?sessionId=${sessions[4]}`,
      ).expect(200);
      expect(response.body.data).toEqual([
        expect.objectContaining({
          totalVotes: 11,
          top3Votes: 9,
          top3SharePct: 81.8,
          votedSongs: 5,
          alert: true,
        }),
      ]);
      const small = await get(
        `/vote-concentration?sessionId=${sessions[3]}`,
      ).expect(200);
      expect(small.body.data[0]).toMatchObject({
        top3SharePct: 100,
        alert: false,
      });
    });

    it('baja participacion frente a las noches cerradas anteriores', async () => {
      const response = await get('/low-participation').expect(200);
      const levels = (
        response.body.data as Array<{
          sessionId: string;
          level: string;
          ratioPct: number | null;
        }>
      ).map((s) => [s.sessionId, s.level, s.ratioPct]);
      // Solo cerradas, de la mas reciente a la mas antigua.
      expect(levels).toEqual([
        [sessions[3], 'LOW', 25],
        [sessions[2], 'INSUFFICIENT_HISTORY', null],
        [sessions[1], 'INSUFFICIENT_HISTORY', null],
        [sessions[0], 'INSUFFICIENT_HISTORY', null],
      ]);
    });
  });

  it('comparativo: solo noches cerradas, con su fecha local', async () => {
    const response = await get('/night-comparison').expect(200);
    const nights = response.body.data as Array<{
      sessionId: string;
      nightDate: string;
      songRequests: number;
    }>;
    expect(
      nights.map((n) => [n.sessionId, n.nightDate, n.songRequests]),
    ).toEqual([
      [sessions[3], localDay(1), 1],
      [sessions[2], localDay(8), 4],
      [sessions[1], localDay(9), 4],
      [sessions[0], localDay(10), 4],
    ]);
  });
});
