import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { ActivityEventsService } from '../activity/activity-events.service';
import { AdminActionsService } from '../activity/admin-actions.service';
import { AdminActionType } from '../activity/entities/admin-action.entity';
import { Playback } from '../playback/entities/playback.entity';
import { finishPlayback } from '../playback/finish-playback';
import { DefaultPlaylist } from '../playlists/entities/default-playlist.entity';
import { LiveUpdatesService } from '../realtime/live-updates.service';
import { MusicSession, SessionStatus } from './entities/music-session.entity';

// Una sesion "abierta" es la que no ha cerrado: ACTIVE o PAUSED. Es la misma
// condicion que el indice uq_one_open_session_per_venue.
export const OPEN_SESSION_STATUSES: SessionStatus[] = ['ACTIVE', 'PAUSED'];

const ONE_OPEN_SESSION_INDEX = 'uq_one_open_session_per_venue';
const UNIQUE_VIOLATION = '23505';

const SESSION_EVENT_BY_STATUS = {
  ACTIVE: 'SESSION_ACTIVE',
  PAUSED: 'SESSION_PAUSED',
  CLOSED: 'SESSION_CLOSED',
} as const satisfies Record<SessionStatus, string>;

// Accion del personal segun el estado al que pasa la sesion. Abrir no es una
// transicion (crea la sesion) y se registra aparte como SESSION_OPEN; la
// unica forma de volver a ACTIVE es reanudar.
const ADMIN_ACTION_BY_TRANSITION = {
  ACTIVE: 'SESSION_RESUME',
  PAUSED: 'SESSION_PAUSE',
  CLOSED: 'SESSION_CLOSE',
} as const satisfies Record<SessionStatus, AdminActionType>;

export interface SessionDetails {
  id: string;
  status: SessionStatus;
  eventName: string | null;
  startedAt: Date;
  endedAt: Date | null;
  defaultPlaylistId: string | null;
}

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(MusicSession)
    private readonly sessionRepository: Repository<MusicSession>,
    @InjectRepository(DefaultPlaylist)
    private readonly playlistRepository: Repository<DefaultPlaylist>,
    private readonly dataSource: DataSource,
    private readonly activityEvents: ActivityEventsService,
    private readonly adminActions: AdminActionsService,
    private readonly liveUpdates: LiveUpdatesService,
  ) {}

  findOpenSession(venueId: string): Promise<MusicSession | null> {
    return this.sessionRepository.findOneBy({
      venueId,
      status: In(OPEN_SESSION_STATUSES),
    });
  }

  async getOpenSession(venueId: string): Promise<SessionDetails | null> {
    const session = await this.findOpenSession(venueId);
    return session ? this.toDetails(session) : null;
  }

  // La unicidad la garantiza el indice, no una consulta previa: dos aperturas
  // simultaneas pasarian ambas un "no hay sesion abierta" y la base es la
  // unica que puede decidir cual gana.
  async openSession(
    venueId: string,
    staffId: string,
    eventName: string | null,
  ): Promise<SessionDetails> {
    const playlist = await this.playlistRepository.findOneBy({ venueId });
    try {
      const session = await this.dataSource.transaction(async (manager) => {
        const opened = await manager.save(
          manager.create(MusicSession, {
            venueId,
            eventName,
            openedByStaffId: staffId,
            defaultPlaylistId: playlist?.id ?? null,
          }),
        );
        await this.recordSessionEvent(manager, opened, staffId);
        await this.adminActions.record(manager, {
          venueId,
          actorStaffId: staffId,
          action: 'SESSION_OPEN',
          sessionId: opened.id,
        });
        return opened;
      });
      this.liveUpdates.venueChanged(venueId);
      return this.toDetails(session);
    } catch (error) {
      if (this.isOneOpenSessionViolation(error)) {
        throw new ConflictException('This venue already has an open session');
      }
      throw error;
    }
  }

  // En PAUSED la musica sigue; solo se dejan de aceptar solicitudes y votos.
  pauseSession(
    venueId: string,
    sessionId: string,
    staffId: string,
  ): Promise<SessionDetails> {
    return this.transition(venueId, sessionId, staffId, ['ACTIVE'], 'PAUSED');
  }

  resumeSession(
    venueId: string,
    sessionId: string,
    staffId: string,
  ): Promise<SessionDetails> {
    return this.transition(venueId, sessionId, staffId, ['PAUSED'], 'ACTIVE');
  }

  // Las entradas PENDING se dejan tal cual a proposito: en una sesion cerrada,
  // v_unplayed_requests ya las cuenta como "la sesion cerro antes de su
  // turno". Pasarlas a REMOVED las haria pasar por retiradas por el personal.
  // Lo que estuviera sonando se da por saltado (decision 13): se corto antes
  // de terminar, y una reproduccion en PLAYING de una sesion cerrada no
  // terminaria nunca.
  closeSession(
    venueId: string,
    sessionId: string,
    staffId: string,
  ): Promise<SessionDetails> {
    return this.transition(
      venueId,
      sessionId,
      staffId,
      OPEN_SESSION_STATUSES,
      'CLOSED',
    );
  }

  // Cambio de estado condicionado en un solo UPDATE: si dos personas pulsan
  // a la vez, solo una transicion se aplica y la otra recibe 409.
  private async transition(
    venueId: string,
    sessionId: string,
    staffId: string,
    allowedFrom: SessionStatus[],
    to: SessionStatus,
  ): Promise<SessionDetails> {
    const details = await this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(MusicSession)
        .set({
          status: to,
          ...(to === 'CLOSED' ? { endedAt: () => 'now()' } : {}),
        })
        .where('id = :sessionId AND venue_id = :venueId', {
          sessionId,
          venueId,
        })
        .andWhere('status IN (:...allowedFrom)', { allowedFrom })
        .execute();

      // Filtrar tambien por venue_id hace que una sesion de otro local se vea
      // como inexistente, aunque se conozca su id.
      const session = await manager.findOneBy(MusicSession, {
        id: sessionId,
        venueId,
      });
      if (!session) {
        throw new NotFoundException('Session not found');
      }
      if (result.affected === 0) {
        throw new ConflictException(
          `Cannot change a ${session.status} session to ${to}`,
        );
      }
      if (to === 'CLOSED') {
        await this.skipRunningPlayback(manager, session.id, staffId);
      }
      await this.recordSessionEvent(manager, session, staffId);
      await this.adminActions.record(manager, {
        venueId,
        actorStaffId: staffId,
        action: ADMIN_ACTION_BY_TRANSITION[to],
        sessionId: session.id,
      });
      return this.toDetails(session);
    });
    this.liveUpdates.venueChanged(venueId);
    return details;
  }

  private async skipRunningPlayback(
    manager: EntityManager,
    sessionId: string,
    staffId: string,
  ): Promise<void> {
    const running = await manager.findOneBy(Playback, {
      sessionId,
      status: 'PLAYING',
    });
    if (running) {
      await finishPlayback(manager, this.activityEvents, running, 'SKIPPED', {
        staffUserId: staffId,
        reason: 'SESSION_CLOSED',
      });
    }
  }

  // Reanudar emite SESSION_ACTIVE igual que abrir: el evento registra el
  // estado al que entra la sesion, no la accion que lo provoco.
  private recordSessionEvent(
    manager: EntityManager,
    session: MusicSession,
    staffId: string,
  ): Promise<void> {
    return this.activityEvents.record(manager, {
      eventType: SESSION_EVENT_BY_STATUS[session.status],
      venueId: session.venueId,
      sessionId: session.id,
      staffUserId: staffId,
    });
  }

  private isOneOpenSessionViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = error.driverError as {
      code?: string;
      constraint?: string;
    };
    return (
      driverError.code === UNIQUE_VIOLATION &&
      driverError.constraint === ONE_OPEN_SESSION_INDEX
    );
  }

  private toDetails(session: MusicSession): SessionDetails {
    return {
      id: session.id,
      status: session.status,
      eventName: session.eventName,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      defaultPlaylistId: session.defaultPlaylistId,
    };
  }
}
