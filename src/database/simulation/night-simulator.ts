import { ConflictException, INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Song } from '../../catalog/entities/song.entity';
import { SongsService } from '../../catalog/songs.service';
import { ModerationService } from '../../moderation/moderation.service';
import { PlayerService } from '../../playback/player.service';
import { QueueItem } from '../../queue/entities/queue-item.entity';
import { SongRequestsService } from '../../queue/song-requests.service';
import { SessionsService } from '../../sessions/sessions.service';
import { TUNIO_SCHEMA as SCHEMA } from '../database.constants';
import {
  createRandom,
  NIGHT_LENGTH_SECONDS,
  NIGHT_START_TIME,
  NightPlan,
  planSimulation,
  PlannedAction,
  Random,
} from './night-plan';

const EVENT_NAME = 'Noche simulada';
// Cuanto tarda el DJ en poner la primera cancion tras abrir.
const FIRST_TRACK_DELAY_SECONDS = 60;
const SKIP_PROBABILITY = 0.08;
const MIN_PLAYED_BEFORE_SKIP_SECONDS = 30;

export interface SimulationOptions {
  venueSlug: string;
  nights: number;
  seed: number;
}

export interface NightReport {
  nightDate: string;
  devices: number;
  actions: number;
  rejectedVotes: number;
  removed: number;
  playbacks: number;
}

interface VenueContext {
  venueId: string;
  staffId: string;
  qrToken: string;
  catalog: Song[];
}

interface Track {
  playbackId: string;
  startSeconds: number;
  endSeconds: number;
  outcome: 'COMPLETED' | 'SKIPPED';
}

// Genera noches pasadas de un local a traves de los servicios reales (BE-24):
// las reglas, la bitacora y los eventos son los de produccion. Como la base
// pone la hora con now(), cada operacion se ejecuta ahora y despues sus filas
// se llevan a la hora simulada (ver restamp).
//
// No usar con el local en servicio: lo que escriba otra persona en ese local
// mientras corre tambien se llevaria a la noche simulada.
export class NightSimulator {
  private readonly dataSource: DataSource;
  private readonly timezone: string;

  constructor(private readonly app: INestApplicationContext) {
    this.dataSource = app.get(DataSource);
    this.timezone = app.get(ConfigService).getOrThrow<string>('tunio.timezone');
  }

  async run(options: SimulationOptions): Promise<NightReport[]> {
    const venue = await this.loadVenue(options.venueSlug);
    const plan = planSimulation(
      options.nights,
      venue.catalog.length,
      options.seed,
    );
    await this.assertNightsAreFree(venue.venueId, options.nights);
    this.useStoredCatalog();
    const reports: NightReport[] = [];
    for (const [index, night] of plan.nights.entries()) {
      reports.push(
        await this.simulateNight(
          venue,
          night,
          plan.devicePool,
          createRandom(options.seed * 1000 + index),
        ),
      );
    }
    return reports;
  }

  private async simulateNight(
    venue: VenueContext,
    night: NightPlan,
    devicePool: string[],
    random: Random,
  ): Promise<NightReport> {
    const nightDate = await this.localDate(night.daysAgo);
    const start = await this.nightStart(nightDate);
    const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);
    const sessions = this.app.get(SessionsService);
    const report: NightReport = {
      nightDate,
      devices: night.devices,
      actions: night.actions.length,
      rejectedVotes: 0,
      removed: 0,
      playbacks: 0,
    };

    const session = await this.stamped(venue.venueId, at(0), () =>
      sessions.openSession(venue.venueId, venue.staffId, EVENT_NAME),
    );
    let current = await this.startNext(
      venue,
      FIRST_TRACK_DELAY_SECONDS,
      at,
      random,
    );
    if (current) report.playbacks += 1;

    // El reproductor avanza hasta cada accion: la cancion que acaba antes
    // se cierra (o se salta) a su hora, y en la misma operacion empieza la
    // siguiente (decision 13).
    const advanceUntil = async (seconds: number) => {
      while (current && current.endSeconds <= seconds) {
        const finished = current;
        current = await this.finish(venue, finished, at, random);
        if (current) report.playbacks += 1;
      }
    };

    for (const action of night.actions) {
      await advanceUntil(action.atSeconds);
      if (action.kind === 'REMOVE') {
        report.removed += await this.removeOne(
          venue,
          session.id,
          at(action.atSeconds),
          random,
        );
        continue;
      }
      const accepted = await this.request(
        venue,
        devicePool[action.device],
        action,
        at,
      );
      if (!accepted) report.rejectedVotes += 1;
      // Sin lista por defecto, la musica se para cuando la cola se vacia y
      // vuelve con la siguiente solicitud.
      if (!current) {
        current = await this.startNext(venue, action.atSeconds, at, random);
        if (current) report.playbacks += 1;
      }
    }

    await advanceUntil(NIGHT_LENGTH_SECONDS);
    await this.stamped(venue.venueId, at(NIGHT_LENGTH_SECONDS), () =>
      sessions.closeSession(venue.venueId, session.id, venue.staffId),
    );
    return report;
  }

  // false = voto repetido del mismo telefono: queda como VOTE_REJECTED, que
  // tambien pasa en un bar de verdad.
  private async request(
    venue: VenueContext,
    installationId: string,
    action: PlannedAction,
    at: (seconds: number) => Date,
  ): Promise<boolean> {
    try {
      await this.stamped(venue.venueId, at(action.atSeconds), () =>
        this.app
          .get(SongRequestsService)
          .requestOrVote(
            venue.qrToken,
            installationId,
            venue.catalog[action.song].youtubeVideoId,
          ),
      );
      return true;
    } catch (error) {
      if (error instanceof ConflictException) {
        return false;
      }
      throw error;
    }
  }

  private async startNext(
    venue: VenueContext,
    seconds: number,
    at: (seconds: number) => Date,
    random: Random,
  ): Promise<Track | null> {
    const track = await this.stamped(venue.venueId, at(seconds), () =>
      this.app.get(PlayerService).next(venue.venueId, venue.staffId),
    );
    return track ? this.schedule(track, seconds, random) : null;
  }

  private async finish(
    venue: VenueContext,
    track: Track,
    at: (seconds: number) => Date,
    random: Random,
  ): Promise<Track | null> {
    const next = await this.stamped(venue.venueId, at(track.endSeconds), () =>
      this.app
        .get(PlayerService)
        .finish(venue.venueId, track.playbackId, track.outcome, {
          staffUserId: venue.staffId,
        }),
    );
    return next ? this.schedule(next, track.endSeconds, random) : null;
  }

  // Decide de antemano si la cancion se salta y a que altura.
  private schedule(
    track: { playbackId: string; durationSeconds: number },
    startSeconds: number,
    random: Random,
  ): Track {
    const skipped =
      random() < SKIP_PROBABILITY &&
      track.durationSeconds > MIN_PLAYED_BEFORE_SKIP_SECONDS;
    const played = skipped
      ? MIN_PLAYED_BEFORE_SKIP_SECONDS +
        Math.floor(
          random() * (track.durationSeconds - MIN_PLAYED_BEFORE_SKIP_SECONDS),
        )
      : track.durationSeconds;
    return {
      playbackId: track.playbackId,
      startSeconds,
      endSeconds: startSeconds + played,
      outcome: skipped ? 'SKIPPED' : 'COMPLETED',
    };
  }

  // El DJ retira una entrada pendiente cualquiera, si la hay.
  private async removeOne(
    venue: VenueContext,
    sessionId: string,
    when: Date,
    random: Random,
  ): Promise<number> {
    const pending = await this.dataSource.manager.find(QueueItem, {
      where: { sessionId, status: 'PENDING' },
      order: { requestedAt: 'ASC', id: 'ASC' },
    });
    if (pending.length === 0) {
      return 0;
    }
    const item = pending[Math.floor(random() * pending.length)];
    await this.stamped(venue.venueId, when, () =>
      this.app
        .get(ModerationService)
        .removeEntry(venue.venueId, venue.staffId, item.id),
    );
    return 1;
  }

  // Ejecuta la operacion y lleva a `when` todo lo que escribio. Lo escrito
  // es lo que tiene una marca posterior al instante previo a la operacion:
  // lo de operaciones anteriores ya esta en el pasado simulado. Se usa el
  // reloj de la base, el mismo que pone now() en las columnas.
  private async stamped<T>(
    venueId: string,
    when: Date,
    operation: () => Promise<T>,
  ): Promise<T> {
    const [{ now }] = await this.dataSource.query<Array<{ now: string }>>(
      'SELECT CAST(clock_timestamp() AS text) AS now',
    );
    try {
      return await operation();
    } finally {
      await this.restamp(venueId, now, when);
    }
  }

  private async restamp(
    venueId: string,
    since: string,
    when: Date,
  ): Promise<void> {
    const venueSessions = `SELECT id FROM ${SCHEMA}.music_sessions WHERE venue_id = $3`;
    const targets: Array<[table: string, columns: string[], scope: string]> = [
      ['music_sessions', ['started_at', 'ended_at'], 'venue_id = $3'],
      ['anonymous_devices', ['first_seen_at', 'last_seen_at'], 'venue_id = $3'],
      ['session_devices', ['first_seen_at', 'last_seen_at'], 'venue_id = $3'],
      [
        'queue_items',
        ['requested_at', 'finished_at'],
        `session_id IN (${venueSessions})`,
      ],
      ['votes', ['voted_at'], `session_id IN (${venueSessions})`],
      ['playbacks', ['started_at', 'ended_at'], 'venue_id = $3'],
      ['admin_actions', ['occurred_at'], 'venue_id = $3'],
      ['activity_events', ['occurred_at'], 'venue_id = $3'],
    ];
    await this.dataSource.transaction(async (manager) => {
      for (const [table, columns, scope] of targets) {
        const sets = columns
          .map((c) => `${c} = CASE WHEN ${c} >= $1 THEN $2 ELSE ${c} END`)
          .join(', ');
        const touched = columns.map((c) => `${c} >= $1`).join(' OR ');
        await manager.query(
          `UPDATE ${SCHEMA}.${table} SET ${sets} WHERE ${scope} AND (${touched})`,
          [since, when, venueId],
        );
      }
    });
  }

  // El catalogo ya esta verificado: el simulador no gasta cuota de YouTube.
  private useStoredCatalog(): void {
    const songs = this.app.get(SongsService);
    songs.resolvePlayableSong = (youtubeVideoId: string) =>
      this.dataSource.manager.findOneByOrFail(Song, {
        youtubeVideoId,
        lastKnownPlayable: true,
      });
  }

  private async loadVenue(slug: string): Promise<VenueContext> {
    const [venue] = await this.dataSource.query<
      Array<{
        id: string;
        is_active: boolean;
        token: string;
        is_enabled: boolean;
      }>
    >(
      `SELECT v.id, v.is_active, q.public_token AS token, q.is_enabled
       FROM ${SCHEMA}.venues v
       JOIN ${SCHEMA}.qr_access q ON q.venue_id = v.id
       WHERE v.slug = $1`,
      [slug],
    );
    if (!venue) {
      throw new Error(`Venue "${slug}" not found (run npm run seed first)`);
    }
    if (!venue.is_active || !venue.is_enabled) {
      throw new Error(`Venue "${slug}" or its QR is disabled`);
    }
    // El DJ opera la noche; si no hay, el ADMIN.
    const [staff] = await this.dataSource.query<
      Array<{ staff_user_id: string }>
    >(
      `SELECT staff_user_id FROM ${SCHEMA}.venue_staff
       WHERE venue_id = $1 ORDER BY (role = 'DJ') DESC, staff_user_id LIMIT 1`,
      [venue.id],
    );
    if (!staff) {
      throw new Error(`Venue "${slug}" has no staff`);
    }
    // Orden fijo: con la misma semilla, el mismo reparto de canciones.
    const catalog = await this.dataSource.manager.find(Song, {
      where: { lastKnownPlayable: true },
      order: { youtubeVideoId: 'ASC' },
    });
    if (catalog.length === 0) {
      throw new Error('The catalog is empty (run npm run seed first)');
    }
    return {
      venueId: venue.id,
      staffId: staff.staff_user_id,
      qrToken: venue.token,
      catalog,
    };
  }

  // Las noches simuladas van de hace N dias a ayer: no pueden pisar ninguna
  // sesion que ya exista en ese tramo, ni convivir con una sesion abierta.
  private async assertNightsAreFree(
    venueId: string,
    nights: number,
  ): Promise<void> {
    const firstStart = await this.nightStart(await this.localDate(nights));
    const [{ open, overlapping }] = await this.dataSource.query<
      Array<{ open: string; overlapping: string }>
    >(
      `SELECT COUNT(*) FILTER (WHERE status <> 'CLOSED') AS open,
              COUNT(*) FILTER (
                WHERE started_at >= $2
                  AND started_at < CAST(CAST(now() AT TIME ZONE $3 AS date) AS timestamp) AT TIME ZONE $3
              ) AS overlapping
       FROM ${SCHEMA}.music_sessions WHERE venue_id = $1`,
      [venueId, firstStart, this.timezone],
    );
    if (Number(open) > 0) {
      throw new Error('Close the open session before simulating');
    }
    if (Number(overlapping) > 0) {
      throw new Error(
        `The venue already has sessions in the last ${nights} days; ` +
          'use fewer nights or a fresh database',
      );
    }
  }

  private async localDate(daysAgo: number): Promise<string> {
    const [{ day }] = await this.dataSource.query<Array<{ day: string }>>(
      `SELECT CAST(CAST(now() AT TIME ZONE $1 AS date) - $2::int AS text) AS day`,
      [this.timezone, daysAgo],
    );
    return day;
  }

  private async nightStart(day: string): Promise<Date> {
    const [{ start }] = await this.dataSource.query<Array<{ start: Date }>>(
      `SELECT (CAST($1 AS date) + CAST($2 AS time)) AT TIME ZONE $3 AS start`,
      [day, NIGHT_START_TIME, this.timezone],
    );
    return start;
  }
}
