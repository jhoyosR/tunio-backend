import { ViewColumn, ViewEntity } from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { numberFromString } from '../../database/transformers/number-from-string.transformer';
import type { SessionStatus } from '../../sessions/entities/music-session.entity';

// Resumen por sesion: alimenta las tarjetas del panel y del tablero.
// Vista de solo lectura: la crea la migracion con el SQL del esquema de referencia.
@ViewEntity({
  name: 'v_session_summary',
  schema: TUNIO_SCHEMA,
  synchronize: false,
})
export class SessionSummaryView {
  @ViewColumn({ name: 'session_id' })
  sessionId: string;

  @ViewColumn({ name: 'venue_id' })
  venueId: string;

  @ViewColumn({ name: 'event_name' })
  eventName: string | null;

  @ViewColumn()
  status: SessionStatus;

  @ViewColumn({ name: 'started_at' })
  startedAt: Date;

  @ViewColumn({ name: 'ended_at' })
  endedAt: Date | null;

  @ViewColumn({ name: 'song_requests', transformer: numberFromString })
  songRequests: number;

  @ViewColumn({ name: 'total_votes', transformer: numberFromString })
  totalVotes: number;

  @ViewColumn({ name: 'unique_devices', transformer: numberFromString })
  uniqueDevices: number;

  @ViewColumn({ name: 'completed_playbacks', transformer: numberFromString })
  completedPlaybacks: number;

  @ViewColumn({ name: 'unplayed_requests', transformer: numberFromString })
  unplayedRequests: number;
}
