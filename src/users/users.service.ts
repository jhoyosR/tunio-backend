import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { Role } from '../roles/entities/role.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { paginate } from '../common/utils/paginate';
import { Paginated } from '../common/interfaces/api-response.interface';
import { toPermissionResponseDto } from '../permissions/permissions.mapper';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
    private readonly configService: ConfigService,
  ) {}

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.usersRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('El email ya esta registrado');
    }

    const passwordHash = await bcrypt.hash(
      dto.password,
      this.configService.get<number>('bcryptSaltRounds')!,
    );
    const roles = await this.resolveRoles(dto.roleIds);

    const user = this.usersRepository.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      roles,
    });
    const saved = await this.usersRepository.save(user);
    return this.toResponseDto(saved);
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<Paginated<UserResponseDto>> {
    const queryBuilder = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .orderBy('user.createdAt', 'DESC');

    const result = await paginate(queryBuilder, query.page, query.limit);
    return {
      ...result,
      items: result.items.map((user) => this.toResponseDto(user)),
    };
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.findEntityById(id, true);
    return this.toResponseDto(user);
  }

  // Usado internamente por AuthService: necesita el passwordHash para el login,
  // por eso no pasa por toResponseDto().
  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email },
      relations: { roles: { permissions: true } },
    });
  }

  findEntityById(id: string): Promise<User | null>;
  findEntityById(id: string, throwIfMissing: true): Promise<User>;
  async findEntityById(
    id: string,
    throwIfMissing = true,
  ): Promise<User | null> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: { roles: { permissions: true } },
    });
    if (!user && throwIfMissing) {
      throw new NotFoundException(`Usuario ${id} no encontrado`);
    }
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.findEntityById(id, true);
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.roleIds !== undefined) {
      user.roles = await this.resolveRoles(dto.roleIds);
    }
    const saved = await this.usersRepository.save(user);
    return this.toResponseDto(saved);
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(
      newPassword,
      this.configService.get<number>('bcryptSaltRounds')!,
    );
    await this.usersRepository.update(userId, { passwordHash });
  }

  // Soft delete: desactiva al usuario sin borrar el registro (preserva historial/integridad).
  async deactivate(id: string): Promise<UserResponseDto> {
    const user = await this.findEntityById(id, true);
    user.isActive = false;
    const saved = await this.usersRepository.save(user);
    return this.toResponseDto(saved);
  }

  // Hard delete: elimina el registro definitivamente.
  async remove(id: string): Promise<void> {
    const user = await this.findEntityById(id, true);
    await this.usersRepository.remove(user);
  }

  toResponseDto(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      roles: (user.roles ?? []).map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: (role.permissions ?? []).map(toPermissionResponseDto),
      })),
      createdAt: user.createdAt,
    };
  }

  private async resolveRoles(roleIds: string[] = []): Promise<Role[]> {
    if (roleIds.length === 0) {
      return [];
    }
    const roles = await this.rolesRepository.find({
      where: { id: In(roleIds) },
    });
    if (roles.length !== roleIds.length) {
      throw new NotFoundException('Uno o mas roles no existen');
    }
    return roles;
  }
}
