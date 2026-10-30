import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret')!,
    });
  }

  // Se re-consulta el usuario en cada request (en vez de confiar solo en el
  // payload del token) para que un cambio de roles/permisos o una desactivacion
  // tengan efecto inmediato sin esperar a que el JWT expire.
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.usersService.findEntityById(payload.sub, true);
    if (!user.isActive) {
      throw new UnauthorizedException('Usuario inactivo');
    }
    return {
      id: user.id,
      email: user.email,
      roles: user.roles.map((role) => role.name),
      permissions: [
        ...new Set(
          user.roles.flatMap((role) =>
            role.permissions.map((permission) => permission.name),
          ),
        ),
      ],
    };
  }
}
