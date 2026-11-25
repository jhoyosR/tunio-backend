import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { ActivityEventsService } from '../src/activity/activity-events.service';
import { Song } from '../src/catalog/entities/song.entity';
import { AnonymousDevice } from '../src/devices/entities/anonymous-device.entity';
import { DefaultPlaylist } from '../src/playlists/entities/default-playlist.entity';
import { QueueItem } from '../src/queue/entities/queue-item.entity';
import { SessionDevice } from '../src/sessions/entities/session-device.entity';
import {
  authed,
  createTestApp,
  createVenueWithStaff,
  VenueFixture,
} from './e2e-helpers';

const CONCURRENT_OPENS = 5;

describe('Sessions (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let barA: VenueFixture;
  let barB: VenueFixture;
  let playlist: DefaultPlaylist;

  const sessionsPath = (fixture: VenueFixture) =>
    `/venues/${fixture.venue.id}/sessions`;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    barA = await createVenueWithStaff(app, 'sessions-e2e-bar-a', [
      ['admin-a', 'ADMIN'],
      ['dj-a', 'DJ'],
    ]);
    barB = await createVenueWithStaff(app, 'sessions-e2e-bar-b', [
      ['dj-b', 'DJ'],
    ]);
    playlist = await dataSource
      .getRepository(DefaultPlaylist)
      .save({ venueId: barA.venue.id, name: 'Lista A' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('sin sesion abierta, la actual es null', async () => {
    const response = await authed(
      app,
      'get',
      `${sessionsPath(barA)}/current`,
      barA.tokens['dj-a'],
    ).expect(200);
    expect(response.body.data).toBeNull();
  });

  describe('ciclo completo', () => {
    let sessionId: string;

    it('el DJ abre la sesion con la lista por defecto del local', async () => {
      const response = await authed(
        app,
        'post',
        sessionsPath(barA),
        barA.tokens['dj-a'],
      )
        .send({ eventName: '  Viernes crossover ' })
        .expect(201);

      expect(response.body.data).toMatchObject({
        status: 'ACTIVE',
        eventName: 'Viernes crossover',
        endedAt: null,
        defaultPlaylistId: playlist.id,
      });
      sessionId = response.body.data.id as string;
    });

    it('no se puede abrir una segunda sesion en el mismo local', () => {
      return authed(app, 'post', sessionsPath(barA), barA.tokens['admin-a'])
        .send({})
        .expect(409);
    });

    it('pausar y reanudar alternan el estado', async () => {
      const path = `${sessionsPath(barA)}/${sessionId}`;
      const paused = await authed(
        app,
        'post',
        `${path}/pause`,
        barA.tokens['dj-a'],
      ).expect(200);
      expect(paused.body.data.status).toBe('PAUSED');

      await authed(app, 'post', `${path}/pause`, barA.tokens['dj-a']).expect(
        409,
      );

      const resumed = await authed(
        app,
        'post',
        `${path}/resume`,
        barA.tokens['dj-a'],
      ).expect(200);
      expect(resumed.body.data.status).toBe('ACTIVE');
    });

    it('otro local no puede tocar la sesion, ni por su ruta ni por la nuestra', async () => {
      await authed(
        app,
        'post',
        `${sessionsPath(barB)}/${sessionId}/close`,
        barB.tokens['dj-b'],
      ).expect(404);
      await authed(
        app,
        'post',
        `${sessionsPath(barA)}/${sessionId}/close`,
        barB.tokens['dj-b'],
      ).expect(403);
    });

    it('al cerrar, las entradas pendientes quedan como no reproducidas', async () => {
      const queueItemId = await createPendingQueueItem(sessionId);

      const response = await authed(
        app,
        'post',
        `${sessionsPath(barA)}/${sessionId}/close`,
        barA.tokens['admin-a'],
      ).expect(200);
      expect(response.body.data.status).toBe('CLOSED');
      expect(response.body.data.endedAt).not.toBeNull();

      const [unplayed] = await dataSource.query<Array<{ reason: string }>>(
        `SELECT reason FROM tunio.v_unplayed_requests WHERE queue_item_id = $1`,
        [queueItemId],
      );
      expect(unplayed.reason).toBe('La sesión cerró antes de su turno');
    });

    it('cada cambio de estado deja su evento, con quien lo hizo', async () => {
      const events = await dataSource.query<
        Array<{
          event_type: string;
          venue_id: string;
          actor: string;
          action: string | null;
        }>
      >(
        `SELECT e.event_type, e.venue_id, s.display_name AS actor,
                e.details->>'action' AS action
           FROM tunio.activity_events e
           JOIN tunio.staff_users s ON s.id = e.staff_user_id
          WHERE e.session_id = $1
          ORDER BY e.id`,
        [sessionId],
      );
      // La segunda pausa respondio 409: no deja evento. Cada cambio emite
      // ademas ADMIN_ACTION con la accion de la bitacora (BE-20).
      expect(events).toEqual(
        [
          ['SESSION_ACTIVE', 'dj-a', null],
          ['ADMIN_ACTION', 'dj-a', 'SESSION_OPEN'],
          ['SESSION_PAUSED', 'dj-a', null],
          ['ADMIN_ACTION', 'dj-a', 'SESSION_PAUSE'],
          ['SESSION_ACTIVE', 'dj-a', null],
          ['ADMIN_ACTION', 'dj-a', 'SESSION_RESUME'],
          ['SESSION_CLOSED', 'admin-a', null],
          ['ADMIN_ACTION', 'admin-a', 'SESSION_CLOSE'],
        ].map(([eventType, actor, action]) => ({
          event_type: eventType,
          venue_id: barA.venue.id,
          actor,
          action,
        })),
      );
    });

    it('una sesion cerrada no se puede reabrir ni pausar', async () => {
      const path = `${sessionsPath(barA)}/${sessionId}`;
      await authed(app, 'post', `${path}/resume`, barA.tokens['dj-a']).expect(
        409,
      );
      await authed(app, 'post', `${path}/pause`, barA.tokens['dj-a']).expect(
        409,
      );
    });

    it('tras cerrar, se puede abrir la sesion de otra noche', async () => {
      const response = await authed(
        app,
        'post',
        sessionsPath(barA),
        barA.tokens['dj-a'],
      )
        .send({})
        .expect(201);
      expect(response.body.data.eventName).toBeNull();
    });
  });

  it('aperturas simultaneas dejan una sola sesion abierta', async () => {
    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_OPENS }, () =>
        authed(app, 'post', sessionsPath(barB), barB.tokens['dj-b']).send({}),
      ),
    );

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409]);

    // Las aperturas rechazadas no dejan evento.
    const [{ count }] = await dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*) AS count FROM tunio.activity_events
        WHERE venue_id = $1 AND event_type = 'SESSION_ACTIVE'`,
      [barB.venue.id],
    );
    expect(Number(count)).toBe(1);
  });

  // Sin disparadores, esto es lo que garantiza que no haya hechos sin evento.
  it('si el evento no se puede escribir, el cambio de estado tampoco se aplica', async () => {
    const currentPath = `${sessionsPath(barB)}/current`;
    const current = await authed(
      app,
      'get',
      currentPath,
      barB.tokens['dj-b'],
    ).expect(200);
    const sessionId = current.body.data.id as string;
    const recordSpy = jest
      .spyOn(app.get(ActivityEventsService), 'record')
      .mockRejectedValueOnce(new Error('event store unavailable'));

    await authed(
      app,
      'post',
      `${sessionsPath(barB)}/${sessionId}/pause`,
      barB.tokens['dj-b'],
    ).expect(500);
    recordSpy.mockRestore();

    const after = await authed(
      app,
      'get',
      currentPath,
      barB.tokens['dj-b'],
    ).expect(200);
    expect(after.body.data.status).toBe('ACTIVE');
  });

  it('un id de sesion mal formado responde 400', () => {
    return authed(
      app,
      'post',
      `${sessionsPath(barA)}/not-a-uuid/close`,
      barA.tokens['dj-a'],
    ).expect(400);
  });

  // Entrada PENDING minima: dispositivo adherido a la sesion y una cancion.
  async function createPendingQueueItem(sessionId: string): Promise<string> {
    const venueId = barA.venue.id;
    const device = await dataSource
      .getRepository(AnonymousDevice)
      .save({ venueId, deviceHash: 'a'.repeat(64) });
    await dataSource
      .getRepository(SessionDevice)
      .save({ sessionId, deviceId: device.id, venueId });
    const song = await dataSource.getRepository(Song).save({
      youtubeVideoId: 'sessions-e2e-video',
      title: 'Cancion de prueba',
      durationSeconds: 200,
    });
    const queueItem = await dataSource.getRepository(QueueItem).save({
      sessionId,
      songId: song.id,
      requestedByDeviceId: device.id,
    });
    return queueItem.id;
  }
});
