import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Request } from 'express';
import { StaffRole } from '../../staff/entities/venue-staff.entity';
import { AuthenticatedStaff } from '../interfaces/authenticated-staff.interface';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const WITHOUT_VENUE_SCOPE_KEY = 'withoutVenueScope';

// Ruta sin credencial: login, salud, y lo que usan la app del cliente y la
// pantalla del bar. Los guards globales protegen todo lo demas.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Restringe la ruta a ciertos roles dentro del establecimiento de :venueId.
// Sin este decorador, basta con pertenecer al local con cualquier rol.
export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES_KEY, roles);

// Excepcion explicita para rutas del personal que no operan sobre un local
// (p. ej. /auth/me). Sin ella, una ruta autenticada sin :venueId se rechaza.
export const WithoutVenueScope = () =>
  SetMetadata(WITHOUT_VENUE_SCOPE_KEY, true);

export const CurrentStaff = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedStaff =>
    context.switchToHttp().getRequest<Request>().user as AuthenticatedStaff,
);
