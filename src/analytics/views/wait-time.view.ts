import { ViewColumn, ViewEntity } from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { numberFromString } from '../../database/transformers/number-from-string.transformer';

// Tiempo que espero cada solicitud hasta empezar a sonar.
// Vista de solo lectura: la crea la migracion con el SQL del esquema de referencia.
@ViewEntity({ name: 'v_wait_times', schema: TUNIO_SCHEMA, synchronize: false })
export class WaitTimeView {
  @ViewColumn({ name: 'session_id' })
  sessionId: string;

  @ViewColumn({ name: 'queue_item_id' })
  queueItemId: string;

  @ViewColumn({ name: 'song_id' })
  songId: string;

  @ViewColumn({ name: 'requested_at' })
  requestedAt: Date;

  @ViewColumn({ name: 'playback_started_at' })
  playbackStartedAt: Date;

  @ViewColumn({ name: 'wait_seconds', transformer: numberFromString })
  waitSeconds: number;
}
