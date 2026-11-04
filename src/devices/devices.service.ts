import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ActivityEventsService } from '../activity/activity-events.service';
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
    private readonly activityEvents: ActivityEventsService,
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

    await this.dataSource.transaction((manager) =>
      this.identifyDevice(
        manager,
        venueId,
        installationId,
        openSession?.id ?? null,
      ),
    );

    return resolution;
  }

  // Convierte el UUID de instalacion en el id del dispositivo anonimo del
  // local, registrandolo si es nuevo, y lo adhiere a la sesion si se indica.
  // Corre en la transaccion de quien llama: pedir o votar (BE-12) lo usa para
  // adherir al dispositivo que se registro antes de abrirse la sesion.
  async identifyDevice(
    manager: EntityManager,
    venueId: string,
    installationId: string,
    sessionId: string | null,
  ): Promise<string> {
    const deviceHash = hashInstallationId(
      installationId,
      await this.findVenueSalt(manager, venueId),
    );
    const deviceId = await this.upsertDevice(manager, venueId, deviceHash);
    if (sessionId) {
      await this.attachToSession(manager, venueId, sessionId, deviceId);
    }
    return deviceId;
  }

  // Solo lectura: consultar la cola (BE-13, BE-14) no registra al
  // dispositivo ni renueva su ultima aparicion. Se identifica por el hash y no
  // por el id porque el hash existe aunque el telefono aun no haya entrado al
  // local: el WebSocket lo calcula al conectar y sigue sirviendo despues de
  // que el telefono pida su primera cancion.
  async deviceHashFor(
    venueId: string,
    installationId: string,
  ): Promise<string> {
    return hashInstallationId(
      installationId,
      await this.findVenueSalt(this.dataSource.manager, venueId),
    );
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

  // DEVICE_JOINED se emite solo la primera vez que el dispositivo entra a la
  // sesion; volver a escanear solo renueva last_seen_at. xmax = 0 es como
  // PostgreSQL distingue, dentro de un upsert, la fila insertada de la
  // actualizada.
  private async attachToSession(
    manager: EntityManager,
    venueId: string,
    sessionId: string,
    deviceId: string,
  ): Promise<void> {
    const result = await manager
      .createQueryBuilder()
      .insert()
      .into(SessionDevice)
      .values({ sessionId, deviceId, venueId })
      .orUpdate(['last_seen_at'], ['session_id', 'device_id'])
      .returning('(xmax = 0) AS inserted')
      .execute();

    const [{ inserted }] = result.raw as Array<{ inserted: boolean }>;
    if (inserted) {
      await this.activityEvents.record(manager, {
        eventType: 'DEVICE_JOINED',
        venueId,
        sessionId,
        deviceId,
      });
    }
  }
}
