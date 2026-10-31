import { ViewColumn, ViewEntity } from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { numberFromString } from '../../database/transformers/number-from-string.transformer';
import type { QueueItemStatus } from '../../queue/entities/queue-item.entity';

// Definicion unica de "solicitud no reproducida": entrada que nunca tuvo una
// reproduccion PLAYING o COMPLETED y que ya no puede sonar. v_session_summary
// cuenta sobre esta misma vista.
// Vista de solo lectura: la crea la migracion con el SQL del esquema de referencia.
@ViewEntity({
  name: 'v_unplayed_requests',
  schema: TUNIO_SCHEMA,
  synchronize: false,
})
export class UnplayedRequestView {
  @ViewColumn({ name: 'session_id' })
  sessionId: string;

  @ViewColumn({ name: 'queue_item_id' })
  queueItemId: string;

  @ViewColumn({ name: 'song_id' })
  songId: string;

  @ViewColumn()
  title: string;

  @ViewColumn({ name: 'artist_display' })
  artistDisplay: string | null;

  @ViewColumn()
  status: QueueItemStatus;

  @ViewColumn({ name: 'requested_at' })
  requestedAt: Date;

  @ViewColumn({ name: 'vote_count', transformer: numberFromString })
  voteCount: number;

  @ViewColumn()
  reason: string;
}
