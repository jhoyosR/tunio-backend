import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { YoutubeSearchCache } from './entities/youtube-search-cache.entity';
import { normalizeQuery } from './search-query';
import {
  SEARCH_QUOTA_COST,
  SearchResult,
  YoutubeClient,
  YoutubeUnavailableError,
} from './youtube.client';
import { YoutubeQuotaService } from './youtube-quota.service';

const MS_PER_HOUR = 3_600_000;

// De donde salieron los resultados. Solo se registra: la app no lo necesita.
type ResultSource = 'cache' | 'youtube' | 'stale-cache' | 'none';

export interface SearchResponse {
  results: SearchResult[];
  // true cuando la cuota del dia se agoto y los resultados salen solo de la
  // cache (o no hay): la app avisa de que el catalogo esta limitado (RF-02).
  catalogLimited: boolean;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly cacheTtlMs: number;

  constructor(
    @InjectRepository(YoutubeSearchCache)
    private readonly cacheRepository: Repository<YoutubeSearchCache>,
    private readonly youtubeClient: YoutubeClient,
    private readonly quotaService: YoutubeQuotaService,
    configService: ConfigService,
  ) {
    this.cacheTtlMs =
      configService.getOrThrow<number>('tunio.searchCacheTtlHours') *
      MS_PER_HOUR;
  }

  async search(query: string): Promise<SearchResponse> {
    const startedAt = Date.now();
    const normalized = normalizeQuery(query);
    const { response, source } = await this.resolve(normalized);

    // Ni la consulta ni nada del cliente: solo lo necesario para medir.
    this.logger.log({
      event: 'search',
      source,
      catalogLimited: response.catalogLimited,
      resultsCount: response.results.length,
      durationMs: Date.now() - startedAt,
    });
    return response;
  }

  private async resolve(
    normalized: string,
  ): Promise<{ response: SearchResponse; source: ResultSource }> {
    const cached = await this.cacheRepository.findOneBy({
      queryNormalized: normalized,
    });
    if (cached && cached.expiresAt.getTime() > Date.now()) {
      await this.cacheRepository.increment({ id: cached.id }, 'hitCount', 1);
      return this.answer(cached.results as SearchResult[], false, 'cache');
    }

    const allowed = await this.quotaService.tryConsume(
      SEARCH_QUOTA_COST,
      this.quotaService.searchBudget,
    );
    if (!allowed) {
      // Sin cuota, una cache vencida es mejor que nada.
      return cached
        ? this.answer(cached.results as SearchResult[], true, 'stale-cache')
        : this.answer([], true, 'none');
    }

    try {
      const results = await this.youtubeClient.searchVideos(normalized);
      await this.saveToCache(normalized, results);
      return this.answer(results, false, 'youtube');
    } catch (error) {
      if (!(error instanceof YoutubeUnavailableError)) {
        throw error;
      }
      this.logger.warn({ event: 'search', error: error.message });
      if (cached) {
        return this.answer(
          cached.results as SearchResult[],
          false,
          'stale-cache',
        );
      }
      throw new ServiceUnavailableException('Song catalog is unavailable');
    }
  }

  // UPSERT: dos busquedas simultaneas de la misma consulta no chocan con la
  // unicidad de query_normalized; la ultima en llegar deja sus resultados.
  private async saveToCache(
    normalized: string,
    results: SearchResult[],
  ): Promise<void> {
    const now = Date.now();
    await this.cacheRepository.upsert(
      {
        queryNormalized: normalized,
        results,
        fetchedAt: new Date(now),
        expiresAt: new Date(now + this.cacheTtlMs),
      },
      ['queryNormalized'],
    );
  }

  private answer(
    results: SearchResult[],
    catalogLimited: boolean,
    source: ResultSource,
  ): { response: SearchResponse; source: ResultSource } {
    return { response: { results, catalogLimited }, source };
  }
}
