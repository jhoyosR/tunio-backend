import { ConsoleLogger, INestApplication } from '@nestjs/common';
import { createHash } from 'crypto';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AnonymousDevice } from '../src/devices/entities/anonymous-device.entity';
import { SessionDevice } from '../src/sessions/entities/session-device.entity';
import { Venue } from '../src/venues/entities/venue.entity';
import {
  authed,
  createTestApp,
  createVenueWithStaff,
  VenueFixture,
} from './e2e-helpers';

// UUID de instalacion inventado: es lo que nunca debe aparecer en claro.
const INSTALLATION_ID = '6f1c2b7e-9d3a-4c5f-8e21-0a9b8c7d6e5f';
const INSTALLATION_ID_HEX = INSTALLATION_ID.replace(/-/g, '');

describe('Devices (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let barA: VenueFixture;
  let barB: VenueFixture;
  let qrTokenA: string;
  let qrTokenB: string;
  let sessionIdA: string;
  // Todo lo que el servidor escribe en consola durante la suite.
  const serverOutput: string[] = [];
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  async function generateQr(fixture: VenueFixture): Promise<string> {
    const response = await authed(
      app,
      'post',
      `/venues/${fixture.venue.id}/qr/regenerate`,
      fixture.tokens.admin,
    ).expect(200);
    return response.body.data.publicToken as string;
  }

  function register(qrToken: string, installationId = INSTALLATION_ID) {
    return authed(app, 'post', `/qr/${qrToken}/devices`).send({
      installationId,
    });
  }

  async function expectedHash(venueId: string): Promise<string> {
    const venue = await dataSource.getRepository(Venue).findOneOrFail({
      where: { id: venueId },
      select: { id: true, deviceHashSalt: true },
    });
    return createHash('sha256')
      .update(
        Buffer.concat([Buffer.from(INSTALLATION_ID), venue.deviceHashSalt]),
      )
      .digest('hex');
  }

  beforeAll(async () => {
    const record = (chunk: unknown) => {
      serverOutput.push(String(chunk));
      return true;
    };
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(record);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(record);

    // Mismo logger que main.ts: se audita lo que de verdad se registraria.
    app = await createTestApp(new ConsoleLogger({ json: true }));
    dataSource = app.get(DataSource);
    barA = await createVenueWithStaff(app, 'devices-e2e-bar-a', [
      ['admin', 'ADMIN'],
    ]);
    barB = await createVenueWithStaff(app, 'devices-e2e-bar-b', [
      ['admin', 'ADMIN'],
    ]);
    qrTokenA = await generateQr(barA);
    qrTokenB = await generateQr(barB);
    const session = await authed(
      app,
      'post',
      `/venues/${barA.venue.id}/sessions`,
      barA.tokens.admin,
    )
      .send({})
      .expect(201);
    sessionIdA = session.body.data.id as string;
  });

  afterAll(async () => {
    await app.close();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('registra el dispositivo, lo adhiere a la sesion y devuelve su estado', async () => {
    const response = await register(qrTokenA).expect(200);

    expect(response.body.data).toEqual({
      venueId: barA.venue.id,
      venueName: 'devices-e2e-bar-a',
      openSession: { id: sessionIdA, status: 'ACTIVE' },
    });

    const devices = await dataSource
      .getRepository(AnonymousDevice)
      .findBy({ venueId: barA.venue.id });
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceHash).toBe(await expectedHash(barA.venue.id));
    await expect(
      dataSource
        .getRepository(SessionDevice)
        .countBy({ sessionId: sessionIdA, deviceId: devices[0].id }),
    ).resolves.toBe(1);
  });

  it('volver a entrar no duplica el dispositivo y renueva su ultima aparicion', async () => {
    const repository = dataSource.getRepository(AnonymousDevice);
    const [before] = await repository.findBy({ venueId: barA.venue.id });

    await register(qrTokenA).expect(200);
    // El mismo telefono, aunque la app mande el UUID en mayusculas.
    await register(qrTokenA, INSTALLATION_ID.toUpperCase()).expect(200);

    const after = await repository.findBy({ venueId: barA.venue.id });
    expect(after).toHaveLength(1);
    expect(after[0].lastSeenAt.getTime()).toBeGreaterThan(
      before.lastSeenAt.getTime(),
    );
    await expect(
      dataSource
        .getRepository(SessionDevice)
        .countBy({ sessionId: sessionIdA }),
    ).resolves.toBe(1);
  });

  it('el mismo telefono en otro local tiene otro hash', async () => {
    const response = await register(qrTokenB).expect(200);
    // Sin sesion abierta: se registra igual, pero no hay a que adherirlo.
    expect(response.body.data.openSession).toBeNull();

    const [deviceA] = await dataSource
      .getRepository(AnonymousDevice)
      .findBy({ venueId: barA.venue.id });
    const [deviceB] = await dataSource
      .getRepository(AnonymousDevice)
      .findBy({ venueId: barB.venue.id });
    expect(deviceB.deviceHash).toBe(await expectedHash(barB.venue.id));
    expect(deviceB.deviceHash).not.toBe(deviceA.deviceHash);
  });

  it('con el QR desactivado no se registra nada', async () => {
    await authed(app, 'patch', `/venues/${barB.venue.id}/qr`, barB.tokens.admin)
      .send({ isEnabled: false })
      .expect(200);

    await register(qrTokenB, '11111111-2222-4333-8444-555555555555').expect(
      403,
    );
    await expect(
      dataSource
        .getRepository(AnonymousDevice)
        .countBy({ venueId: barB.venue.id }),
    ).resolves.toBe(1);
  });

  it('un identificador que no es UUID se rechaza sin repetirlo', async () => {
    const response = await register(qrTokenA, 'not-a-uuid-secret').expect(400);
    expect(JSON.stringify(response.body)).not.toContain('not-a-uuid-secret');
  });

  describe('evidencia de anonimizacion', () => {
    it('el UUID en claro no esta en ninguna tabla que toca el registro', async () => {
      const rows = await dataSource.query<Array<{ row: string }>>(
        `SELECT t::text AS row FROM tunio.anonymous_devices t
         UNION ALL SELECT t::text FROM tunio.session_devices t
         UNION ALL SELECT t::text FROM tunio.activity_events t`,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const { row } of rows) {
        expect(row.toLowerCase()).not.toContain(INSTALLATION_ID);
        expect(row.toLowerCase()).not.toContain(INSTALLATION_ID_HEX);
      }
    });

    it('el UUID en claro no aparece en los registros del servidor', () => {
      // Comprueba que de verdad se capturo la salida del servidor.
      expect(serverOutput.join('')).toContain('/devices');
      const output = serverOutput.join('').toLowerCase();
      expect(output).not.toContain(INSTALLATION_ID);
      expect(output).not.toContain(INSTALLATION_ID_HEX);
    });
  });
});
