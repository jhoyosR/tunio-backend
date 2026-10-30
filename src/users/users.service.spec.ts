import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Role } from '../roles/entities/role.entity';

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let rolesRepository: { find: jest.Mock };

  beforeEach(async () => {
    usersRepository = {
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 'generated-id', ...data })),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    rolesRepository = { find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: getRepositoryToken(Role), useValue: rolesRepository },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(4) },
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('create', () => {
    it('lanza ConflictException si el email ya esta registrado', async () => {
      usersRepository.findOne.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create({ email: 'dup@example.com', password: 'Password123!' }),
      ).rejects.toThrow(ConflictException);
    });

    it('hashea la contrasena antes de guardar', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      rolesRepository.find.mockResolvedValue([]);

      const result = await service.create({
        email: 'new@example.com',
        password: 'Password123!',
      });

      const savedArg = usersRepository.save.mock.calls[0][0] as {
        passwordHash: string;
      };
      expect(savedArg.passwordHash).not.toBe('Password123!');
      expect(await bcrypt.compare('Password123!', savedArg.passwordHash)).toBe(
        true,
      );
      expect(result.email).toBe('new@example.com');
    });

    it('lanza NotFoundException si algun rol no existe', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      rolesRepository.find.mockResolvedValue([]);

      await expect(
        service.create({
          email: 'new@example.com',
          password: 'Password123!',
          roleIds: ['role-1'],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('marca isActive en false sin borrar el registro', async () => {
      const user = { id: '1', isActive: true, roles: [] } as unknown as User;
      usersRepository.findOne.mockResolvedValue(user);

      const result = await service.deactivate('1');

      expect(usersRepository.remove).not.toHaveBeenCalled();
      expect(usersRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
      expect(result.isActive).toBe(false);
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      usersRepository.findOne.mockResolvedValue(null);

      await expect(service.deactivate('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('elimina el registro definitivamente', async () => {
      const user = { id: '1' } as User;
      usersRepository.findOne.mockResolvedValue(user);

      await service.remove('1');

      expect(usersRepository.remove).toHaveBeenCalledWith(user);
    });
  });

  describe('toResponseDto', () => {
    it('nunca incluye el passwordHash', () => {
      const user = {
        id: '1',
        email: 'a@example.com',
        passwordHash: 'secret-hash',
        isActive: true,
        roles: [],
        createdAt: new Date(),
      } as unknown as User;

      const dto = service.toResponseDto(user);

      expect(dto).not.toHaveProperty('passwordHash');
    });
  });
});
