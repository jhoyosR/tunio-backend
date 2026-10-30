import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../../app.module';
import { seedPermissions } from './permissions.seeder';
import { seedSuperAdminRole } from './roles.seeder';
import { seedSuperAdminUser } from './super-admin.seeder';

// Script standalone (sin servidor HTTP) que reutiliza el AppModule para
// aprovechar la misma validacion de entorno y conexion a base de datos.
async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get<DataSource>(getDataSourceToken());
  const configService = app.get(ConfigService);

  const permissions = await seedPermissions(dataSource);
  console.log(`Permisos sembrados: ${permissions.length}`);

  const superAdminRole = await seedSuperAdminRole(dataSource, permissions);
  console.log(`Rol sembrado: ${superAdminRole.name}`);

  const superAdminUser = await seedSuperAdminUser(
    dataSource,
    configService,
    superAdminRole,
  );
  console.log(`Usuario super-admin sembrado: ${superAdminUser.email}`);

  await app.close();
}

run().catch((error) => {
  console.error('Error al ejecutar los seeders:', error);
  process.exit(1);
});
