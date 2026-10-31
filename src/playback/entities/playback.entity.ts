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
import { Song } from '../../catalog/entities/song.entity';
import { QueueItem } from '../../queue/entities/queue-item.entity';
import { MusicSession } from '../../sessions/entities/music-session.entity';

export type PlaybackSource = 'QUEUE' | 'DEFAULT_PLAYLIST';

export type PlaybackStatus =
  'PLAYING' | 'COMPLETED' | 'SKIPPED' | 'UNAVAILABLE' | 'ERROR';

// Lo que realmente sono, venga de la cola o de la lista por defecto.
// No referencia default_playlist_tracks a proposito: asi se puede quitar de
// la lista una cancion que ya sono. Sin columnas de pausa: no hay pausa de cancion.
@Entity({ name: 'playbacks', schema: TUNIO_SCHEMA })
@Check('playbacks_source_check', `source IN ('QUEUE', 'DEFAULT_PLAYLIST')`)
@Check(
  'playbacks_status_check',
  `status IN ('PLAYING','COMPLETED','SKIPPED','UNAVAILABLE','ERROR')`,
)
@Check(
  'playbacks_check',
  `(source = 'QUEUE'            AND queue_item_id IS NOT NULL)
      OR (source = 'DEFAULT_PLAYLIST' AND queue_item_id IS NULL)`,
)
@Check(
  'playbacks_check1',
  `(status =  'PLAYING' AND ended_at IS NULL)
      OR (status <> 'PLAYING' AND ended_at IS NOT NULL)`,
)
@Check('playbacks_check2', 'ended_at IS NULL OR ended_at >= started_at')
// Una sola reproduccion en curso por sesion.
@Index('uq_one_playback_running_per_session', ['sessionId'], {
  unique: true,
  where: `status = 'PLAYING'`,
})
@Index('idx_playbacks_session_time', ['sessionId', 'startedAt'])
@Index('idx_playbacks_queue_item', ['queueItemId'])
export class Playback {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'playbacks_pkey',
  })
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @Column({ name: 'song_id', type: 'uuid' })
  songId: string;

  @Column({ type: 'text' })
  source: PlaybackSource;

  @Column({ name: 'queue_item_id', type: 'uuid', nullable: true })
  queueItemId: string | null;

  @Column({ type: 'text', default: 'PLAYING' })
  status: PlaybackStatus;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @ManyToOne(() => Song)
  @JoinColumn({
    name: 'song_id',
    foreignKeyConstraintName: 'playbacks_song_id_fkey',
  })
  song: Song;

  @ManyToOne(() => MusicSession)
  @JoinColumn([
    {
      name: 'session_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'playbacks_session_id_venue_id_fkey',
    },
    { name: 'venue_id', referencedColumnName: 'venueId' },
  ])
  session: MusicSession;

  // La entrada de cola que suena es de esta misma sesion. Con queue_item_id
  // NULL (lista por defecto) la clave no se evalua: MATCH SIMPLE.
  @ManyToOne(() => QueueItem)
  @JoinColumn([
    {
      name: 'queue_item_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'playbacks_queue_item_id_session_id_fkey',
    },
    { name: 'session_id', referencedColumnName: 'sessionId' },
  ])
  queueItem: QueueItem | null;
}
