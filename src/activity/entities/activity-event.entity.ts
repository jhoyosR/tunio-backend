import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { Song } from '../../catalog/entities/song.entity';
import { MusicSession } from '../../sessions/entities/music-session.entity';
import { SessionDevice } from '../../sessions/entities/session-device.entity';
import { StaffUser } from '../../staff/entities/staff-user.entity';
import { Venue } from '../../venues/entities/venue.entity';

// Diccionario cerrado de tipos de evento (TRA-03). La base no lo restringe.
export type ActivityEventType =
  | 'SONG_REQUESTED'
  | 'VOTE_CAST'
  | 'VOTE_REJECTED'
  | 'PLAYBACK_STARTED'
  | 'PLAYBACK_COMPLETED'
  | 'PLAYBACK_SKIPPED'
  | 'PLAYBACK_UNAVAILABLE'
  | 'PLAYBACK_ERROR'
  | 'SESSION_ACTIVE'
  | 'SESSION_PAUSED'
  | 'SESSION_CLOSED'
  | 'DEVICE_JOINED'
  | 'QR_SCANNED'
  | 'SEARCH_PERFORMED'
  | 'SEARCH_RESULT_SELECTED'
  | 'ADMIN_ACTION';

// Materia prima de la analitica. Ya no hay triggers: los emite el servicio de
// eventos dentro de la misma transaccion que el hecho que registran.
// Identidad BIGINT creciente para extraccion incremental.
@Entity({ name: 'activity_events', schema: TUNIO_SCHEMA })
// Los tres ordenan occurred_at DESC, que @Index no sabe expresar: los crea
// la migracion.
@Index('idx_activity_venue_time', { synchronize: false })
@Index('idx_activity_session_time', { synchronize: false })
@Index('idx_activity_type_time', { synchronize: false })
export class ActivityEvent {
  // BIGINT llega como texto desde node-postgres.
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'activity_events_pkey',
  })
  id: string;

  // Denormalizado para extraer sin unir con music_sessions.
  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  // Nulable: hay eventos fuera de sesion (busquedas, accesos).
  @Column({ name: 'session_id', type: 'uuid', nullable: true })
  sessionId: string | null;

  @Column({ name: 'song_id', type: 'uuid', nullable: true })
  songId: string | null;

  @Column({ name: 'device_id', type: 'uuid', nullable: true })
  deviceId: string | null;

  @Column({ name: 'staff_user_id', type: 'uuid', nullable: true })
  staffUserId: string | null;

  @Column({ name: 'event_type', type: 'text' })
  eventType: ActivityEventType;

  @Column({ type: 'jsonb', default: {} })
  details: Record<string, unknown>;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt: Date;

  @ManyToOne(() => Venue)
  @JoinColumn({
    name: 'venue_id',
    foreignKeyConstraintName: 'activity_events_venue_id_fkey',
  })
  venue: Venue;

  // Se conserva la clave simple del esquema de referencia aunque la compuesta
  // de sessionInVenue ya la cubre.
  @ManyToOne(() => MusicSession)
  @JoinColumn({
    name: 'session_id',
    foreignKeyConstraintName: 'activity_events_session_id_fkey',
  })
  session: MusicSession | null;

  // venue_id es denormalizado, pero debe coincidir con el de la sesion.
  @ManyToOne(() => MusicSession)
  @JoinColumn([
    {
      name: 'session_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'activity_events_session_id_venue_id_fkey',
    },
    { name: 'venue_id', referencedColumnName: 'venueId' },
  ])
  sessionInVenue: MusicSession | null;

  @ManyToOne(() => Song)
  @JoinColumn({
    name: 'song_id',
    foreignKeyConstraintName: 'activity_events_song_id_fkey',
  })
  song: Song | null;

  @ManyToOne(() => StaffUser)
  @JoinColumn({
    name: 'staff_user_id',
    foreignKeyConstraintName: 'activity_events_staff_user_id_fkey',
  })
  staffUser: StaffUser | null;

  @ManyToOne(() => SessionDevice)
  @JoinColumn([
    {
      name: 'session_id',
      referencedColumnName: 'sessionId',
      foreignKeyConstraintName: 'activity_events_session_id_device_id_fkey',
    },
    { name: 'device_id', referencedColumnName: 'deviceId' },
  ])
  device: SessionDevice | null;
}
