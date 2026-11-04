import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm';
import { ActivityEventsService } from '../activity/activity-events.service';
import { SongsService } from '../catalog/songs.service';
import { DevicesService } from '../devices/devices.service';
import { BlockedSong } from '../moderation/entities/blocked-song.entity';
import { LiveUpdatesService } from '../realtime/live-updates.service';
import { MusicSession } from '../sessions/entities/music-session.entity';
import { QrAccessService } from '../venues/qr-access.service';
import { QueueItem, QueueItemStatus } from './entities/queue-item.entity';
import { Vote } from './entities/vote.entity';

// Una cancion esta "activa" en la cola mientras espera o suena. Es la misma
// condicion que el indice uq_active_song_per_session.
const ACTIVE_QUEUE_STATUSES: QueueItemStatus[] = ['PENDING', 'PLAYING'];
const ACTIVE_SONG_INDEX = 'uq_active_song_per_session';
const ONE_VOTE_PER_DEVICE = 'votes_queue_item_id_device_id_key';
const UNIQUE_VIOLATION = '23505';
// El primer intento y uno mas: el reintento siempre encuentra la entrada que
// creo el ganador de la carrera, asi que no hace falta un tercero.
const MAX_ATTEMPTS = 2;
const ALREADY_VOTED_MESSAGE = 'You already voted for this song';

export type RequestOutcome = 'REQUESTED' | 'VOTED';

export interface RequestResult {
  outcome: RequestOutcome;
  queueItemId: string;
  voteCount: number;
}

interface RequestContext {
  venueId: string;
  sessionId: string;
  songId: string;
  installationId: string;
}

// El voto repetido no es un error de la transaccion: se registra su evento y
// se confirma, y solo despues se responde 409.
type TransactionResult = RequestResult | 'ALREADY_VOTED';

@Injectable()
export class SongRequestsService {
  private readonly maxRequestsPerHour: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly qrAccessService: QrAccessService,
    private readonly songsService: SongsService,
    private readonly devicesService: DevicesService,
    private readonly activityEvents: ActivityEventsService,
    private readonly liveUpdates: LiveUpdatesService,
    configService: ConfigService,
  ) {
    this.maxRequestsPerHour = configService.getOrThrow<number>(
      'tunio.maxRequestsPerHour',
    );
  }

  // Pedir o votar (docs/06, nota 3). Si la cancion no esta en la cola, entra
  // con 1 voto; si ya esta, la accion se convierte en voto.
  async requestOrVote(
    publicToken: string,
    installationId: string,
    youtubeVideoId: string,
  ): Promise<RequestResult> {
    const { venueId, openSession } =
      await this.qrAccessService.resolveToken(publicToken);
    if (!openSession) {
      throw new ConflictException('The venue has no open session');
    }
    // Fuera de la transaccion: consulta a YouTube y no debe hacerse con
    // bloqueos tomados.
    const song = await this.songsService.resolvePlayableSong(youtubeVideoId);

    const context: RequestContext = {
      venueId,
      sessionId: openSession.id,
      songId: song.id,
      installationId,
    };
    const result = await this.retryLostRace(() =>
      this.dataSource.transaction((manager) =>
        this.resolveInTransaction(manager, context),
      ),
    );
    if (result === 'ALREADY_VOTED') {
      throw new ConflictException(ALREADY_VOTED_MESSAGE);
    }
    this.liveUpdates.venueChanged(venueId);
    return result;
  }

  // Dos solicitudes simultaneas de una cancion que no esta en la cola pasan
  // ambas el bloqueo (no hay fila que bloquear) e intentan crear la entrada.
  // El indice deja pasar a una; la otra falla, y como PostgreSQL ya aborto su
  // transaccion, se repite entera: esta vez el bloqueo encuentra la entrada
  // del ganador y la accion termina como voto.
  private async retryLostRace(
    attempt: () => Promise<TransactionResult>,
  ): Promise<TransactionResult> {
    for (let attemptNumber = 1; ; attemptNumber++) {
      try {
        return await attempt();
      } catch (error) {
        if (
          attemptNumber < MAX_ATTEMPTS &&
          isUniqueViolation(error, ACTIVE_SONG_INDEX)
        ) {
          continue;
        }
        // Red de seguridad: el bloqueo de la entrada ya serializa los votos y
        // el voto repetido se detecta antes de insertar.
        if (isUniqueViolation(error, ONE_VOTE_PER_DEVICE)) {
          throw new ConflictException(ALREADY_VOTED_MESSAGE);
        }
        throw error;
      }
    }
  }

  // Orden de bloqueos, igual en todas las peticiones para no provocar
  // interbloqueos: sesion (compartido) -> dispositivo -> entrada de cola.
  private async resolveInTransaction(
    manager: EntityManager,
    context: RequestContext,
  ): Promise<TransactionResult> {
    await this.assertSessionAcceptsRequests(manager, context.sessionId);
    // El upsert de session_devices deja bloqueada la fila del dispositivo
    // hasta el final: dos peticiones del mismo telefono no pueden contar a la
    // vez su limite por hora.
    const deviceId = await this.devicesService.identifyDevice(
      manager,
      context.venueId,
      context.installationId,
      context.sessionId,
    );
    await this.assertNotBlocked(manager, context);

    const activeItem = await manager
      .createQueryBuilder(QueueItem, 'item')
      .setLock('pessimistic_write')
      .where('item.session_id = :sessionId AND item.song_id = :songId', {
        sessionId: context.sessionId,
        songId: context.songId,
      })
      .andWhere({ status: In(ACTIVE_QUEUE_STATUSES) })
      .getOne();

    if (activeItem) {
      return this.castVote(manager, context, deviceId, activeItem.id);
    }
    await this.assertWithinHourlyLimit(manager, deviceId);
    return this.createRequest(manager, context, deviceId);
  }

  // FOR SHARE: pausar o cerrar la sesion espera a que terminen las
  // solicitudes en curso, y ninguna entra despues de pausar.
  private async assertSessionAcceptsRequests(
    manager: EntityManager,
    sessionId: string,
  ): Promise<void> {
    const session = await manager
      .createQueryBuilder(MusicSession, 'session')
      .setLock('pessimistic_read')
      .where('session.id = :sessionId', { sessionId })
      .getOneOrFail();
    if (session.status === 'PAUSED') {
      throw new ConflictException('The service is paused');
    }
    if (session.status !== 'ACTIVE') {
      throw new ConflictException('The venue has no open session');
    }
  }

  // Bloqueo vigente: sin levantar y sin vencer. El cliente recibe el motivo.
  private async assertNotBlocked(
    manager: EntityManager,
    { venueId, songId }: RequestContext,
  ): Promise<void> {
    const block = await manager
      .createQueryBuilder(BlockedSong, 'block')
      .where('block.venue_id = :venueId AND block.song_id = :songId', {
        venueId,
        songId,
      })
      .andWhere('block.lifted_at IS NULL AND block.expires_at > now()')
      .getOne();
    if (block) {
      throw new ForbiddenException(
        block.reason
          ? `This song is blocked in the venue: ${block.reason}`
          : 'This song is blocked in the venue',
      );
    }
  }

  // Cuenta solo las solicitudes nuevas: votar no tiene limite (decision 12).
  private async assertWithinHourlyLimit(
    manager: EntityManager,
    deviceId: string,
  ): Promise<void> {
    const requestsLastHour = await manager
      .createQueryBuilder(QueueItem, 'item')
      .where('item.requested_by_device_id = :deviceId', { deviceId })
      .andWhere(`item.requested_at > now() - interval '1 hour'`)
      .getCount();
    if (requestsLastHour >= this.maxRequestsPerHour) {
      throw new HttpException(
        `Request limit reached: ${this.maxRequestsPerHour} per hour`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async createRequest(
    manager: EntityManager,
    context: RequestContext,
    deviceId: string,
  ): Promise<RequestResult> {
    const { identifiers } = await manager.insert(QueueItem, {
      sessionId: context.sessionId,
      songId: context.songId,
      requestedByDeviceId: deviceId,
    });
    const queueItemId = (identifiers[0] as { id: string }).id;
    // La solicitud cuenta como el primer voto (origin = REQUEST).
    await manager.insert(Vote, {
      queueItemId,
      sessionId: context.sessionId,
      deviceId,
      origin: 'REQUEST',
    });
    await this.activityEvents.record(manager, {
      eventType: 'SONG_REQUESTED',
      venueId: context.venueId,
      sessionId: context.sessionId,
      songId: context.songId,
      deviceId,
      details: { queueItemId },
    });
    return { outcome: 'REQUESTED', queueItemId, voteCount: 1 };
  }

  private async castVote(
    manager: EntityManager,
    context: RequestContext,
    deviceId: string,
    queueItemId: string,
  ): Promise<TransactionResult> {
    const event = {
      venueId: context.venueId,
      sessionId: context.sessionId,
      songId: context.songId,
      deviceId,
    };
    // Seguro gracias al bloqueo de la entrada: ningun otro voto a ella puede
    // colarse entre esta consulta y la insercion.
    if (await manager.existsBy(Vote, { queueItemId, deviceId })) {
      await this.activityEvents.record(manager, {
        ...event,
        eventType: 'VOTE_REJECTED',
        details: { queueItemId, reason: 'ALREADY_VOTED' },
      });
      return 'ALREADY_VOTED';
    }

    await manager.insert(Vote, {
      queueItemId,
      sessionId: context.sessionId,
      deviceId,
      origin: 'VOTE',
    });
    await this.activityEvents.record(manager, {
      ...event,
      eventType: 'VOTE_CAST',
      details: { queueItemId },
    });
    const voteCount = await manager.countBy(Vote, { queueItemId });
    return { outcome: 'VOTED', queueItemId, voteCount };
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = error.driverError as {
    code?: string;
    constraint?: string;
  };
  return (
    driverError.code === UNIQUE_VIOLATION &&
    driverError.constraint === constraint
  );
}
