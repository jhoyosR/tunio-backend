import { TUNIO_SCHEMA } from '../database/database.constants';

// Una sesion concreta, o las de un rango de dias. Siempre de un solo local.
export interface SessionScope {
  venueId: string;
  sessionId?: string;
  from?: string;
  to?: string;
}

export interface ScopeSubquery {
  sql: string;
  params: Record<string, unknown>;
}

// Regla de la noche (docs/08 §2, decision 24): una sesion pertenece al dia
// local en que empezo, y entran todos sus hechos aunque pasen de la
// medianoche. Asi «la noche del viernes» es la misma en todos los
// indicadores y la suma de las noches da el periodo. Devuelve un SELECT de
// ids para usar como `session_id IN (...)`; los parametros llevan prefijo
// para no chocar con los de la consulta que lo incluye.
export function sessionsInScope(
  scope: SessionScope,
  timezone: string,
): ScopeSubquery {
  const conditions = ['scope_session.venue_id = :scopeVenueId'];
  const params: Record<string, unknown> = {
    scopeVenueId: scope.venueId,
    scopeTimezone: timezone,
  };
  if (scope.sessionId) {
    conditions.push('scope_session.id = :scopeSessionId');
    params.scopeSessionId = scope.sessionId;
  }
  if (scope.from) {
    conditions.push(
      'scope_session.started_at >= CAST(CAST(:scopeFrom AS date) AS timestamp) AT TIME ZONE :scopeTimezone',
    );
    params.scopeFrom = scope.from;
  }
  if (scope.to) {
    conditions.push(
      'scope_session.started_at < CAST(CAST(:scopeTo AS date) + 1 AS timestamp) AT TIME ZONE :scopeTimezone',
    );
    params.scopeTo = scope.to;
  }
  return {
    sql: `SELECT scope_session.id FROM ${TUNIO_SCHEMA}.music_sessions scope_session WHERE ${conditions.join(' AND ')}`,
    params,
  };
}
