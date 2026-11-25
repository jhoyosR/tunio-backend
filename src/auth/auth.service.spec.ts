import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { StaffUser } from '../staff/entities/staff-user.entity';
import { VenueStaff } from '../staff/entities/venue-staff.entity';
import { AuthService } from './auth.service';
import { hashPassword } from './password';

describe('AuthService', () => {
  const PASSWORD = 'correct horse battery staple';
  let passwordHash: string;
  const findOneBy = jest.fn();
  const findMemberships = jest.fn();
  const jwtService = new JwtService({
    secret: 'unit-test-secret',
    signOptions: { expiresIn: 3600 },
  });
  let service: AuthService;

  const activeStaff = (): Partial<StaffUser> => ({
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'DJ Uno',
    email: 'dj@bar-a.test',
    passwordHash,
    isActive: true,
  });

  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
  });

  beforeEach(() => {
    findOneBy.mockReset();
    findMemberships.mockReset().mockResolvedValue([
      {
        venueId: '11111111-1111-4111-8111-111111111111',
        venue: { name: 'Bar A' },
        role: 'DJ',
      },
    ]);
    service = new AuthService(
      jwtService,
      { findOneBy } as unknown as Repository<StaffUser>,
      { find: findMemberships } as unknown as Repository<VenueStaff>,
    );
  });

  it('emite un token con caducidad y el perfil con sus locales', async () => {
    findOneBy.mockResolvedValue(activeStaff());

    const result = await service.login('dj@bar-a.test', PASSWORD);

    const payload = jwtService.verify<{ sub: string; exp: number }>(
      result.accessToken,
    );
    expect(payload.sub).toBe(activeStaff().id);
    expect(result.expiresAt).toBe(new Date(payload.exp * 1000).toISOString());
    expect(result.staff.venues).toEqual([
      {
        venueId: '11111111-1111-4111-8111-111111111111',
        venueName: 'Bar A',
        role: 'DJ',
      },
    ]);
    // El hash nunca sale en la respuesta.
    expect(JSON.stringify(result)).not.toContain(passwordHash);
  });

  it('rechaza una contrasena incorrecta', async () => {
    findOneBy.mockResolvedValue(activeStaff());

    await expect(
      service.login('dj@bar-a.test', 'wrong'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un correo inexistente con el mismo error', async () => {
    findOneBy.mockResolvedValue(null);

    await expect(service.login('nobody@bar-a.test', PASSWORD)).rejects.toThrow(
      'Invalid credentials',
    );
  });

  it('rechaza al personal desactivado aunque la contrasena sea correcta', async () => {
    findOneBy.mockResolvedValue({ ...activeStaff(), isActive: false });

    await expect(service.login('dj@bar-a.test', PASSWORD)).rejects.toThrow(
      'Invalid credentials',
    );
  });

  it('no devuelve perfil a un token de alguien ya desactivado', async () => {
    findOneBy.mockResolvedValue({ ...activeStaff(), isActive: false });

    await expect(service.getProfile(activeStaff().id!)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
