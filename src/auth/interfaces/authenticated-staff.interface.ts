import { StaffRole } from '../../staff/entities/venue-staff.entity';

// Contenido del token. Solo la identidad: los roles se leen de la base en
// cada peticion, para que retirar a alguien de un local surta efecto ya y
// no cuando caduque su token.
export interface JwtPayload {
  sub: string;
}

// Lo que los guards dejan en request.user.
export interface AuthenticatedStaff {
  staffId: string;
  // Presentes solo en rutas con :venueId, ya validadas contra venue_staff.
  venueId?: string;
  role?: StaffRole;
}
