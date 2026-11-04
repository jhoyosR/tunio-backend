import { EntityManager, In } from 'typeorm';
import { MusicSession } from './entities/music-session.entity';
import { OPEN_SESSION_STATUSES } from './sessions.service';

// Toma FOR UPDATE la sesion abierta del local (ACTIVE o PAUSED), en la
// transaccion del llamador. Es el bloqueo que serializa todo lo que mueve la
// cola o lo que suena: el reproductor, el mantenimiento y la moderacion.
// Espera a las solicitudes en curso, que toman la sesion FOR SHARE, y retiene
// las nuevas hasta confirmar. Todos los caminos toman la sesion antes que
// nada, asi que bloquean en el mismo orden y no se interbloquean.
// null = el servicio esta cerrado.
export function lockOpenSession(
  manager: EntityManager,
  venueId: string,
): Promise<MusicSession | null> {
  return manager
    .createQueryBuilder(MusicSession, 'session')
    .setLock('pessimistic_write')
    .where('session.venue_id = :venueId', { venueId })
    .andWhere({ status: In(OPEN_SESSION_STATUSES) })
    .getOne();
}
