import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
const MAX_RESULTS = 10;
// Por debajo del objetivo de 2 s de RF-02: mejor fallar y servir la cache
// vencida que dejar al cliente esperando.
const REQUEST_TIMEOUT_MS = 1500;

// Coste en unidades de cuota de una busqueda completa: search.list (100) mas
// un videos.list (1) con todos los ids juntos para obtener la duracion.
export const SEARCH_QUOTA_COST = 101;

// Resultado ya normalizado: es lo que se guarda en la cache y lo que recibe
// la app. El artista no va aqui: lo deriva BE-11.
export interface SearchResult {
  youtubeVideoId: string;
  title: string;
  channelTitle: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
}

// El mensaje nunca incluye la URL de la peticion: lleva la clave de la API.
export class YoutubeUnavailableError extends Error {}

interface SearchListResponse {
  items?: Array<{ id?: { videoId?: string } }>;
}

interface VideosListResponse {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: Record<string, { url?: string } | undefined>;
    };
    contentDetails?: { duration?: string };
    status?: { embeddable?: boolean };
  }>;
}

@Injectable()
export class YoutubeClient {
  private readonly apiKey: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.getOrThrow<string>('youtube.apiKey');
  }

  // search.list solo aporta los ids: el titulo se toma de videos.list, que
  // cuesta lo mismo con o sin snippet y no viene escapado en HTML.
  async searchVideos(query: string): Promise<SearchResult[]> {
    const search = await this.get<SearchListResponse>('search', {
      part: 'id',
      type: 'video',
      // Solo lo que el reproductor embebido de la pantalla del bar puede sonar.
      videoEmbeddable: 'true',
      maxResults: String(MAX_RESULTS),
      q: query,
    });
    const ids = (search.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) {
      return [];
    }

    const videos = await this.get<VideosListResponse>('videos', {
      part: 'snippet,contentDetails,status',
      id: ids.join(','),
    });
    const byId = new Map(
      (videos.items ?? []).map((video) => [video.id, video]),
    );

    // Se conserva el orden de relevancia de search.list.
    return ids.flatMap((id) => {
      const video = byId.get(id);
      const durationSeconds = parseIsoDuration(video?.contentDetails?.duration);
      // Sin duracion (directos) o no embebible: no puede entrar en la cola.
      if (!video?.status?.embeddable || !durationSeconds) {
        return [];
      }
      const thumbnails = video.snippet?.thumbnails ?? {};
      return [
        {
          youtubeVideoId: id,
          title: video.snippet?.title ?? '',
          channelTitle: video.snippet?.channelTitle ?? '',
          durationSeconds,
          thumbnailUrl:
            thumbnails.medium?.url ?? thumbnails.default?.url ?? null,
        },
      ];
    });
  }

  private async get<T>(
    resource: string,
    params: Record<string, string>,
  ): Promise<T> {
    const url = `${API_BASE_URL}/${resource}?${new URLSearchParams({
      ...params,
      key: this.apiKey,
    }).toString()}`;

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown';
      throw new YoutubeUnavailableError(
        `YouTube ${resource} failed: ${reason}`,
      );
    }
    if (!response.ok) {
      throw new YoutubeUnavailableError(
        `YouTube ${resource} responded ${response.status}`,
      );
    }
    return (await response.json()) as T;
  }
}

// Duracion ISO 8601 de YouTube (PT1H2M3S, P1DT2H...). Devuelve 0 para los
// directos (P0D) y para cualquier formato que no se reconozca.
export function parseIsoDuration(duration: string | undefined): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    duration ?? '',
  );
  if (!match) {
    return 0;
  }
  const [days, hours, minutes, seconds] = match
    .slice(1)
    .map((part) => Number(part ?? 0));
  return ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
}
