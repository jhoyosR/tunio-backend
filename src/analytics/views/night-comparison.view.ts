import { ViewColumn, ViewEntity } from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { numberFromString } from '../../database/transformers/number-from-string.transformer';

// Comparativo por noche, solo sesiones cerradas. weekday es ISO: 1 = lunes.
// Vista de solo lectura: la crea la migracion con el SQL del esquema de referencia.
@ViewEntity({
  name: 'v_night_comparison',
  schema: TUNIO_SCHEMA,
  synchronize: false,
})
export class NightComparisonView {
  @ViewColumn({ name: 'venue_id' })
  venueId: string;

  @ViewColumn({ name: 'session_id' })
  sessionId: string;

  @ViewColumn({ name: 'event_name' })
  eventName: string | null;

  // DATE en la zona horaria del sistema.
  @ViewColumn({ name: 'night_date' })
  nightDate: Date;

  @ViewColumn()
  weekday: number;

  @ViewColumn({ name: 'unique_devices', transformer: numberFromString })
  uniqueDevices: number;

  @ViewColumn({ name: 'song_requests', transformer: numberFromString })
  songRequests: number;

  @ViewColumn({ name: 'total_votes', transformer: numberFromString })
  totalVotes: number;

  @ViewColumn({ name: 'completed_playbacks', transformer: numberFromString })
  completedPlaybacks: number;

  @ViewColumn({ name: 'unplayed_requests', transformer: numberFromString })
  unplayedRequests: number;
}
