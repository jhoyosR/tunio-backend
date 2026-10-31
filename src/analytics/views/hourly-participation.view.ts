import { ViewColumn, ViewEntity } from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { numberFromString } from '../../database/transformers/number-from-string.transformer';

// Participacion por franja horaria en la zona horaria fija del sistema.
// Vista de solo lectura: la crea la migracion con el SQL del esquema de referencia.
@ViewEntity({
  name: 'v_hourly_participation',
  schema: TUNIO_SCHEMA,
  synchronize: false,
})
export class HourlyParticipationView {
  @ViewColumn({ name: 'venue_id' })
  venueId: string;

  @ViewColumn({ name: 'session_id' })
  sessionId: string;

  // TIMESTAMP sin zona: ya es la hora local de America/Bogota.
  @ViewColumn({ name: 'local_hour' })
  localHour: Date;

  @ViewColumn({ name: 'total_votes', transformer: numberFromString })
  totalVotes: number;

  @ViewColumn({ name: 'unique_devices', transformer: numberFromString })
  uniqueDevices: number;
}
