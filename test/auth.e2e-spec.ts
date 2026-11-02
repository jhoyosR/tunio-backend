import {
  Controller,
  Get,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CurrentStaff, Roles } from '../src/auth/decorators/auth.decorators';
import type { AuthenticatedStaff } from '../src/auth/interfaces/authenticated-staff.interface';
import { hashPassword } from '../src/auth/password';
import { StaffUser } from '../src/staff/entities/staff-user.entity';
import {
  StaffRole,
  VenueStaff,
} from '../src/staff/entities/venue-staff.entity';
import { Venue } from '../src/venues/entities/venue.entity';

// Controlador de sonda, solo para la prueba: todavia no existen rutas reales
// bajo /venues/:venueId, y los guards globales son lo que se verifica aqui.
@Controller()
class ProbeController {
  @Get('venues/:venueId/probe')
  anyRole(@CurrentStaff() staff: AuthenticatedStaff): AuthenticatedStaff {
    return staff;
  }

  @Roles('ADMIN')
  @Get('venues/:venueId/probe/admin')
  adminOnly(): string {
    return 'ok';
  }

  @Get('unscoped-probe')
  unscoped(): string {
    return 'should never be reached';
  }
}

const PASSWORD = 'tunio-e2e-password';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let venueA: Venue;
  let venueB: Venue;
  const tokens: Record<string, string> = {};

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return response.body.data.accessToken;
  }

  function get(path: string, token?: string) {
    const req = request(app.getHttpServer()).get(path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Igual que en main.ts: sin esto el DTO de login no se valida.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const dataSource = app.get(DataSource);
    const passwordHash = await hashPassword(PASSWORD);
    [venueA, venueB] = await dataSource.getRepository(Venue).save([
      { name: 'Bar A', slug: 'auth-e2e-bar-a' },
      { name: 'Bar B', slug: 'auth-e2e-bar-b' },
    ]);

    const staff: Array<[string, Venue, StaffRole, boolean]> = [
      ['admin-a', venueA, 'ADMIN', true],
      ['dj-a', venueA, 'DJ', true],
      ['admin-b', venueB, 'ADMIN', true],
      ['inactive-a', venueA, 'ADMIN', false],
    ];
    for (const [alias, venue, role, isActive] of staff) {
      const user = await dataSource.getRepository(StaffUser).save({
        displayName: alias,
        email: `${alias}@auth-e2e.test`,
        passwordHash,
        isActive,
      });
      await dataSource
        .getRepository(VenueStaff)
        .save({ venueId: venue.id, staffUserId: user.id, role });
    }

    for (const alias of ['admin-a', 'dj-a', 'admin-b']) {
      tokens[alias] = await login(`${alias}@auth-e2e.test`);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('login', () => {
    it('devuelve token, caducidad y los locales con su rol', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'dj-a@auth-e2e.test', password: PASSWORD })
        .expect(200);

      expect(response.body.data.accessToken).toEqual(expect.any(String));
      expect(
        new Date(response.body.data.expiresAt as string).getTime(),
      ).toBeGreaterThan(Date.now());
      expect(response.body.data.staff.venues).toEqual([
        { venueId: venueA.id, venueName: 'Bar A', role: 'DJ' },
      ]);
    });

    it('acepta el correo con mayusculas y espacios', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: '  DJ-A@Auth-E2E.test ', password: PASSWORD })
        .expect(200);
    });

    it('rechaza contrasena incorrecta con 401', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'dj-a@auth-e2e.test', password: 'wrong' })
        .expect(401);
    });

    it('rechaza al personal desactivado con 401', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'inactive-a@auth-e2e.test', password: PASSWORD })
        .expect(401);
    });

    it('valida el cuerpo de la peticion', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email' })
        .expect(400);
    });
  });

  describe('token', () => {
    it('sin token, las rutas del personal responden 401', async () => {
      await get('/auth/me').expect(401);
      await get(`/venues/${venueA.id}/probe`).expect(401);
    });

    it('un token alterado responde 401', () => {
      return get('/auth/me', `${tokens['dj-a']}x`).expect(401);
    });

    it('/auth/me devuelve el perfil del token', async () => {
      const response = await get('/auth/me', tokens['admin-b']).expect(200);
      expect(response.body.data.email).toBe('admin-b@auth-e2e.test');
    });

    it('/health sigue siendo publica', () => {
      return get('/health').expect(200);
    });
  });

  describe('aislamiento por establecimiento y rol', () => {
    it('el DJ opera en su local y el guard adjunta local y rol', async () => {
      const response = await get(
        `/venues/${venueA.id}/probe`,
        tokens['dj-a'],
      ).expect(200);
      expect(response.body.data).toMatchObject({
        venueId: venueA.id,
        role: 'DJ',
      });
    });

    it('el DJ del bar A no puede operar el bar B conociendo su id', () => {
      return get(`/venues/${venueB.id}/probe`, tokens['dj-a']).expect(403);
    });

    it('el ADMIN del bar A tampoco puede administrar el bar B', () => {
      return get(`/venues/${venueB.id}/probe/admin`, tokens['admin-a']).expect(
        403,
      );
    });

    it('el DJ no accede a rutas de ADMIN de su propio local', () => {
      return get(`/venues/${venueA.id}/probe/admin`, tokens['dj-a']).expect(
        403,
      );
    });

    it('el ADMIN accede a rutas de ADMIN de su local', () => {
      return get(`/venues/${venueA.id}/probe/admin`, tokens['admin-a']).expect(
        200,
      );
    });

    it('un id de local mal formado responde 403, no 500', () => {
      return get('/venues/not-a-uuid/probe', tokens['dj-a']).expect(403);
    });

    it('una ruta autenticada sin :venueId se rechaza por defecto', () => {
      return get('/unscoped-probe', tokens['admin-a']).expect(403);
    });
  });
});
