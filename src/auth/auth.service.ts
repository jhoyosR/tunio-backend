import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { toPermissionResponseDto } from '../permissions/permissions.mapper';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepository: Repository<PasswordResetToken>,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    // Set por codigo (slug) para deduplicar sin perder el nombre en lenguaje natural.
    const permissionsByCode = new Map<
      string,
      ReturnType<typeof toPermissionResponseDto>
    >();
    for (const role of user.roles) {
      for (const permission of role.permissions) {
        permissionsByCode.set(
          permission.name,
          toPermissionResponseDto(permission),
        );
      }
    }
    const permissions = [...permissionsByCode.values()].map(
      ({ code, name }) => ({ code, name }),
    );
    const roles = user.roles.map((role) => role.name);

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        roles,
        permissions,
      },
    };
  }

  // Responde igual exista o no el email, para no filtrar que emails estan registrados.
  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(
      rawToken,
      this.configService.get<number>('bcryptSaltRounds')!,
    );
    const expirationMinutes = this.configService.get<number>(
      'passwordResetExpirationMinutes',
    )!;

    await this.passwordResetTokenRepository.save(
      this.passwordResetTokenRepository.create({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + expirationMinutes * 60_000),
      }),
    );

    await this.mailService.sendMail({
      to: user.email,
      subject: 'Restablecimiento de contrasena',
      html: `<p>Usa el siguiente token para restablecer tu contrasena (expira en ${expirationMinutes} minutos):</p><p><strong>${rawToken}</strong></p>`,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const candidates = await this.passwordResetTokenRepository.find({
      where: { usedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    const now = new Date();
    let matchingToken: PasswordResetToken | undefined;
    for (const candidate of candidates) {
      if (candidate.expiresAt < now) {
        continue;
      }
      const matches = await bcrypt.compare(token, candidate.tokenHash);
      if (matches) {
        matchingToken = candidate;
        break;
      }
    }

    if (!matchingToken) {
      throw new UnauthorizedException('Token invalido o expirado');
    }

    await this.usersService.updatePassword(matchingToken.userId, newPassword);
    matchingToken.usedAt = now;
    await this.passwordResetTokenRepository.save(matchingToken);
  }
}
