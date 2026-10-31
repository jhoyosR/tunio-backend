import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { QueueItem } from '../../queue/entities/queue-item.entity';
import { MusicSession } from '../../sessions/entities/music-session.entity';
import { VenueStaff } from '../../staff/entities/venue-staff.entity';

// Valores de action documentados en el esquema de referencia. La base no los
// restringe con CHECK.
export type AdminActionType =
  | 'SESSION_OPEN'
  | 'SESSION_PAUSE'
  | 'SESSION_RESUME'
  | 'SESSION_CLOSE'
  | 'MAINTENANCE_CLEAR'
  | 'SKIP'
  | 'REMOVE'
  | 'BLOCK'
  | 'UNBLOCK'
  | 'QR_ENABLE'
  | 'QR_DISABLE'
  | 'PLAYLIST_ADD'
  | 'PLAYLIST_REMOVE'
  | 'GENRE_SET';

// Bitacora del personal: quien, cuando y que (RF-07).
@Entity({ name: 'admin_actions', schema: TUNIO_SCHEMA })
@Check('admin_actions_check', 'queue_item_id IS NULL OR session_id IS NOT NULL')
// Ordena occurred_at DESC, que @Index no sabe expresar: lo crea la migracion.
@Index('idx_admin_actions_venue_date', { synchronize: false })
export class AdminAction {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'admin_actions_pkey',
  })
  id: string;

  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @Column({ name: 'session_id', type: 'uuid', nullable: true })
  sessionId: string | null;

  @Column({ name: 'actor_staff_id', type: 'uuid' })
  actorStaffId: string;

  @Column({ type: 'text' })
  action: AdminActionType;

  @Column({ name: 'queue_item_id', type: 'uuid', nullable: true })
  queueItemId: string | null;

  @Column({ type: 'jsonb', default: {} })
  details: Record<string, unknown>;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt: Date;

  @ManyToOne(() => VenueStaff)
  @JoinColumn([
    {
      name: 'venue_id',
      referencedColumnName: 'venueId',
      foreignKeyConstraintName: 'admin_actions_venue_id_actor_staff_id_fkey',
    },
    { name: 'actor_staff_id', referencedColumnName: 'staffUserId' },
  ])
  actorStaff: VenueStaff;

  @ManyToOne(() => MusicSession)
  @JoinColumn([
    {
      name: 'session_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'admin_actions_session_id_venue_id_fkey',
    },
    { name: 'venue_id', referencedColumnName: 'venueId' },
  ])
  session: MusicSession | null;

  @ManyToOne(() => QueueItem)
  @JoinColumn([
    {
      name: 'queue_item_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'admin_actions_queue_item_id_session_id_fkey',
    },
    { name: 'session_id', referencedColumnName: 'sessionId' },
  ])
  queueItem: QueueItem | null;
}
