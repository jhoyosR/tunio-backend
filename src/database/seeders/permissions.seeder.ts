import { DataSource } from 'typeorm';
import { Permission } from '../../permissions/entities/permission.entity';

// Catalogo fijo de permisos base de la plataforma. Nuevos proyectos que agreguen
// modulos de negocio deben extender esta lista con sus propios permisos.
export const BASE_PERMISSIONS: Array<{ name: string; description: string }> = [
  { name: 'users.create', description: 'Crear usuarios' },
  { name: 'users.read', description: 'Ver usuarios' },
  { name: 'users.update', description: 'Actualizar usuarios' },
  { name: 'users.delete', description: 'Eliminar o desactivar usuarios' },
  { name: 'roles.create', description: 'Crear roles' },
  { name: 'roles.read', description: 'Ver roles' },
  { name: 'roles.update', description: 'Actualizar roles y sus permisos' },
  { name: 'roles.delete', description: 'Eliminar roles' },
  { name: 'permissions.read', description: 'Ver el catalogo de permisos' },
];

export async function seedPermissions(
  dataSource: DataSource,
): Promise<Permission[]> {
  const repository = dataSource.getRepository(Permission);
  const result: Permission[] = [];

  for (const { name, description } of BASE_PERMISSIONS) {
    let permission = await repository.findOne({ where: { name } });
    if (!permission) {
      permission = await repository.save(
        repository.create({ name, description }),
      );
    }
    result.push(permission);
  }

  return result;
}
