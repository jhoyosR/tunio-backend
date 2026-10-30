import { DataSource } from 'typeorm';
import { Role } from '../../roles/entities/role.entity';
import { Permission } from '../../permissions/entities/permission.entity';

export const SUPER_ADMIN_ROLE_NAME = 'super-admin';

// El rol super-admin siempre tiene TODOS los permisos existentes al momento
// de correr el seeder, incluyendo los que agregue un proyecto concreto despues.
export async function seedSuperAdminRole(
  dataSource: DataSource,
  permissions: Permission[],
): Promise<Role> {
  const repository = dataSource.getRepository(Role);

  let role = await repository.findOne({
    where: { name: SUPER_ADMIN_ROLE_NAME },
    relations: { permissions: true },
  });

  if (!role) {
    role = repository.create({
      name: SUPER_ADMIN_ROLE_NAME,
      description: 'Acceso total al sistema',
    });
  }
  role.permissions = permissions;

  return repository.save(role);
}
