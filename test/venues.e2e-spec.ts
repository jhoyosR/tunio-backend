import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';
import { MusicSession } from '../src/sessions/entities/music-session.entity';
import { StaffUser } from '../src/staff/entities/staff-user.entity';
import {
  StaffRole,
  VenueStaff,
} from '../src/staff/entities/venue-staff.entity';
import { Venue } from '../src/venues/entities/venue.entity';

const PASSWORD = 'tunio-e2e-password';
const PNG_SIGNATURE_HEX = '89504e47';
// Dentro del sandbox de Jest, pngjs codifica unas 100 veces mas lento que en
// Node (13 s frente a 0,1 s para 1024 px). No es un problema del servidor.
const QR_IMAGE_TEST_TIMEOUT_MS = 60_000;

describe('Venues and QR access (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let venueA: Venue;
  let venueB: Venue;
  const tokens: Record<string, string> = {};

  function call(
    method: 'get' | 'post' | 'patch',
    path: string,
    token?: string,
  ) {
    const req = request(app.getHttpServer())[method](path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  }

  async function regenerate(): Promise<string> {
    const response = await call(
      'post',
      `/venues/${venueA.id}/qr/regenerate`,
      tokens['admin-a'],
    ).expect(200);
    return response.body.data.publicToken as string;
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Igual que en main.ts: sin esto los DTO no se validan.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    dataSource = app.get(DataSource);
    const passwordHash = await hashPassword(PASSWORD);
    [venueA, venueB] = await dataSource.getRepository(Venue).save([
      { name: 'Bar A', slug: 'venues-e2e-bar-a' },
      { name: 'Bar B', slug: 'venues-e2e-bar-b' },
    ]);

    const staff: Array<[string, Venue, StaffRole]> = [
      ['admin-a', venueA, 'ADMIN'],
      ['dj-a', venueA, 'DJ'],
      ['admin-b', venueB, 'ADMIN'],
    ];
    for (const [alias, venue, role] of staff) {
      const email = `${alias}@venues-e2e.test`;
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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('datos del establecimiento', () => {
    it('cualquier rol del local puede consultarlo', async () => {
      const response = await call(
        'get',
        `/venues/${venueA.id}`,
        tokens['dj-a'],
      ).expect(200);
      expect(response.body.data).toEqual({
        id: venueA.id,
        name: 'Bar A',
        slug: 'venues-e2e-bar-a',
        isActive: true,
      });
    });

    it('otro local no puede consultarlo', () => {
      return call('get', `/venues/${venueA.id}`, tokens['admin-b']).expect(403);
    });

    it('el DJ no puede renombrarlo', () => {
      return call('patch', `/venues/${venueA.id}`, tokens['dj-a'])
        .send({ name: 'Nuevo' })
        .expect(403);
    });

    it('el ADMIN lo renombra y el slug no cambia', async () => {
      const response = await call(
        'patch',
        `/venues/${venueA.id}`,
        tokens['admin-a'],
      )
        .send({ name: '  Bar A Renovado  ' })
        .expect(200);
      expect(response.body.data).toMatchObject({
        name: 'Bar A Renovado',
        slug: 'venues-e2e-bar-a',
      });
    });

    it('solo el nombre es editable', async () => {
      await call('patch', `/venues/${venueA.id}`, tokens['admin-a'])
        .send({ name: 'Bar A', slug: 'otro' })
        .expect(400);
      await call('patch', `/venues/${venueA.id}`, tokens['admin-a'])
        .send({ name: '   ' })
        .expect(400);
    });
  });

  describe('acceso QR', () => {
    it('antes de generarlo, consultarlo responde 404', () => {
      return call('get', `/venues/${venueA.id}/qr`, tokens['admin-a']).expect(
        404,
      );
    });

    it('solo el ADMIN del local gestiona el QR', async () => {
      await call('get', `/venues/${venueA.id}/qr`, tokens['dj-a']).expect(403);
      await call(
        'post',
        `/venues/${venueA.id}/qr/regenerate`,
        tokens['admin-b'],
      ).expect(403);
    });

    it('regenerar invalida el token anterior', async () => {
      const first = await regenerate();
      const second = await regenerate();

      expect(second).not.toBe(first);
      await call('get', `/qr/${first}`).expect(404);
      await call('get', `/qr/${second}`).expect(200);
    });

    it('resolver sin credencial devuelve el local y si hay sesion abierta', async () => {
      const token = await regenerate();

      const closed = await call('get', `/qr/${token}`).expect(200);
      expect(closed.body.data).toEqual({
        venueId: venueA.id,
        venueName: 'Bar A Renovado',
        openSession: null,
      });

      const session = await dataSource
        .getRepository(MusicSession)
        .save({ venueId: venueA.id, status: 'ACTIVE' });
      const open = await call('get', `/qr/${token}`).expect(200);
      expect(open.body.data.openSession).toEqual({
        id: session.id,
        status: 'ACTIVE',
      });
    });

    it('con el QR desactivado, resolver responde 403', async () => {
      const token = await regenerate();

      await call('patch', `/venues/${venueA.id}/qr`, tokens['admin-a'])
        .send({ isEnabled: false })
        .expect(200);
      await call('get', `/qr/${token}`).expect(403);

      await call('patch', `/venues/${venueA.id}/qr`, tokens['admin-a'])
        .send({ isEnabled: true })
        .expect(200);
      await call('get', `/qr/${token}`).expect(200);
    });

    it('un token mal formado responde 400', () => {
      return call('get', '/qr/not-a-uuid').expect(400);
    });

    it(
      'entrega la imagen PNG lista para descargar',
      async () => {
        const response = await call(
          'get',
          `/venues/${venueA.id}/qr/image`,
          tokens['admin-a'],
        ).expect(200);

        expect(response.headers['content-type']).toBe('image/png');
        expect(response.headers['content-disposition']).toBe(
          'attachment; filename="tunio-qr-venues-e2e-bar-a.png"',
        );
        const body = response.body as Buffer;
        expect(body.subarray(0, 4).toString('hex')).toBe(PNG_SIGNATURE_HEX);
      },
      QR_IMAGE_TEST_TIMEOUT_MS,
    );
  });
});
