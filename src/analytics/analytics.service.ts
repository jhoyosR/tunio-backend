import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Paginated } from '../common/interfaces/api-response.interface';
import { percentage } from '../common/utils/percentage';
import { TUNIO_SCHEMA as SCHEMA } from '../database/database.constants';
import { GENRES, Genre } from '../genres/genres';
import { GenreCoverage, GenresService } from '../genres/genres.service';
import type { PlaybackStatus } from '../playback/entities/playback.entity';
import type { QueueItemStatus } from '../queue/entities/queue-item.entity';
import {
  MusicSession,
  SessionStatus,
} from '../sessions/entities/music-session.entity';
import { SessionScope, sessionsInScope } from '../sessions/sessions-in-scope';
import {
  AnalyticsFilterDto,
  AnalyticsPageQueryDto,
} from './dto/analytics-filter.dto';

// Umbrales aprobados en docs/08 (P4, P5). Constantes, no ajustes editables
// (decision 21).
const CONCENTRATION_ALERT_PCT = 60;
// Con 3 canciones o menos la cuota de las 3 primeras es 100 % por
// construccion: la alerta no diria nada.
const CONCENTRATION_MIN_VOTED_SONGS = 5;
const LOW_PARTICIPATION_RATIO_PCT = 50;
const LOW_PARTICIPATION_MIN_HISTORY = 3;
const UNCLASSIFIED_LABEL = 'Sin clasificar';

export interface SongPopularity {
  songId: string;
  title: string;
  artistDisplay: string | null;
  thumbnailUrl: string | null;
  genre: string | null;
  totalVotes: number;
  uniqueVoters: number;
  firstVoteAt: Date;
}

export interface AnalyticsSummary {
  sessionCount: number;
  songRequests: number;
  votes: { total: number; fromRequests: number; support: number };
  uniqueDevices: number;
  completedPlaybacks: number;
  unplayedRequests: number;
  waitSeconds: {
    measured: number;
    average: number | null;
    median: number | null;
  };
  mostPopularSong: SongPopularity | null;
}

export interface HourlyParticipation {
  hour: number;
  votes: number;
  uniqueDevices: number;
}

export interface PlaybackHistoryEntry {
  playbackId: string;
  sessionId: string;
  songId: string;
  title: string;
  artistDisplay: string | null;
  source: 'QUEUE' | 'DEFAULT_PLAYLIST';
  status: PlaybackStatus;
  startedAt: Date;
  endedAt: Date | null;
}

export interface GenreBucket {
  genre: string | null;
  label: string;
  requests: number;
  percent: number | null;
}

export interface GenreDistribution {
  buckets: GenreBucket[];
  coverage: GenreCoverage;
}

export interface UnplayedRequest {
  queueItemId: string;
  sessionId: string;
  songId: string;
  title: string;
  artistDisplay: string | null;
  status: QueueItemStatus;
  requestedAt: Date;
  voteCount: number;
  reason: string;
}

export interface UnplayedRequests extends Paginated<UnplayedRequest> {
  byReason: Array<{ reason: string; count: number }>;
}

interface NightHeader {
  sessionId: string;
  eventName: string | null;
  startedAt: Date;
}

export interface VoteConcentration extends NightHeader {
  status: SessionStatus;
  totalVotes: number;
  top3Votes: number;
  top3SharePct: number | null;
  votedSongs: number;
  alert: boolean;
}

export type ParticipationLevel = 'LOW' | 'NORMAL' | 'INSUFFICIENT_HISTORY';

export interface SessionParticipation extends NightHeader {
  uniqueDevices: number;
  previousSessions: number;
  historicalAverage: number | null;
  ratioPct: number | null;
  level: ParticipationLevel;
}

export interface NightComparison {
  sessionId: string;
  eventName: string | null;
  nightDate: string;
  weekday: number;
  uniqueDevices: number;
  songRequests: number;
  totalVotes: number;
  completedPlaybacks: number;
  unplayedRequests: number;
}

type Row = Record<string, unknown>;

// Indicadores del tablero (BE-22). Cada metodo es un indicador de docs/08 y
// sigue su definicion; el codigo del indicador va en el comentario. Todas
// las consultas filtran por `session_id IN (sesiones del filtro)`, con la
// regla de la noche de sessionsInScope.
@Injectable()
export class AnalyticsService {
  private readonly timezone: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly genresService: GenresService,
    configService: ConfigService,
  ) {
    this.timezone = configService.getOrThrow<string>('tunio.timezone');
  }

  // D1, D2, D3, D5 y la cancion mas popular (D4). Las cifras aditivas se
  // suman sobre v_session_summary; los usuarios unicos se recalculan, porque
  // un telefono que vuelve otra noche es uno solo en el periodo.
  async getSummary(
    venueId: string,
    filter: AnalyticsFilterDto,
  ): Promise<AnalyticsSummary> {
    const scope = await this.resolveScope(venueId, filter);
    const [row] = await this.query(
      `WITH scope AS (${scope.sql}),
       summary AS (
         SELECT COUNT(*) AS session_count,
                COALESCE(SUM(song_requests), 0) AS song_requests,
                COALESCE(SUM(total_votes), 0) AS total_votes,
                COALESCE(SUM(completed_playbacks), 0) AS completed_playbacks,
                COALESCE(SUM(unplayed_requests), 0) AS unplayed_requests
         FROM ${SCHEMA}.v_session_summary
         WHERE session_id IN (SELECT id FROM scope)),
       origins AS (
         SELECT COUNT(*) FILTER (WHERE origin = 'REQUEST') AS request_votes,
                COUNT(*) FILTER (WHERE origin = 'VOTE') AS support_votes
         FROM ${SCHEMA}.votes
         WHERE session_id IN (SELECT id FROM scope)),
       devices AS (
         SELECT COUNT(DISTINCT device_id) AS unique_devices
         FROM ${SCHEMA}.session_devices
         WHERE session_id IN (SELECT id FROM scope)),
       waits AS (
         SELECT COUNT(*) AS measured,
                AVG(wait_seconds) AS average,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY wait_seconds) AS median
         FROM ${SCHEMA}.v_wait_times
         WHERE session_id IN (SELECT id FROM scope))
       SELECT * FROM summary, origins, devices, waits`,
      scope.params,
    );
    const top = await this.findPopularity(scope, 1, 0);
    return {
      sessionCount: toNumber(row.session_count),
      songRequests: toNumber(row.song_requests),
      votes: {
        total: toNumber(row.total_votes),
        fromRequests: toNumber(row.request_votes),
        support: toNumber(row.support_votes),
      },
      uniqueDevices: toNumber(row.unique_devices),
      completedPlaybacks: toNumber(row.completed_playbacks),
      unplayedRequests: toNumber(row.unplayed_requests),
      waitSeconds: {
        measured: toNumber(row.measured),
        average: toRoundedOrNull(row.average),
        median: toRoundedOrNull(row.median),
      },
      mostPopularSong: top[0] ?? null,
    };
  }

  // D4. Misma formula que v_session_song_popularity, sobre votes: asi sirve
  // igual para una sesion que para un periodo, donde los votantes unicos no
  // se pueden sumar por sesion.
  async getPopularity(
    venueId: string,
    query: AnalyticsPageQueryDto,
  ): Promise<Paginated<SongPopularity>> {
    const scope = await this.resolveScope(venueId, query);
    const [count] = await this.query(
      `SELECT COUNT(DISTINCT qi.song_id) AS total
       FROM ${SCHEMA}.votes v
       JOIN ${SCHEMA}.queue_items qi ON qi.id = v.queue_item_id
       WHERE v.session_id IN (${scope.sql})`,
      scope.params,
    );
    const items = await this.findPopularity(
      scope,
      query.limit,
      (query.page - 1) * query.limit,
    );
    return toPage(items, toNumber(count.total), query);
  }

  // D6. En un periodo, las franjas se juntan por hora del dia. Ordenadas de
  // mediodia a mediodia, para que una noche que cruza la medianoche se lea
  // seguida (22, 23, 0, 1...).
  async getHourlyParticipation(
    venueId: string,
    filter: AnalyticsFilterDto,
  ): Promise<HourlyParticipation[]> {
    const scope = await this.resolveScope(venueId, filter);
    const rows = await this.query(
      `SELECT CAST(EXTRACT(HOUR FROM v.voted_at AT TIME ZONE :timezone) AS integer) AS hour,
              COUNT(*) AS votes,
              COUNT(DISTINCT v.device_id) AS unique_devices
       FROM ${SCHEMA}.votes v
       WHERE v.session_id IN (${scope.sql})
       GROUP BY 1`,
      { ...scope.params, timezone: this.timezone },
    );
    return rows
      .map((row) => ({
        hour: toNumber(row.hour),
        votes: toNumber(row.votes),
        uniqueDevices: toNumber(row.unique_devices),
      }))
      .sort((a, b) => fromNoon(a.hour) - fromNoon(b.hour));
  }

  // D7. Lo mas reciente primero, como la bitacora.
  async getPlaybacks(
    venueId: string,
    query: AnalyticsPageQueryDto,
  ): Promise<Paginated<PlaybackHistoryEntry>> {
    const scope = await this.resolveScope(venueId, query);
    const [count] = await this.query(
      `SELECT COUNT(*) AS total FROM ${SCHEMA}.playbacks
       WHERE session_id IN (${scope.sql})`,
      scope.params,
    );
    const rows = await this.query(
      `SELECT p.id, p.session_id, p.song_id, s.title, s.artist_display,
              p.source, p.status, p.started_at, p.ended_at
       FROM ${SCHEMA}.playbacks p
       JOIN ${SCHEMA}.songs s ON s.id = p.song_id
       WHERE p.session_id IN (${scope.sql})
       ORDER BY p.started_at DESC, p.id
       LIMIT :limit OFFSET :offset`,
      { ...scope.params, ...pageParams(query) },
    );
    const items = rows.map((row) => ({
      playbackId: row.id as string,
      sessionId: row.session_id as string,
      songId: row.song_id as string,
      title: row.title as string,
      artistDisplay: row.artist_display as string | null,
      source: row.source as PlaybackHistoryEntry['source'],
      status: row.status as PlaybackStatus,
      startedAt: row.started_at as Date,
      endedAt: row.ended_at as Date | null,
    }));
    return toPage(items, toNumber(count.total), query);
  }

  // D8 y D9 juntas: una distribucion sin su cobertura no se publica. Los
  // porcentajes son sobre el total, con «Sin clasificar» como barra propia
  // (P3), asi que suman 100 %.
  async getGenreDistribution(
    venueId: string,
    filter: AnalyticsFilterDto,
  ): Promise<GenreDistribution> {
    const scope = await this.resolveScope(venueId, filter);
    const rows = await this.query(
      `SELECT s.genre, COUNT(*) AS requests
       FROM ${SCHEMA}.queue_items qi
       JOIN ${SCHEMA}.songs s ON s.id = qi.song_id
       WHERE qi.session_id IN (${scope.sql})
       GROUP BY s.genre`,
      scope.params,
    );
    const coverage = await this.genresService.getCoverage(
      toSessionScope(venueId, filter),
    );
    const buckets = rows
      .map((row) => {
        const genre = row.genre as string | null;
        const requests = toNumber(row.requests);
        return {
          genre,
          label: genre ? (GENRES[genre as Genre] ?? genre) : UNCLASSIFIED_LABEL,
          requests,
          percent: percentage(requests, coverage.totalRequests),
        };
      })
      .sort(byClassifiedThenRequests);
    return { buckets, coverage };
  }

  // G1. La definicion de «no reproducida» es la de la vista, la unica.
  async getUnplayedRequests(
    venueId: string,
    query: AnalyticsPageQueryDto,
  ): Promise<UnplayedRequests> {
    const scope = await this.resolveScope(venueId, query);
    const reasons = await this.query(
      `SELECT reason, COUNT(*) AS count
       FROM ${SCHEMA}.v_unplayed_requests
       WHERE session_id IN (${scope.sql})
       GROUP BY reason
       ORDER BY count DESC, reason`,
      scope.params,
    );
    const rows = await this.query(
      `SELECT queue_item_id, session_id, song_id, title, artist_display,
              status, requested_at, vote_count, reason
       FROM ${SCHEMA}.v_unplayed_requests
       WHERE session_id IN (${scope.sql})
       ORDER BY requested_at DESC, queue_item_id
       LIMIT :limit OFFSET :offset`,
      { ...scope.params, ...pageParams(query) },
    );
    const byReason = reasons.map((row) => ({
      reason: row.reason as string,
      count: toNumber(row.count),
    }));
    const items = rows.map((row) => ({
      queueItemId: row.queue_item_id as string,
      sessionId: row.session_id as string,
      songId: row.song_id as string,
      title: row.title as string,
      artistDisplay: row.artist_display as string | null,
      status: row.status as QueueItemStatus,
      requestedAt: row.requested_at as Date,
      voteCount: toNumber(row.vote_count),
      reason: row.reason as string,
    }));
    const total = byReason.reduce((sum, entry) => sum + entry.count, 0);
    return { ...toPage(items, total, query), byReason };
  }

  // G2. Es por sesion: en un periodo, una fila por noche, no un promedio.
  async getVoteConcentration(
    venueId: string,
    filter: AnalyticsFilterDto,
  ): Promise<VoteConcentration[]> {
    const scope = await this.resolveScope(venueId, filter);
    const rows = await this.query(
      `WITH scope AS (${scope.sql}),
       voted AS (
         SELECT qi.session_id, COUNT(DISTINCT qi.song_id) AS voted_songs
         FROM ${SCHEMA}.votes v
         JOIN ${SCHEMA}.queue_items qi ON qi.id = v.queue_item_id
         WHERE v.session_id IN (SELECT id FROM scope)
         GROUP BY qi.session_id)
       SELECT ms.id, ms.event_name, ms.started_at, ms.status,
              COALESCE(vc.total_votes, 0) AS total_votes,
              COALESCE(vc.top3_votes, 0) AS top3_votes,
              vc.top3_share_pct,
              COALESCE(voted.voted_songs, 0) AS voted_songs
       FROM ${SCHEMA}.music_sessions ms
       LEFT JOIN ${SCHEMA}.v_vote_concentration vc ON vc.session_id = ms.id
       LEFT JOIN voted ON voted.session_id = ms.id
       WHERE ms.id IN (SELECT id FROM scope)
       ORDER BY ms.started_at DESC, ms.id`,
      scope.params,
    );
    return rows.map((row) => {
      const top3SharePct = toNumberOrNull(row.top3_share_pct);
      const votedSongs = toNumber(row.voted_songs);
      return {
        ...toNightHeader(row),
        status: row.status as SessionStatus,
        totalVotes: toNumber(row.total_votes),
        top3Votes: toNumber(row.top3_votes),
        top3SharePct,
        votedSongs,
        alert:
          top3SharePct !== null &&
          top3SharePct >= CONCENTRATION_ALERT_PCT &&
          votedSongs >= CONCENTRATION_MIN_VOTED_SONGS,
      };
    });
  }

  // G3. Solo sesiones cerradas, comparadas con el promedio de las cerradas
  // ANTERIORES del local, esten o no en el periodo: es «lo normal» del local
  // hasta esa noche.
  async getLowParticipation(
    venueId: string,
    filter: AnalyticsFilterDto,
  ): Promise<SessionParticipation[]> {
    const scope = await this.resolveScope(venueId, filter);
    const rows = await this.query(
      `SELECT ss.session_id AS id, ss.event_name, ss.started_at,
              ss.unique_devices, history.previous_sessions,
              history.average_devices
       FROM ${SCHEMA}.v_session_summary ss
       CROSS JOIN LATERAL (
         SELECT COUNT(*) AS previous_sessions,
                AVG(prev.unique_devices) AS average_devices
         FROM ${SCHEMA}.v_session_summary prev
         WHERE prev.venue_id = ss.venue_id
           AND prev.status = 'CLOSED'
           AND prev.started_at < ss.started_at) history
       WHERE ss.session_id IN (${scope.sql}) AND ss.status = 'CLOSED'
       ORDER BY ss.started_at DESC, ss.session_id`,
      scope.params,
    );
    return rows.map((row) => {
      const uniqueDevices = toNumber(row.unique_devices);
      const previousSessions = toNumber(row.previous_sessions);
      const historicalAverage = toNumberOrNull(row.average_devices);
      const enoughHistory = previousSessions >= LOW_PARTICIPATION_MIN_HISTORY;
      const ratioPct = enoughHistory
        ? percentage(uniqueDevices, historicalAverage ?? 0)
        : null;
      return {
        ...toNightHeader(row),
        uniqueDevices,
        previousSessions,
        historicalAverage:
          historicalAverage === null
            ? null
            : Math.round(historicalAverage * 10) / 10,
        ratioPct,
        level: participationLevel(enoughHistory, ratioPct),
      };
    });
  }

  // C1. Cada columna es la misma cifra que D1, D2, D3 y G1 para esa noche.
  async getNightComparison(
    venueId: string,
    filter: AnalyticsFilterDto,
  ): Promise<NightComparison[]> {
    const scope = await this.resolveScope(venueId, filter);
    // night_date como texto: un DATE llegaria como Date a medianoche del
    // servidor, que no es la del local.
    const rows = await this.query(
      `SELECT session_id, event_name, CAST(night_date AS text) AS night_date,
              weekday, unique_devices, song_requests, total_votes,
              completed_playbacks, unplayed_requests
       FROM ${SCHEMA}.v_night_comparison
       WHERE session_id IN (${scope.sql})
       ORDER BY night_date DESC, session_id`,
      scope.params,
    );
    return rows.map((row) => ({
      sessionId: row.session_id as string,
      eventName: row.event_name as string | null,
      nightDate: row.night_date as string,
      weekday: toNumber(row.weekday),
      uniqueDevices: toNumber(row.unique_devices),
      songRequests: toNumber(row.song_requests),
      totalVotes: toNumber(row.total_votes),
      completedPlaybacks: toNumber(row.completed_playbacks),
      unplayedRequests: toNumber(row.unplayed_requests),
    }));
  }

  private async findPopularity(
    scope: { sql: string; params: Record<string, unknown> },
    limit: number,
    offset: number,
  ): Promise<SongPopularity[]> {
    const rows = await this.query(
      `SELECT qi.song_id, s.title, s.artist_display, s.thumbnail_url, s.genre,
              COUNT(*) AS total_votes,
              COUNT(DISTINCT v.device_id) AS unique_voters,
              MIN(v.voted_at) AS first_vote_at
       FROM ${SCHEMA}.votes v
       JOIN ${SCHEMA}.queue_items qi ON qi.id = v.queue_item_id
       JOIN ${SCHEMA}.songs s ON s.id = qi.song_id
       WHERE v.session_id IN (${scope.sql})
       GROUP BY qi.song_id, s.id
       ORDER BY total_votes DESC, first_vote_at ASC, qi.song_id
       LIMIT :limit OFFSET :offset`,
      { ...scope.params, limit, offset },
    );
    return rows.map((row) => ({
      songId: row.song_id as string,
      title: row.title as string,
      artistDisplay: row.artist_display as string | null,
      thumbnailUrl: row.thumbnail_url as string | null,
      genre: row.genre as string | null,
      totalVotes: toNumber(row.total_votes),
      uniqueVoters: toNumber(row.unique_voters),
      firstVoteAt: row.first_vote_at as Date,
    }));
  }

  // Una sesion de otro local se ve como inexistente.
  private async resolveScope(
    venueId: string,
    filter: AnalyticsFilterDto,
  ): Promise<{ sql: string; params: Record<string, unknown> }> {
    if (filter.sessionId && (filter.from || filter.to)) {
      throw new BadRequestException(
        'Filter by sessionId or by from/to, not both',
      );
    }
    if (
      filter.sessionId &&
      !(await this.dataSource.manager.existsBy(MusicSession, {
        id: filter.sessionId,
        venueId,
      }))
    ) {
      throw new NotFoundException('Session not found');
    }
    return sessionsInScope(toSessionScope(venueId, filter), this.timezone);
  }

  // Parametros con nombre en SQL escrito a mano: el driver los convierte en
  // $1, $2... y nunca se concatenan valores.
  private query(sql: string, params: Record<string, unknown>): Promise<Row[]> {
    const [text, values] = this.dataSource.driver.escapeQueryWithParameters(
      sql,
      params,
      {},
    );
    return this.dataSource.query<Row[]>(text, values);
  }
}

function toSessionScope(
  venueId: string,
  filter: AnalyticsFilterDto,
): SessionScope {
  return {
    venueId,
    sessionId: filter.sessionId,
    from: filter.from,
    to: filter.to,
  };
}

function participationLevel(
  enoughHistory: boolean,
  ratioPct: number | null,
): ParticipationLevel {
  if (!enoughHistory) {
    return 'INSUFFICIENT_HISTORY';
  }
  // Un promedio historico de 0 no permite estar por debajo: es normal.
  return ratioPct !== null && ratioPct < LOW_PARTICIPATION_RATIO_PCT
    ? 'LOW'
    : 'NORMAL';
}

function toNightHeader(row: Row): NightHeader {
  return {
    sessionId: row.id as string,
    eventName: row.event_name as string | null,
    startedAt: row.started_at as Date,
  };
}

// Lo sin clasificar, al final; lo demas, de mas a menos solicitado.
function byClassifiedThenRequests(a: GenreBucket, b: GenreBucket): number {
  if ((a.genre === null) !== (b.genre === null)) {
    return a.genre === null ? 1 : -1;
  }
  return (
    b.requests - a.requests || (a.genre ?? '').localeCompare(b.genre ?? '')
  );
}

const NOON = 12;
const HOURS_PER_DAY = 24;

function fromNoon(hour: number): number {
  return (hour - NOON + HOURS_PER_DAY) % HOURS_PER_DAY;
}

function pageParams(query: AnalyticsPageQueryDto): Record<string, number> {
  return { limit: query.limit, offset: (query.page - 1) * query.limit };
}

function toPage<T>(
  items: T[],
  totalItems: number,
  query: AnalyticsPageQueryDto,
): Paginated<T> {
  return {
    items,
    meta: {
      totalItems,
      itemsPerPage: query.limit,
      currentPage: query.page,
      totalPages: Math.ceil(totalItems / query.limit) || 1,
    },
  };
}

// COUNT y SUM llegan como texto desde node-postgres (BIGINT y NUMERIC).
function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function toRoundedOrNull(value: unknown): number | null {
  const number = toNumberOrNull(value);
  return number === null ? null : Math.round(number);
}
