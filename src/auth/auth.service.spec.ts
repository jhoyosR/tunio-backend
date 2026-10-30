import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: { findByEmail: jest.Mock; updatePassword: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let mailService: { sendMail: jest.Mock };
  let tokenRepository: {
    save: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
  };

  const activeUser = {
    id: 'user-1',
    email: 'user@example.com',
    isActive: true,
    passwordHash: '',
    roles: [
      {
        name: 'editor',
        permissions: [
          { id: 'perm-1', name: 'users.read', description: 'Ver usuarios' },
          {
            id: 'perm-2',
            name: 'users.update',
            description: 'Actualizar usuarios',
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    activeUser.passwordHash = await bcrypt.hash('CorrectPass123!', 4);

    usersService = {
      findByEmail: jest.fn(),
      updatePassword: jest.fn(),
    };
    jwtService = { sign: jest.fn().mockReturnValue('signed-jwt') };
    mailService = { sendMail: jest.fn().mockResolvedValue(undefined) };
    tokenRepository = {
      save: jest.fn((token) => Promise.resolve(token)),
      create: jest.fn((data) => data),
      find: jest.fn(),
    };

    const configValues: Record<string, unknown> = {
      bcryptSaltRounds: 4,
      passwordResetExpirationMinutes: 30,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: MailService, useValue: mailService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => configValues[key]) },
        },
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: tokenRepository,
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login', () => {
    it('lanza UnauthorizedException con password incorrecta', async () => {
      usersService.findByEmail.mockResolvedValue(activeUser);

      await expect(
        service.login({ email: activeUser.email, password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el usuario esta inactivo', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...activeUser,
        isActive: false,
      });

      await expect(
        service.login({ email: activeUser.email, password: 'CorrectPass123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('devuelve accessToken con roles y permisos aplanados', async () => {
      usersService.findByEmail.mockResolvedValue(activeUser);

      const result = await service.login({
        email: activeUser.email,
        password: 'CorrectPass123!',
      });

      expect(result.accessToken).toBe('signed-jwt');
      expect(result.user.roles).toEqual(['editor']);
      expect(result.user.permissions).toEqual(
        expect.arrayContaining([
          { code: 'users.read', name: 'Ver usuarios' },
          { code: 'users.update', name: 'Actualizar usuarios' },
        ]),
      );
    });
  });

  describe('forgotPassword', () => {
    it('no envia correo ni falla si el email no existe', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.forgotPassword('no-existe@example.com'),
      ).resolves.toBeUndefined();
      expect(mailService.sendMail).not.toHaveBeenCalled();
    });

    it('guarda un token hasheado y envia el correo', async () => {
      usersService.findByEmail.mockResolvedValue(activeUser);

      await service.forgotPassword(activeUser.email);

      expect(tokenRepository.save).toHaveBeenCalled();
      const savedToken = tokenRepository.save.mock.calls[0][0];
      expect(savedToken.tokenHash).not.toBe(undefined);
      expect(mailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: activeUser.email }),
      );
    });
  });

  describe('resetPassword', () => {
    it('lanza UnauthorizedException si ningun token coincide', async () => {
      tokenRepository.find.mockResolvedValue([]);

      await expect(
        service.resetPassword('raw-token', 'NewPass123!'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('actualiza la contrasena y marca el token como usado', async () => {
      const tokenHash = await bcrypt.hash('raw-token', 4);
      const storedToken = {
        id: 'token-1',
        userId: activeUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      };
      tokenRepository.find.mockResolvedValue([storedToken]);

      await service.resetPassword('raw-token', 'NewPass123!');

      expect(usersService.updatePassword).toHaveBeenCalledWith(
        activeUser.id,
        'NewPass123!',
      );
      expect(tokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ usedAt: expect.any(Date) }),
      );
    });

    it('ignora tokens expirados', async () => {
      const tokenHash = await bcrypt.hash('raw-token', 4);
      const expiredToken = {
        id: 'token-1',
        userId: activeUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() - 60_000),
        usedAt: null,
      };
      tokenRepository.find.mockResolvedValue([expiredToken]);

      await expect(
        service.resetPassword('raw-token', 'NewPass123!'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
