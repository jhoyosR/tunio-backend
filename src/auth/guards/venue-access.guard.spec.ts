import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Repository } from 'typeorm';
import { VenueStaff } from '../../staff/entities/venue-staff.entity';
import {
  IS_PUBLIC_KEY,
  ROLES_KEY,
  WITHOUT_VENUE_SCOPE_KEY,
} from '../decorators/auth.decorators';
import { AuthenticatedStaff } from '../interfaces/authenticated-staff.interface';
import { VenueAccessGuard } from './venue-access.guard';

const VENUE_A = '11111111-1111-4111-8111-111111111111';
const STAFF_ID = '22222222-2222-4222-8222-222222222222';

describe('VenueAccessGuard', () => {
  const findOne = jest.fn();
  const repository = { findOne } as unknown as Repository<VenueStaff>;
  let metadata: Record<string, unknown>;
  let guard: VenueAccessGuard;

  const reflector = {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;

  function contextFor(
    user: AuthenticatedStaff | undefined,
    params: Record<string, string> = {},
  ): ExecutionContext {
    const request = { user, params };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    findOne.mockReset();
    metadata = {};
    guard = new VenueAccessGuard(reflector, repository);
  });

  it('deja pasar las rutas publicas sin consultar la base', async () => {
    metadata[IS_PUBLIC_KEY] = true;

    await expect(guard.canActivate(contextFor(undefined))).resolves.toBe(true);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('rechaza con 401 si no hay personal autenticado', async () => {
    await expect(
      guard.canActivate(contextFor(undefined, { venueId: VENUE_A })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('falla cerrado en rutas autenticadas sin :venueId', async () => {
    await expect(
      guard.canActivate(contextFor({ staffId: STAFF_ID })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('admite rutas sin :venueId marcadas explicitamente', async () => {
    metadata[WITHOUT_VENUE_SCOPE_KEY] = true;

    await expect(
      guard.canActivate(contextFor({ staffId: STAFF_ID })),
    ).resolves.toBe(true);
  });

  it('rechaza a quien no pertenece al establecimiento', async () => {
    findOne.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        contextFor({ staffId: STAFF_ID }, { venueId: VENUE_A }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza un :venueId mal formado sin llegar a la base', async () => {
    await expect(
      guard.canActivate(
        contextFor({ staffId: STAFF_ID }, { venueId: 'not-a-uuid' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('rechaza un rol que la ruta no admite', async () => {
    metadata[ROLES_KEY] = ['ADMIN'];
    findOne.mockResolvedValue({ role: 'DJ' });

    await expect(
      guard.canActivate(
        contextFor({ staffId: STAFF_ID }, { venueId: VENUE_A }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deja pasar al miembro y adjunta establecimiento y rol', async () => {
    metadata[ROLES_KEY] = ['ADMIN', 'DJ'];
    findOne.mockResolvedValue({ role: 'DJ' });
    const staff: AuthenticatedStaff = { staffId: STAFF_ID };

    await expect(
      guard.canActivate(contextFor(staff, { venueId: VENUE_A })),
    ).resolves.toBe(true);
    expect(staff).toEqual({ staffId: STAFF_ID, venueId: VENUE_A, role: 'DJ' });
  });
});
