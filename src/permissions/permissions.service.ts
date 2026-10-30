import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { PermissionResponseDto } from './dto/permission-response.dto';
import { toPermissionResponseDto } from './permissions.mapper';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionsRepository: Repository<Permission>,
  ) {}

  // Listado simple sin paginacion: el catalogo de permisos es fijo y pequeno
  // (nace de seeders), se usa tal cual para poblar el selector de permisos al editar roles.
  async findAll(): Promise<PermissionResponseDto[]> {
    const permissions = await this.permissionsRepository.find({
      order: { name: 'ASC' },
    });
    return permissions.map(toPermissionResponseDto);
  }
}
