import { config } from 'dotenv';
import { DataSource } from 'typeorm';

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
  entities: [],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
});
