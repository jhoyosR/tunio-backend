import { ConsoleLogger, INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  SEARCH_QUOTA_COST,
  SearchResult,
  YoutubeClient,
} from '../src/catalog/youtube.client';
import {
  currentQuotaDate,
  YoutubeQuotaService,
} from '../src/catalog/youtube-quota.service';
import {
  authed,
  createTestApp,
  createVenueWithStaff,
  VenueFixture,
} from './e2e-helpers';

const CONCURRENT_SEARCHES = 5;

const result = (id: string): SearchResult => ({
  youtubeVideoId: id,
  title: `Title ${id}`,
  channelTitle: 'Channel',
  durationSeconds: 200,
  thumbnailUrl: null,
});

describe('Search (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let barA: VenueFixture;
  let barB: VenueFixture;
  let qrToken: string;
  let searchSpy: jest.SpyInstance;
  const serverOutput: string[] = [];
  let stdoutSpy: jest.SpyInstance;

  const searchFromQr = (q: string, token = qrToken) =>
    authed(app, 'get', `/qr/${token}/search`).query({ q });

  async function unitsConsumed(): Promise<number> {
    const rows = await dataSource.query<Array<{ units_consumed: number }>>(
      `SELECT units_consumed FROM tunio.youtube_quota_usage WHERE usage_date = $1`,
      [currentQuotaDate()],
    );
    return rows[0]?.units_consumed ?? 0;
  }

  beforeAll(async () => {
    stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: unknown) => {
        serverOutput.push(String(chunk));
        return true;
      });
    app = await createTestApp(new ConsoleLogger({ json: true }));
    dataSource = app.get(DataSource);
    barA = await createVenueWithStaff(app, 'search-e2e-bar-a', [
      ['admin', 'ADMIN'],
      ['dj', 'DJ'],
    ]);
    barB = await createVenueWithStaff(app, 'search-e2e-bar-b', [
      ['admin', 'ADMIN'],
    ]);
    const qr = await authed(
      app,
      'post',
      `/venues/${barA.venue.id}/qr/regenerate`,
      barA.tokens.admin,
    ).expect(200);
    qrToken = qr.body.data.publicToken as string;
  });

  beforeEach(() => {
    // Ninguna prueba llama a YouTube de verdad.
    searchSpy = jest
      .spyOn(app.get(YoutubeClient), 'searchVideos')
      .mockResolvedValue([result('v1'), result('v2')]);
  });

  afterEach(() => searchSpy.mockRestore());

  afterAll(async () => {
    await app.close();
    stdoutSpy.mockRestore();
  });

  it('busca en YouTube, cobra la cuota y guarda la consulta normalizada', async () => {
    const before = await unitsConsumed();

    const response = await searchFromQr('  Salsa   CLÁSICA ').expect(200);

    expect(response.body.data).toEqual({
      results: [result('v1'), result('v2')],
      catalogLimited: false,
    });
    expect(searchSpy).toHaveBeenCalledWith('salsa clasica');
    expect(await unitsConsumed()).toBe(before + SEARCH_QUOTA_COST);
    const [cached] = await dataSource.query<
      Array<{ results: SearchResult[]; hit_count: number }>
    >(
      `SELECT results, hit_count FROM tunio.youtube_search_cache
        WHERE query_normalized = 'salsa clasica'`,
    );
    expect(cached).toEqual({
      results: [result('v1'), result('v2')],
      hit_count: 0,
    });
  });

  it('la misma consulta, escrita distinto, sale de la cache sin gastar cuota', async () => {
    const before = await unitsConsumed();

    const response = await searchFromQr('salsa clasica').expect(200);

    expect(response.body.data.results).toHaveLength(2);
    expect(searchSpy).not.toHaveBeenCalled();
    expect(await unitsConsumed()).toBe(before);
    const [{ hit_count }] = await dataSource.query<
      Array<{ hit_count: number }>
    >(
      `SELECT hit_count FROM tunio.youtube_search_cache
        WHERE query_normalized = 'salsa clasica'`,
    );
    expect(hit_count).toBe(1);
  });

  it('una consulta de menos de 3 caracteres se rechaza sin buscar', async () => {
    await searchFromQr('  a  ').expect(400);
    await searchFromQr('ab').expect(400);
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('el personal busca desde su local, pero no desde otro', async () => {
    await authed(app, 'get', `/venues/${barA.venue.id}/search`, barA.tokens.dj)
      .query({ q: 'merengue' })
      .expect(200);
    await authed(
      app,
      'get',
      `/venues/${barA.venue.id}/search`,
      barB.tokens.admin,
    )
      .query({ q: 'merengue' })
      .expect(403);
    await authed(app, 'get', `/venues/${barA.venue.id}/search`)
      .query({ q: 'merengue' })
      .expect(401);
  });

  it('con el QR desactivado o desconocido no se gasta cuota', async () => {
    const before = await unitsConsumed();
    await searchFromQr(
      'bachata',
      '00000000-0000-4000-8000-000000000000',
    ).expect(404);
    await authed(app, 'patch', `/venues/${barA.venue.id}/qr`, barA.tokens.admin)
      .send({ isEnabled: false })
      .expect(200);

    await searchFromQr('bachata').expect(403);

    await authed(app, 'patch', `/venues/${barA.venue.id}/qr`, barA.tokens.admin)
      .send({ isEnabled: true })
      .expect(200);
    expect(searchSpy).not.toHaveBeenCalled();
    expect(await unitsConsumed()).toBe(before);
  });

  it('busquedas simultaneas no pasan el tope de cuota', async () => {
    const budget = app.get(YoutubeQuotaService).searchBudget;
    // Queda cuota para dos busquedas exactas.
    await dataSource.query(
      `INSERT INTO tunio.youtube_quota_usage (usage_date, units_consumed)
       VALUES ($1, $2)
       ON CONFLICT (usage_date) DO UPDATE SET units_consumed = EXCLUDED.units_consumed`,
      [currentQuotaDate(), budget - 2 * SEARCH_QUOTA_COST],
    );

    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_SEARCHES }, (_, i) =>
        searchFromQr(`concurrent query ${i}`).expect(200),
      ),
    );

    const limited = responses.filter(
      (response) => response.body.data.catalogLimited,
    );
    expect(limited).toHaveLength(CONCURRENT_SEARCHES - 2);
    expect(searchSpy).toHaveBeenCalledTimes(2);
    expect(await unitsConsumed()).toBe(budget);
  });

  it('con la cuota agotada, la cache vencida se sigue sirviendo', async () => {
    await dataSource.query(
      `UPDATE tunio.youtube_search_cache
          SET fetched_at = now() - interval '2 days',
              expires_at = now() - interval '1 day'
        WHERE query_normalized = 'salsa clasica'`,
    );

    const stale = await searchFromQr('salsa clasica').expect(200);
    expect(stale.body.data).toEqual({
      results: [result('v1'), result('v2')],
      catalogLimited: true,
    });

    const empty = await searchFromQr('nunca buscada').expect(200);
    expect(empty.body.data).toEqual({ results: [], catalogLimited: true });
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('el registro mide la busqueda sin escribir la consulta', () => {
    const searchLogs = serverOutput.filter((line) =>
      line.includes('"context":"SearchService"'),
    );
    expect(searchLogs.length).toBeGreaterThan(0);
    expect(searchLogs.join('')).toContain('durationMs');
    expect(serverOutput.join('').toLowerCase()).not.toContain('salsa');
  });
});
