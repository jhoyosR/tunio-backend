import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { Role } from './entities/role.entity';
import { Permission } from '../permissions/entities/permission.entity';

describe('RolesService', () => {
  let service: RolesService;
  let rolesRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let permissionsRepository: { find: jest.Mock };

  beforeEach(async () => {
    rolesRepository = {
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve(data)),
      findOne: jest.fn(),
      remove: jest.fn(),
    };
    permissionsRepository = { find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: getRepositoryToken(Role), useValue: rolesRepository },
        {
          provide: getRepositoryToken(Permission),
          useValue: permissionsRepository,
        },
      ],
    }).compile();

    service = module.get(RolesService);
  });

  describe('assignPermissions', () => {
    it('reemplaza por completo la lista de permisos del rol', async () => {
      rolesRepository.findOne.mockResolvedValue({
        id: 'role-1',
        name: 'editor',
        permissions: [{ id: 'old-permission' }],
      });
      const newPermissions = [
        { id: 'p1', name: 'users.create', description: 'Crear usuarios' },
        { id: 'p2', name: 'users.read', description: 'Ver usuarios' },
      ];
      permissionsRepository.find.mockResolvedValue(newPermissions);

      const result = await service.assignPermissions('role-1', ['p1', 'p2']);

      expect(result.permissions).toEqual([
        { id: 'p1', code: 'users.create', name: 'Crear usuarios' },
        { id: 'p2', code: 'users.read', name: 'Ver usuarios' },
      ]);
    });

    it('lanza NotFoundException si algun permiso no existe', async () => {
      rolesRepository.findOne.mockResolvedValue({
        id: 'role-1',
        permissions: [],
      });
      permissionsRepository.find.mockResolvedValue([{ id: 'p1' }]);

      await expect(
        service.assignPermissions('role-1', ['p1', 'p2']),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si el rol no existe', async () => {
      rolesRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
