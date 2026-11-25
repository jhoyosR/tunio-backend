import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { seedDatabase } from '../src/database/seeds/seed';
import {
  POP_ROCK_SONGS,
  TROPICAL_SONGS,
} from '../src/database/seeds/seed-catalog';
import { createTestApp } from './e2e-helpers';

const PASSWORD = 'seed-e2e-password';
const SEEDED_SLUGS = ['taberna-el-faro', 'discoteca-la-terraza'];

describe('Seed (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  async function counts(): Promise<Record<string, number>> {
    const [row] = await dataSource.query<Array<Record<string, string>>>(
      `SELECT
         (SELECT COUNT(*) FROM tunio.venues WHERE slug = ANY($1)) AS venues,
         (SELECT COUNT(*) FROM tunio.venue_staff vs
            JOIN tunio.venues v ON v.id = vs.venue_id
           WHERE v.slug = ANY($1)) AS staff,
         (SELECT COUNT(*) FROM tunio.qr_access q
            JOIN tunio.venues v ON v.id = q.venue_id
           WHERE v.slug = ANY($1)) AS qr,
         (SELECT COUNT(*) FROM tunio.default_playlist_tracks t
            JOIN tunio.venues v ON v.id = t.venue_id
           WHERE v.slug = ANY($1)) AS tracks,
         (SELECT COUNT(*) FROM tunio.songs
           WHERE youtube_video_id = ANY($2)) AS songs`,
      [
        SEEDED_SLUGS,
        [...TROPICAL_SONGS, ...POP_ROCK_SONGS].map((s) => s.youtubeVideoId),
      ],
    );
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, Number(value)]),
    );
  }

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('crea dos locales con un ADMIN y un DJ, su QR, su lista y el catalogo', async () => {
    const venues = await seedDatabase(dataSource, PASSWORD);

    expect(venues).toHaveLength(2);
    expect(await counts()).toEqual({
      venues: 2,
      staff: 4,
      qr: 2,
      tracks: TROPICAL_SONGS.length + POP_ROCK_SONGS.length,
      songs: TROPICAL_SONGS.length + POP_ROCK_SONGS.length,
    });
  });

  it('volver a ejecutarlo no duplica nada ni cambia el QR', async () => {
    const before = await seedDatabase(dataSource, PASSWORD);
    const after = await seedDatabase(dataSource, PASSWORD);

    expect(after.map((v) => v.qrToken)).toEqual(before.map((v) => v.qrToken));
    expect((await counts()).tracks).toBe(
      TROPICAL_SONGS.length + POP_ROCK_SONGS.length,
    );
  });

  it('la lista conserva el orden del catalogo, sin huecos', async () => {
    const tracks = await dataSource.query<
      Array<{ position: number; youtube_video_id: string }>
    >(
      `SELECT t.position, s.youtube_video_id
         FROM tunio.default_playlist_tracks t
         JOIN tunio.venues v ON v.id = t.venue_id
         JOIN tunio.songs s ON s.id = t.song_id
        WHERE v.slug = 'taberna-el-faro'
        ORDER BY t.position`,
    );
    expect(tracks).toEqual(
      TROPICAL_SONGS.map((song, i) => ({
        position: i + 1,
        youtube_video_id: song.youtubeVideoId,
      })),
    );
  });

  it('el personal sembrado inicia sesion y opera solo su local', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'dj@taberna-el-faro.test', password: PASSWORD })
      .expect(200);
    const token = login.body.data.accessToken as string;
    const [faro, terraza] = await dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM tunio.venues WHERE slug = ANY($1) ORDER BY slug DESC`,
      [SEEDED_SLUGS],
    );

    await request(app.getHttpServer())
      .post(`/venues/${faro.id}/sessions`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/venues/${terraza.id}/sessions`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(403);
  });
});
