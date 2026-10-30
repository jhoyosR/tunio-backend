import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Role } from '../roles/entities/role.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { PasswordResetToken } from '../auth/entities/password-reset-token.entity';

config({ quiet: true });

// DataSource usado exclusivamente por el CLI de TypeORM (generar/correr migraciones).
// La app en runtime usa TypeOrmModule.forRootAsync en app.module.ts, no este archivo.
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  entities: [User, Role, Permission, PasswordResetToken],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
});
