import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { StaffRole, VenueStaff } from '../../staff/entities/venue-staff.entity';
import {
  IS_PUBLIC_KEY,
  ROLES_KEY,
  WITHOUT_VENUE_SCOPE_KEY,
} from '../decorators/auth.decorators';
import { AuthenticatedStaff } from '../interfaces/authenticated-staff.interface';

export const VENUE_ROUTE_PARAM = 'venueId';

// Guard global de establecimiento. Toda ruta del personal debe colgar de
// /venues/:venueId/... y aqui se comprueba, contra la base, que quien llama
// pertenece a ese local y con que rol. Falla cerrado: una ruta autenticada
// sin :venueId se rechaza salvo que se marque con @WithoutVenueScope(), para
// que olvidar el chequeo en una ruta nueva no abra un hueco entre locales.
@Injectable()
export class VenueAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(VenueStaff)
    private readonly venueStaffRepository: Repository<VenueStaff>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.getMetadata<boolean>(IS_PUBLIC_KEY, context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const staff = request.user as AuthenticatedStaff | undefined;
    // No depende del orden de registro de los guards globales.
    if (!staff) {
      throw new UnauthorizedException();
    }

    // Express tipa los parametros como string | string[] por los comodines;
    // un parametro con nombre como :venueId siempre es string.
    const venueId = request.params[VENUE_ROUTE_PARAM] as string | undefined;
    if (venueId === undefined) {
      if (this.getMetadata<boolean>(WITHOUT_VENUE_SCOPE_KEY, context)) {
        return true;
      }
      throw new ForbiddenException('Route is not scoped to a venue');
    }

    const role = await this.findActiveRole(staff.staffId, venueId);
    if (!role) {
      throw new ForbiddenException('No access to this venue');
    }

    const allowedRoles = this.getMetadata<StaffRole[]>(ROLES_KEY, context);
    if (allowedRoles && !allowedRoles.includes(role)) {
      throw new ForbiddenException('Insufficient role for this action');
    }

    staff.venueId = venueId;
    staff.role = role;
    return true;
  }

  private async findActiveRole(
    staffId: string,
    venueId: string,
  ): Promise<StaffRole | null> {
    // Un id mal formado haria fallar la consulta con un 500.
    if (!isUUID(venueId)) {
      return null;
    }
    const membership = await this.venueStaffRepository.findOne({
      where: { venueId, staffUserId: staffId, staffUser: { isActive: true } },
      relations: { staffUser: true },
    });
    return membership?.role ?? null;
  }

  private getMetadata<T>(
    key: string,
    context: ExecutionContext,
  ): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [
      context.getHandler(),
      context.getClass(),
    ]);
  }
}
