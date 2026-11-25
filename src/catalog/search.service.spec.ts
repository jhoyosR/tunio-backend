import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { YoutubeSearchCache } from './entities/youtube-search-cache.entity';
import { SearchService } from './search.service';
import {
  SEARCH_QUOTA_COST,
  SearchResult,
  YoutubeClient,
  YoutubeUnavailableError,
} from './youtube.client';
import { YoutubeQuotaService } from './youtube-quota.service';

const HOUR_MS = 3_600_000;
const SEARCH_BUDGET = 8000;

const result = (id: string): SearchResult => ({
  youtubeVideoId: id,
  title: `Title ${id}`,
  artistDisplay: 'Artist',
  channelTitle: 'Channel',
  durationSeconds: 200,
  thumbnailUrl: null,
});

describe('SearchService', () => {
  const findOneBy = jest.fn();
  const increment = jest.fn();
  const upsert = jest.fn();
  const searchVideos = jest.fn();
  const tryConsume = jest.fn();
  let service: SearchService;

  const cacheRow = (expiresInMs: number) => ({
    id: '1',
    queryNormalized: 'salsa',
    results: [result('cached')],
    expiresAt: new Date(Date.now() + expiresInMs),
  });

  beforeEach(() => {
    for (const mock of [findOneBy, increment, upsert, searchVideos]) {
      mock.mockReset();
    }
    tryConsume.mockReset().mockResolvedValue(true);
    service = new SearchService(
      {
        findOneBy,
        increment,
        upsert,
      } as unknown as Repository<YoutubeSearchCache>,
      { searchVideos } as unknown as YoutubeClient,
      {
        tryConsume,
        searchBudget: SEARCH_BUDGET,
      } as unknown as YoutubeQuotaService,
      { getOrThrow: () => 24 } as unknown as ConfigService,
    );
  });

  it('con cache vigente no llama a YouTube ni gasta cuota', async () => {
    findOneBy.mockResolvedValue(cacheRow(HOUR_MS));

    await expect(service.search('Salsa')).resolves.toEqual({
      results: [result('cached')],
      catalogLimited: false,
    });
    expect(findOneBy).toHaveBeenCalledWith({ queryNormalized: 'salsa' });
    expect(increment).toHaveBeenCalledWith({ id: '1' }, 'hitCount', 1);
    expect(tryConsume).not.toHaveBeenCalled();
    expect(searchVideos).not.toHaveBeenCalled();
  });

  it('sin cache reserva la cuota, busca y guarda en cache', async () => {
    findOneBy.mockResolvedValue(null);
    searchVideos.mockResolvedValue([result('fresh')]);

    await expect(service.search('salsa')).resolves.toEqual({
      results: [result('fresh')],
      catalogLimited: false,
    });
    expect(tryConsume).toHaveBeenCalledWith(SEARCH_QUOTA_COST, SEARCH_BUDGET);
    const [row] = upsert.mock.calls[0] as [Partial<YoutubeSearchCache>];
    expect(row).toMatchObject({
      queryNormalized: 'salsa',
      results: [result('fresh')],
    });
    expect(row.expiresAt!.getTime() - row.fetchedAt!.getTime()).toBe(
      24 * HOUR_MS,
    );
  });

  it('con la cache vencida vuelve a buscar', async () => {
    findOneBy.mockResolvedValue(cacheRow(-1));
    searchVideos.mockResolvedValue([result('fresh')]);

    const response = await service.search('salsa');
    expect(response.results).toEqual([result('fresh')]);
  });

  describe('cuota agotada', () => {
    beforeEach(() => tryConsume.mockResolvedValue(false));

    it('sirve la cache vencida y avisa de que el catalogo esta limitado', async () => {
      findOneBy.mockResolvedValue(cacheRow(-1));

      await expect(service.search('salsa')).resolves.toEqual({
        results: [result('cached')],
        catalogLimited: true,
      });
      expect(searchVideos).not.toHaveBeenCalled();
    });

    it('sin cache responde vacio y limitado, sin romper', async () => {
      findOneBy.mockResolvedValue(null);

      await expect(service.search('salsa')).resolves.toEqual({
        results: [],
        catalogLimited: true,
      });
    });
  });

  describe('YouTube no responde', () => {
    beforeEach(() =>
      searchVideos.mockRejectedValue(new YoutubeUnavailableError('timeout')),
    );

    it('sirve la cache vencida si la hay', async () => {
      findOneBy.mockResolvedValue(cacheRow(-1));

      const response = await service.search('salsa');
      expect(response.results).toEqual([result('cached')]);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('sin cache responde 503', async () => {
      findOneBy.mockResolvedValue(null);

      await expect(service.search('salsa')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
