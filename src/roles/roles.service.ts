import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleResponseDto } from './dto/role-response.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { paginate } from '../common/utils/paginate';
import { Paginated } from '../common/interfaces/api-response.interface';
import { toPermissionResponseDto } from '../permissions/permissions.mapper';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionsRepository: Repository<Permission>,
  ) {}

  async create(dto: CreateRoleDto): Promise<RoleResponseDto> {
    const permissions = await this.resolvePermissions(dto.permissionIds);
    const role = this.rolesRepository.create({
      name: dto.name,
      description: dto.description,
      permissions,
    });
    const saved = await this.rolesRepository.save(role);
    return this.toResponseDto(saved);
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<Paginated<RoleResponseDto>> {
    const queryBuilder = this.rolesRepository
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .orderBy('role.name', 'ASC');

    const result = await paginate(queryBuilder, query.page, query.limit);
    return {
      ...result,
      items: result.items.map((role) => this.toResponseDto(role)),
    };
  }

  async findOne(id: string): Promise<RoleResponseDto> {
    const role = await this.findRoleEntity(id);
    return this.toResponseDto(role);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleResponseDto> {
    const role = await this.findRoleEntity(id);
    if (dto.name !== undefined) role.name = dto.name;
    if (dto.description !== undefined) role.description = dto.description;
    if (dto.permissionIds !== undefined) {
      role.permissions = await this.resolvePermissions(dto.permissionIds);
    }
    const saved = await this.rolesRepository.save(role);
    return this.toResponseDto(saved);
  }

  async assignPermissions(
    id: string,
    permissionIds: string[],
  ): Promise<RoleResponseDto> {
    const role = await this.findRoleEntity(id);
    role.permissions = await this.resolvePermissions(permissionIds);
    const saved = await this.rolesRepository.save(role);
    return this.toResponseDto(saved);
  }

  async remove(id: string): Promise<void> {
    const role = await this.findRoleEntity(id);
    await this.rolesRepository.remove(role);
  }

  private async findRoleEntity(id: string): Promise<Role> {
    const role = await this.rolesRepository.findOne({
      where: { id },
      relations: { permissions: true },
    });
    if (!role) {
      throw new NotFoundException(`Rol ${id} no encontrado`);
    }
    return role;
  }

  private toResponseDto(role: Role): RoleResponseDto {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: (role.permissions ?? []).map(toPermissionResponseDto),
    };
  }

  private async resolvePermissions(
    permissionIds: string[] = [],
  ): Promise<Permission[]> {
    if (permissionIds.length === 0) {
      return [];
    }
    const permissions = await this.permissionsRepository.find({
      where: { id: In(permissionIds) },
    });
    if (permissions.length !== permissionIds.length) {
      throw new NotFoundException('Uno o mas permisos no existen');
    }
    return permissions;
  }
}
