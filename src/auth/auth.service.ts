import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaffUser } from '../staff/entities/staff-user.entity';
import { StaffRole, VenueStaff } from '../staff/entities/venue-staff.entity';
import { JwtPayload } from './interfaces/authenticated-staff.interface';
import { verifyPassword } from './password';

// Hash bcrypt de un valor aleatorio descartado. Se compara contra el cuando
// el correo no existe, para que la respuesta tarde lo mismo y no delate
// que correos estan registrados.
const DUMMY_PASSWORD_HASH =
  '$2b$12$vp9oEdlZYl2tpp4qEQZr5e2oSfwa28vyxGugqw590uqSFl9uamkxS';

export interface VenueMembership {
  venueId: string;
  venueName: string;
  role: StaffRole;
}

// La web adapta el menu al rol de cada local (decision 19).
export interface StaffProfile {
  id: string;
  displayName: string;
  email: string;
  venues: VenueMembership[];
}

export interface LoginResult {
  accessToken: string;
  expiresAt: string;
  staff: StaffProfile;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(StaffUser)
    private readonly staffUserRepository: Repository<StaffUser>,
    @InjectRepository(VenueStaff)
    private readonly venueStaffRepository: Repository<VenueStaff>,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const staff = await this.staffUserRepository.findOneBy({ email });
    const passwordMatches = await verifyPassword(
      password,
      staff?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    // Mismo mensaje para los tres casos: no se revela cual fallo.
    if (!staff || !staff.isActive || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = { sub: staff.id };
    const accessToken = this.jwtService.sign(payload);
    const { exp } = this.jwtService.decode<{ exp: number }>(accessToken);

    return {
      accessToken,
      expiresAt: new Date(exp * 1000).toISOString(),
      staff: await this.buildProfile(staff),
    };
  }

  async getProfile(staffId: string): Promise<StaffProfile> {
    const staff = await this.staffUserRepository.findOneBy({ id: staffId });
    // Un token aun vigente de alguien desactivado no debe seguir sirviendo.
    if (!staff || !staff.isActive) {
      throw new UnauthorizedException();
    }
    return this.buildProfile(staff);
  }

  private async buildProfile(staff: StaffUser): Promise<StaffProfile> {
    const memberships = await this.venueStaffRepository.find({
      where: { staffUserId: staff.id },
      relations: { venue: true },
      order: { venue: { name: 'ASC' } },
    });

    return {
      id: staff.id,
      displayName: staff.displayName,
      email: staff.email,
      venues: memberships.map((membership) => ({
        venueId: membership.venueId,
        venueName: membership.venue.name,
        role: membership.role,
      })),
    };
  }
}
