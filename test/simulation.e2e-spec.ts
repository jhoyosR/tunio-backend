import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Song } from '../src/catalog/entities/song.entity';
import { NightSimulator } from '../src/database/simulation/night-simulator';
import { DefaultPlaylistTrack } from '../src/playlists/entities/default-playlist-track.entity';
import { DefaultPlaylist } from '../src/playlists/entities/default-playlist.entity';
import {
  authed,
  createTestApp,
  createVenueWithStaff,
  VenueFixture,
} from './e2e-helpers';

const NIGHTS = 5;
const TIMEZONE = 'America/Bogota';

jest.setTimeout(300_000);

// Corre el simulador de verdad y comprueba que lo que deja cuadra: noches en
// su sitio del calendario, todo en el pasado y cada hecho con su evento.
describe('Night simulator (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let bar: VenueFixture;

  const scalar = async (sql: string): Promise<number> => {
    const [row] = await dataSource.query<Array<{ value: string }>>(sql, [
      bar.venue.id,
    ]);
    return Number(row.value);
  };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    bar = await createVenueWithStaff(app, 'simulation-e2e-bar', [
      ['admin', 'ADMIN'],
      ['dj', 'DJ'],
    ]);
    await authed(
      app,
      'post',
      `/venues/${bar.venue.id}/qr/regenerate`,
      bar.tokens.admin,
    ).expect(200);
    const songs = await dataSource.getRepository(Song).save(
      Array.from({ length: 12 }, (_, i) => ({
        youtubeVideoId: `sim-e2e-${String(i).padStart(3, '0')}`,
        title: `Simulada ${i}`,
        durationSeconds: 180 + i * 10,
      })),
    );
    const playlist = await dataSource
      .getRepository(DefaultPlaylist)
      .save({ venueId: bar.venue.id, name: 'Lista' });
    await dataSource.getRepository(DefaultPlaylistTrack).save(
      songs.slice(0, 3).map((song, i) => ({
        playlistId: playlist.id,
        venueId: bar.venue.id,
        songId: song.id,
        position: i + 1,
      })),
    );

    await new NightSimulator(app).run({
      venueSlug: 'simulation-e2e-bar',
      nights: NIGHTS,
      seed: 7,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('una noche cerrada por dia, de hace 5 dias a ayer, a las 21:00 y hasta las 02:00', async () => {
    const sessions = await dataSource.query<
      Array<{ day: string; opened: string; closed: string; status: string }>
    >(
      `SELECT CAST(CAST(started_at AT TIME ZONE $2 AS date) AS text) AS day,
              to_char(started_at AT TIME ZONE $2, 'HH24:MI') AS opened,
              to_char(ended_at AT TIME ZONE $2, 'HH24:MI') AS closed, status
       FROM tunio.music_sessions WHERE venue_id = $1 ORDER BY started_at`,
      [bar.venue.id, TIMEZONE],
    );
    const days = await dataSource.query<Array<{ day: string }>>(
      `SELECT CAST(CAST(now() AT TIME ZONE $1 AS date) - g AS text) AS day
       FROM generate_series($2::int, 1, -1) g`,
      [TIMEZONE, NIGHTS],
    );
    expect(sessions).toEqual(
      days.map(({ day }) => ({
        day,
        opened: '21:00',
        closed: '02:00',
        status: 'CLOSED',
      })),
    );
  });

  it('nada quedo con la hora real: todo cae dentro de su noche', async () => {
    const outside = await scalar(
      `SELECT COUNT(*) AS value
       FROM tunio.activity_events e
       JOIN tunio.music_sessions ms ON ms.id = e.session_id
       WHERE e.venue_id = $1
         AND (e.occurred_at < ms.started_at OR e.occurred_at > ms.ended_at)`,
    );
    expect(outside).toBe(0);
    const late = await scalar(
      `SELECT COUNT(*) AS value FROM tunio.votes v
       JOIN tunio.music_sessions ms ON ms.id = v.session_id
       WHERE ms.venue_id = $1 AND v.voted_at > ms.ended_at`,
    );
    expect(late).toBe(0);
  });

  it('cada hecho tiene su evento y su voto de solicitud (DAT-07)', async () => {
    const requests = await scalar(
      `SELECT COUNT(*) AS value FROM tunio.queue_items qi
       JOIN tunio.music_sessions ms ON ms.id = qi.session_id WHERE ms.venue_id = $1`,
    );
    expect(requests).toBeGreaterThan(50);
    expect(
      await scalar(
        `SELECT COUNT(*) AS value FROM tunio.votes v
         JOIN tunio.music_sessions ms ON ms.id = v.session_id
         WHERE ms.venue_id = $1 AND v.origin = 'REQUEST'`,
      ),
    ).toBe(requests);
    expect(
      await scalar(
        `SELECT COUNT(*) AS value FROM tunio.activity_events
         WHERE venue_id = $1 AND event_type = 'SONG_REQUESTED'`,
      ),
    ).toBe(requests);
    expect(
      await scalar(
        `SELECT COUNT(*) AS value FROM tunio.activity_events
         WHERE venue_id = $1 AND event_type = 'PLAYBACK_STARTED'`,
      ),
    ).toBe(
      await scalar(
        `SELECT COUNT(*) AS value FROM tunio.playbacks WHERE venue_id = $1`,
      ),
    );
    expect(
      await scalar(
        `SELECT COUNT(*) AS value FROM tunio.activity_events
         WHERE venue_id = $1 AND event_type = 'ADMIN_ACTION'`,
      ),
    ).toBe(
      await scalar(
        `SELECT COUNT(*) AS value FROM tunio.admin_actions WHERE venue_id = $1`,
      ),
    );
  });

  it('las reproducciones se encadenan sin solaparse', async () => {
    const overlaps = await scalar(
      `SELECT COUNT(*) AS value FROM (
         SELECT started_at, LAG(ended_at) OVER (PARTITION BY session_id ORDER BY started_at) AS previous_end
         FROM tunio.playbacks WHERE venue_id = $1) p
       WHERE p.started_at < p.previous_end`,
    );
    expect(overlaps).toBe(0);
  });

  it('el tablero tiene que mostrar: comparativo y una noche floja', async () => {
    const nights = await authed(
      app,
      'get',
      `/venues/${bar.venue.id}/analytics/night-comparison`,
      bar.tokens.admin,
    ).expect(200);
    expect(nights.body.data).toHaveLength(NIGHTS);
    const participation = await authed(
      app,
      'get',
      `/venues/${bar.venue.id}/analytics/low-participation`,
      bar.tokens.admin,
    ).expect(200);
    // La mas reciente es ayer; la floja, la penultima (anteayer).
    expect(
      (participation.body.data as Array<{ level: string }>).map((n) => n.level),
    ).toEqual([
      'NORMAL',
      'LOW',
      'INSUFFICIENT_HISTORY',
      'INSUFFICIENT_HISTORY',
      'INSUFFICIENT_HISTORY',
    ]);
  });

  it('no se puede simular encima de noches que ya existen', async () => {
    await expect(
      new NightSimulator(app).run({
        venueSlug: 'simulation-e2e-bar',
        nights: NIGHTS,
        seed: 7,
      }),
    ).rejects.toThrow('already has sessions');
  });
});
