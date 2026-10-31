import { ViewColumn, ViewEntity } from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { numberFromString } from '../../database/transformers/number-from-string.transformer';

// Diagnostico: cuanto acaparan las tres canciones mas votadas de la sesion.
// Vista de solo lectura: la crea la migracion con el SQL del esquema de referencia.
@ViewEntity({
  name: 'v_vote_concentration',
  schema: TUNIO_SCHEMA,
  synchronize: false,
})
export class VoteConcentrationView {
  @ViewColumn({ name: 'session_id' })
  sessionId: string;

  @ViewColumn({ name: 'total_votes', transformer: numberFromString })
  totalVotes: number;

  @ViewColumn({ name: 'top3_votes', transformer: numberFromString })
  top3Votes: number;

  // NULL si la sesion no tiene votos.
  @ViewColumn({ name: 'top3_share_pct', transformer: numberFromString })
  top3SharePct: number | null;
}
