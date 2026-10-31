import { ViewColumn, ViewEntity } from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { numberFromString } from '../../database/transformers/number-from-string.transformer';

// Cola en vivo: solo PENDING, ordenada por votos y desempatada por antiguedad.
// approxWaitSeconds incluye lo que resta de la cancion en curso.
// Vista de solo lectura: la crea la migracion con el SQL del esquema de referencia.
@ViewEntity({ name: 'v_live_queue', schema: TUNIO_SCHEMA, synchronize: false })
export class LiveQueueView {
  @ViewColumn({ name: 'queue_item_id' })
  queueItemId: string;

  @ViewColumn({ name: 'session_id' })
  sessionId: string;

  @ViewColumn({ name: 'song_id' })
  songId: string;

  @ViewColumn({ name: 'requested_at' })
  requestedAt: Date;

  @ViewColumn()
  title: string;

  @ViewColumn({ name: 'artist_display' })
  artistDisplay: string | null;

  @ViewColumn({ name: 'thumbnail_url' })
  thumbnailUrl: string | null;

  @ViewColumn({ name: 'duration_seconds' })
  durationSeconds: number;

  @ViewColumn({ name: 'vote_count', transformer: numberFromString })
  voteCount: number;

  @ViewColumn({ name: 'queue_position', transformer: numberFromString })
  queuePosition: number;

  @ViewColumn({ name: 'approx_wait_seconds', transformer: numberFromString })
  approxWaitSeconds: number;
}
