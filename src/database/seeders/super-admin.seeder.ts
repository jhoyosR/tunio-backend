import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../roles/entities/role.entity';

// Credenciales del primer super-admin vienen de variables de entorno
// (SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD), nunca hardcodeadas en el codigo.
export async function seedSuperAdminUser(
  dataSource: DataSource,
  configService: ConfigService,
  superAdminRole: Role,
): Promise<User> {
  const repository = dataSource.getRepository(User);
  const email = configService.get<string>('superAdmin.email')!;
  const password = configService.get<string>('superAdmin.password')!;
  const saltRounds = configService.get<number>('bcryptSaltRounds')!;

  let user = await repository.findOne({
    where: { email },
    relations: { roles: true },
  });

  if (!user) {
    user = repository.create({
      email,
      passwordHash: await bcrypt.hash(password, saltRounds),
      roles: [superAdminRole],
    });
  } else if (!user.roles.some((role) => role.id === superAdminRole.id)) {
    user.roles = [...user.roles, superAdminRole];
  }

  return repository.save(user);
}
