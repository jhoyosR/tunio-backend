import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { Song } from '../catalog/entities/song.entity';
import { Paginated } from '../common/interfaces/api-response.interface';
import { paginate } from '../common/utils/paginate';
import { StaffRole } from '../staff/entities/venue-staff.entity';
import { ActivityEventsService } from './activity-events.service';
import { AdminActionsQueryDto } from './dto/admin-actions-query.dto';
import { AdminAction, AdminActionType } from './entities/admin-action.entity';

export interface NewAdminAction {
  venueId: string;
  actorStaffId: string;
  action: AdminActionType;
  sessionId?: string | null;
  queueItemId?: string | null;
  // La cancion sobre la que se actuo. admin_actions no tiene columna para
  // ella: va a details junto con su titulo, para que la bitacora se lea sola.
  songId?: string;
  details?: Record<string, unknown>;
}

export interface AdminActionEntry {
  id: string;
  action: AdminActionType;
  occurredAt: Date;
  actor: { staffUserId: string; displayName: string; role: StaffRole };
  sessionId: string | null;
  queueItemId: string | null;
  details: Record<string, unknown>;
}

// Bitacora del personal (RF-07): quien, cuando y que.
@Injectable()
export class AdminActionsService {
  private readonly timezone: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly activityEvents: ActivityEventsService,
    configService: ConfigService,
  ) {
    this.timezone = configService.getOrThrow<string>('tunio.timezone');
  }

  // En la transaccion del hecho, como los eventos: una accion confirmada
  // nunca queda sin su registro, ni un registro sin su accion. Cada accion
  // emite ademas ADMIN_ACTION, aunque el hecho tenga su propio evento (p. ej.
  // SESSION_PAUSED): el evento dice que paso, este, que lo decidio alguien.
  async record(manager: EntityManager, entry: NewAdminAction): Promise<void> {
    const details = {
      ...(entry.songId ? await this.describeSong(manager, entry.songId) : {}),
      ...entry.details,
    };
    const saved = await manager.save(
      manager.create(AdminAction, {
        venueId: entry.venueId,
        actorStaffId: entry.actorStaffId,
        action: entry.action,
        sessionId: entry.sessionId ?? null,
        queueItemId: entry.queueItemId ?? null,
        details,
      }),
    );
    await this.activityEvents.record(manager, {
      eventType: 'ADMIN_ACTION',
      venueId: entry.venueId,
      staffUserId: entry.actorStaffId,
      sessionId: entry.sessionId ?? undefined,
      songId: entry.songId,
      details: {
        adminActionId: saved.id,
        action: entry.action,
        ...(entry.queueItemId ? { queueItemId: entry.queueItemId } : {}),
        ...details,
      },
    });
  }

  // Lo mas reciente primero. Las fechas son dias del calendario en la zona
  // horaria del sistema (TUNIO_TIMEZONE), no en UTC: «hoy» para el bar
  // incluye lo que paso despues de las 19:00, que en UTC ya es manana.
  async list(
    venueId: string,
    query: AdminActionsQueryDto,
  ): Promise<Paginated<AdminActionEntry>> {
    const builder = this.dataSource.manager
      .createQueryBuilder(AdminAction, 'action')
      .innerJoinAndSelect('action.actorStaff', 'membership')
      .innerJoinAndSelect('membership.staffUser', 'staff')
      .where('action.venue_id = :venueId', { venueId })
      .setParameter('timezone', this.timezone)
      // Nombres de propiedad, no de columna: con JOIN y skip/take, TypeORM
      // no sabe ordenar por el nombre de la columna.
      .orderBy('action.occurredAt', 'DESC')
      .addOrderBy('action.id', 'DESC');
    if (query.from) {
      builder.andWhere(
        'action.occurred_at >= CAST(CAST(:from AS date) AS timestamp) AT TIME ZONE :timezone',
        { from: query.from },
      );
    }
    if (query.to) {
      builder.andWhere(
        'action.occurred_at < CAST(CAST(:to AS date) + 1 AS timestamp) AT TIME ZONE :timezone',
        { to: query.to },
      );
    }
    const page = await paginate(builder, query.page, query.limit);
    return { ...page, items: page.items.map((item) => this.toEntry(item)) };
  }

  private async describeSong(
    manager: EntityManager,
    songId: string,
  ): Promise<Record<string, unknown>> {
    const song = await manager.findOneByOrFail(Song, { id: songId });
    return { songId, songTitle: song.title };
  }

  private toEntry(action: AdminAction): AdminActionEntry {
    return {
      id: action.id,
      action: action.action,
      occurredAt: action.occurredAt,
      actor: {
        staffUserId: action.actorStaffId,
        displayName: action.actorStaff.staffUser.displayName,
        role: action.actorStaff.role,
      },
      sessionId: action.sessionId,
      queueItemId: action.queueItemId,
      details: action.details,
    };
  }
}
