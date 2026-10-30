import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/mail/mail.service';
import { seedPermissions } from '../src/database/seeders/permissions.seeder';
import { seedSuperAdminRole } from '../src/database/seeders/roles.seeder';
import { seedSuperAdminUser } from '../src/database/seeders/super-admin.seeder';

describe('App (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const sendMail = jest.fn().mockResolvedValue(undefined);

  const superAdminCredentials = {
    email: 'super-admin@example.com',
    password: 'SuperAdminPass123!',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({ sendMail })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    dataSource = app.get<DataSource>(getDataSourceToken());
    const permissions = await seedPermissions(dataSource);
    const superAdminRole = await seedSuperAdminRole(dataSource, permissions);
    await seedSuperAdminUser(
      dataSource,
      app.get(ConfigService),
      superAdminRole,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET) es publico', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ success: true, data: { status: 'ok' } });
  });

  it('rechaza login con credenciales invalidas', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: superAdminCredentials.email, password: 'wrong' })
      .expect(401);
  });

  it('permite login y devuelve accessToken con roles y permisos', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(superAdminCredentials)
      .expect(200);

    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.user.roles).toContain('super-admin');
    const codes = response.body.data.user.permissions.map(
      (permission: { code: string }) => permission.code,
    );
    expect(codes).toEqual(
      expect.arrayContaining(['users.create', 'roles.read']),
    );
    expect(response.body.data.user.permissions).toEqual(
      expect.arrayContaining([
        { code: 'users.create', name: 'Crear usuarios' },
      ]),
    );
  });

  it('rechaza rutas protegidas sin token', () => {
    return request(app.getHttpServer()).get('/users').expect(401);
  });

  describe('flujo de usuarios, roles y permisos', () => {
    let superAdminToken: string;
    let limitedUserToken: string;
    const limitedEmail = `limited-${Date.now()}@example.com`;

    beforeAll(async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send(superAdminCredentials);
      superAdminToken = loginResponse.body.data.accessToken;

      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ email: limitedEmail, password: 'LimitedPass123!' })
        .expect(201);

      const limitedLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: limitedEmail, password: 'LimitedPass123!' });
      limitedUserToken = limitedLogin.body.data.accessToken;
    });

    it('super-admin puede listar usuarios paginados', async () => {
      const response = await request(app.getHttpServer())
        .get('/users?page=1&limit=5')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body.data.meta).toMatchObject({
        currentPage: 1,
        itemsPerPage: 5,
      });
    });

    it('usuario sin permisos recibe 403 al intentar crear un rol', () => {
      return request(app.getHttpServer())
        .post('/roles')
        .set('Authorization', `Bearer ${limitedUserToken}`)
        .send({ name: 'otro-rol' })
        .expect(403);
    });

    it('super-admin puede crear un rol, asignarle permisos y eliminarlo', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/roles')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: `editor-${Date.now()}` })
        .expect(201);

      const roleId = createResponse.body.data.id;
      const permissionsResponse = await request(app.getHttpServer())
        .get('/permissions')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
      const usersReadPermission = permissionsResponse.body.data.find(
        (permission: { code: string }) => permission.code === 'users.read',
      );

      const assignResponse = await request(app.getHttpServer())
        .put(`/roles/${roleId}/permissions`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ permissionIds: [usersReadPermission.id] })
        .expect(200);
      expect(assignResponse.body.data.permissions).toHaveLength(1);
      expect(assignResponse.body.data.permissions[0]).toEqual({
        id: usersReadPermission.id,
        code: 'users.read',
        name: 'Ver usuarios',
      });

      await request(app.getHttpServer())
        .delete(`/roles/${roleId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
    });

    it('desactiva (soft delete) y luego elimina (hard delete) un usuario', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: `disposable-${Date.now()}@example.com`,
          password: 'Disposable123!',
        })
        .expect(201);
      const userId = createResponse.body.data.id;

      const deactivateResponse = await request(app.getHttpServer())
        .patch(`/users/${userId}/deactivate`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
      expect(deactivateResponse.body.data.isActive).toBe(false);

      await request(app.getHttpServer())
        .delete(`/users/${userId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
    });
  });

  describe('restablecimiento de contrasena', () => {
    const email = `reset-${Date.now()}@example.com`;
    const originalPassword = 'OriginalPass123!';
    const newPassword = 'BrandNewPass123!';

    beforeAll(async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send(superAdminCredentials);

      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${loginResponse.body.data.accessToken}`)
        .send({ email, password: originalPassword })
        .expect(201);
    });

    it('genera un token, lo envia por correo y permite restablecer la contrasena', async () => {
      sendMail.mockClear();

      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email })
        .expect(200);

      expect(sendMail).toHaveBeenCalledTimes(1);
      const sentHtml: string = sendMail.mock.calls[0][0].html;
      const rawToken = sentHtml.match(/<strong>(.+?)<\/strong>/)?.[1];
      expect(rawToken).toBeDefined();

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: rawToken, newPassword })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: originalPassword })
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: newPassword })
        .expect(200);
    });

    it('no revela si un email no existe', () => {
      return request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'no-existe@example.com' })
        .expect(200);
    });
  });
});
