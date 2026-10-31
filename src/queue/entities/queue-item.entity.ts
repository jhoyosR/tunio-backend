import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { Song } from '../../catalog/entities/song.entity';
import { MusicSession } from '../../sessions/entities/music-session.entity';
import { SessionDevice } from '../../sessions/entities/session-device.entity';

export type QueueItemStatus =
  | 'PENDING'
  | 'PLAYING'
  | 'PLAYED'
  | 'SKIPPED'
  | 'REMOVED'
  | 'BLOCKED'
  | 'UNAVAILABLE';

// Entrada de cola: una cancion solicitada dentro de una sesion. Es la unidad
// sobre la que se vota.
@Entity({ name: 'queue_items', schema: TUNIO_SCHEMA })
// Soporte para las claves compuestas de votes, playbacks y admin_actions.
@Unique('queue_items_id_session_id_key', ['id', 'sessionId'])
@Check(
  'queue_items_status_check',
  `status IN ('PENDING','PLAYING','PLAYED','SKIPPED','REMOVED','BLOCKED','UNAVAILABLE')`,
)
@Check(
  'queue_items_check',
  'finished_at IS NULL OR finished_at >= requested_at',
)
// Red de seguridad de la concurrencia de "pedir o votar": aunque dos
// peticiones simultaneas burlen el bloqueo pesimista, la segunda insercion
// falla con este indice y el servicio la convierte en voto. No quitarlo.
@Index('uq_active_song_per_session', ['sessionId', 'songId'], {
  unique: true,
  where: `status IN ('PENDING', 'PLAYING')`,
})
@Index('idx_queue_session_status', ['sessionId', 'status', 'requestedAt'])
// Ordena requested_at DESC, que @Index no sabe expresar: lo crea la migracion.
@Index('idx_queue_device_time', { synchronize: false })
export class QueueItem {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'queue_items_pkey',
  })
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'song_id', type: 'uuid' })
  songId: string;

  @Column({ name: 'requested_by_device_id', type: 'uuid' })
  requestedByDeviceId: string;

  @Column({ type: 'text', default: 'PENDING' })
  status: QueueItemStatus;

  @Column({
    name: 'requested_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  requestedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @ManyToOne(() => MusicSession)
  @JoinColumn({
    name: 'session_id',
    foreignKeyConstraintName: 'queue_items_session_id_fkey',
  })
  session: MusicSession;

  @ManyToOne(() => Song)
  @JoinColumn({
    name: 'song_id',
    foreignKeyConstraintName: 'queue_items_song_id_fkey',
  })
  song: Song;

  // Quien la pide tiene que estar adherido a esta misma sesion.
  @ManyToOne(() => SessionDevice)
  @JoinColumn([
    {
      name: 'session_id',
      referencedColumnName: 'sessionId',
      foreignKeyConstraintName:
        'queue_items_session_id_requested_by_device_id_fkey',
    },
    { name: 'requested_by_device_id', referencedColumnName: 'deviceId' },
  ])
  requestedByDevice: SessionDevice;
}
