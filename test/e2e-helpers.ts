import {
  INestApplication,
  LoggerService,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';
import { StaffUser } from '../src/staff/entities/staff-user.entity';
import {
  StaffRole,
  VenueStaff,
} from '../src/staff/entities/venue-staff.entity';
import { Venue } from '../src/venues/entities/venue.entity';

const PASSWORD = 'tunio-e2e-password';

// Por defecto Nest usa en pruebas un logger que solo imprime errores; quien
// necesite ver los registros reales (p. ej. para auditar que no se filtra
// nada) pasa el mismo logger que main.ts.
export async function createTestApp(
  logger?: LoggerService,
): Promise<INestApplication<App>> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  if (logger) {
    app.useLogger(logger);
  }
  // Igual que en main.ts: sin esto los DTO no se validan.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

export interface VenueFixture {
  venue: Venue;
  // Token de acceso por alias del personal.
  tokens: Record<string, string>;
}

// Crea un local con su personal e inicia sesion con cada uno. El slug debe
// ser unico en toda la corrida: todas las suites comparten la base.
export async function createVenueWithStaff(
  app: INestApplication<App>,
  slug: string,
  staff: Array<[alias: string, role: StaffRole]>,
): Promise<VenueFixture> {
  const dataSource = app.get(DataSource);
  const passwordHash = await hashPassword(PASSWORD);
  const venue = await dataSource
    .getRepository(Venue)
    .save({ name: slug, slug });

  const tokens: Record<string, string> = {};
  for (const [alias, role] of staff) {
    const email = `${alias}@${slug}.test`;
    const user = await dataSource
      .getRepository(StaffUser)
      .save({ displayName: alias, email, passwordHash });
    await dataSource
      .getRepository(VenueStaff)
      .save({ venueId: venue.id, staffUserId: user.id, role });
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    tokens[alias] = response.body.data.accessToken as string;
  }
  return { venue, tokens };
}

export function authed(
  app: INestApplication<App>,
  method: 'get' | 'post' | 'patch',
  path: string,
  token?: string,
) {
  const req = request(app.getHttpServer())[method](path);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}
