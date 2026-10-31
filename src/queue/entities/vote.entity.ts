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
import { SessionDevice } from '../../sessions/entities/session-device.entity';
import { QueueItem } from './queue-item.entity';

// REQUEST es el voto implicito de quien pide la cancion; VOTE, el apoyo posterior.
export type VoteOrigin = 'REQUEST' | 'VOTE';

// Un voto por dispositivo y entrada de cola (no por sesion y cancion): si la
// cancion sale de la cola y se vuelve a pedir, nace una entrada nueva votable.
@Entity({ name: 'votes', schema: TUNIO_SCHEMA })
// Su violacion se traduce en "ya votaste esta cancion".
@Unique('votes_queue_item_id_device_id_key', ['queueItemId', 'deviceId'])
@Check('votes_origin_check', `origin IN ('REQUEST', 'VOTE')`)
@Index('idx_votes_queue_item', ['queueItemId'])
@Index('idx_votes_session_time', ['sessionId', 'votedAt'])
export class Vote {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'votes_pkey' })
  id: string;

  @Column({ name: 'queue_item_id', type: 'uuid' })
  queueItemId: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'device_id', type: 'uuid' })
  deviceId: string;

  @Column({ type: 'text' })
  origin: VoteOrigin;

  @Column({ name: 'voted_at', type: 'timestamptz', default: () => 'now()' })
  votedAt: Date;

  // Las dos claves comparten session_id: la entrada votada y el dispositivo
  // que vota pertenecen a la misma sesion, y por tanto al mismo local.
  @ManyToOne(() => QueueItem)
  @JoinColumn([
    {
      name: 'queue_item_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'votes_queue_item_id_session_id_fkey',
    },
    { name: 'session_id', referencedColumnName: 'sessionId' },
  ])
  queueItem: QueueItem;

  @ManyToOne(() => SessionDevice)
  @JoinColumn([
    {
      name: 'session_id',
      referencedColumnName: 'sessionId',
      foreignKeyConstraintName: 'votes_session_id_device_id_fkey',
    },
    { name: 'device_id', referencedColumnName: 'deviceId' },
  ])
  device: SessionDevice;
}
