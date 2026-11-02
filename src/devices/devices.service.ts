import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SessionDevice } from '../sessions/entities/session-device.entity';
import { Venue } from '../venues/entities/venue.entity';
import { QrAccessService, QrResolution } from '../venues/qr-access.service';
import { hashInstallationId } from './device-hash';
import { AnonymousDevice } from './entities/anonymous-device.entity';

@Injectable()
export class DevicesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly qrAccessService: QrAccessService,
  ) {}

  // Entrada del cliente al local. Aplica las mismas comprobaciones que
  // resolver el QR (token valido, QR activo, local activo) y devuelve lo
  // mismo: el local y la sesion vigente con su estado. Sin sesion abierta el
  // dispositivo se registra igual, pero no hay a que sesion adherirlo.
  async registerDevice(
    publicToken: string,
    installationId: string,
  ): Promise<QrResolution> {
    const resolution = await this.qrAccessService.resolveToken(publicToken);
    const { venueId, openSession } = resolution;

    await this.dataSource.transaction(async (manager) => {
      const deviceHash = hashInstallationId(
        installationId,
        await this.findVenueSalt(manager, venueId),
      );
      const deviceId = await this.upsertDevice(manager, venueId, deviceHash);
      if (openSession) {
        await this.attachToSession(manager, venueId, openSession.id, deviceId);
      }
    });

    return resolution;
  }

  private async findVenueSalt(
    manager: EntityManager,
    venueId: string,
  ): Promise<Buffer> {
    // La columna es select: false; hay que pedirla expresamente.
    const venue = await manager.findOneOrFail(Venue, {
      where: { id: venueId },
      select: { id: true, deviceHashSalt: true },
    });
    return venue.deviceHashSalt;
  }

  // INSERT ... ON CONFLICT: el primer escaneo lo registra y los siguientes
  // solo renuevan last_seen_at, sin carrera entre dos peticiones simultaneas.
  private async upsertDevice(
    manager: EntityManager,
    venueId: string,
    deviceHash: string,
  ): Promise<string> {
    const result = await manager
      .createQueryBuilder()
      .insert()
      .into(AnonymousDevice)
      .values({ venueId, deviceHash })
      .orUpdate(['last_seen_at'], ['venue_id', 'device_hash'])
      .returning(['id'])
      .execute();
    return (result.raw as Array<{ id: string }>)[0].id;
  }

  private async attachToSession(
    manager: EntityManager,
    venueId: string,
    sessionId: string,
    deviceId: string,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .insert()
      .into(SessionDevice)
      .values({ sessionId, deviceId, venueId })
      .orUpdate(['last_seen_at'], ['session_id', 'device_id'])
      .execute();
  }
}
