import { isUUID } from 'class-validator';
import { Repository } from 'typeorm';
import { StaffRole, VenueStaff } from '../staff/entities/venue-staff.entity';

// Rol de la persona en el local, o null si no pertenece a el o esta
// desactivada. Una sola regla para el HTTP (VenueAccessGuard) y el WebSocket
// (LiveQueueGateway): se lee de la base, no del token, para que retirar a
// alguien de un local surta efecto ya.
export async function findActiveVenueRole(
  venueStaffRepository: Repository<VenueStaff>,
  staffId: string,
  venueId: string,
): Promise<StaffRole | null> {
  // Un id mal formado haria fallar la consulta con un 500.
  if (!isUUID(venueId)) {
    return null;
  }
  const membership = await venueStaffRepository.findOne({
    where: { venueId, staffUserId: staffId, staffUser: { isActive: true } },
    relations: { staffUser: true },
  });
  return membership?.role ?? null;
}
