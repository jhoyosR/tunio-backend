import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { isUUID } from 'class-validator';
import { Subscription } from 'rxjs';
import { Namespace, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { JwtPayload } from '../auth/interfaces/authenticated-staff.interface';
import { findActiveVenueRole } from '../auth/venue-membership';
import { DevicesService } from '../devices/devices.service';
import { LiveQueueService, personalize } from '../queue/live-queue.service';
import { VenueStaff } from '../staff/entities/venue-staff.entity';
import { QrAccessService } from '../venues/qr-access.service';
import { LiveUpdatesService } from './live-updates.service';

export const LIVE_NAMESPACE = '/live';
export const QUEUE_STATE_EVENT = 'queue:state';

// Lo que el cliente manda en el `auth` del handshake de Socket.IO, que no
// viaja en la URL. La app y la pantalla del bar entran con el token del QR;
// el panel, con el token de acceso del personal y el local.
interface HandshakeAuth {
  qrToken?: unknown;
  installationId?: unknown;
  accessToken?: unknown;
  venueId?: unknown;
}

// Lo que queda guardado en el socket. Nunca el UUID de instalacion en claro:
// solo su hash, que es lo mismo que guarda la base.
interface LiveSocketData {
  venueId: string;
  deviceHash: string | null;
}

type LiveSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  LiveSocketData
>;

// Una sala por local, no por sesion (docs/00, decision 20): quien se conecta
// con el servicio cerrado se entera solo de que se abrio la sesion.
function venueRoom(venueId: string): string {
  return `venue:${venueId}`;
}

// Un solo evento con el estado completo, el mismo que GET /qr/:token/queue.
// Se envia al conectar (y por tanto al reconectar) y tras cada cambio: el
// cliente reemplaza lo que tenia en vez de aplicar diferencias, asi que no
// puede quedar desfasado por un mensaje perdido durante un corte.
@WebSocketGateway({ namespace: LIVE_NAMESPACE })
export class LiveQueueGateway
  implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy
{
  private readonly logger = new Logger(LiveQueueGateway.name);
  // Local -> "hubo otro cambio mientras se difundia". Ver refresh().
  private readonly refreshing = new Map<string, boolean>();
  private subscription?: Subscription;

  @WebSocketServer()
  private readonly server: Namespace;

  constructor(
    private readonly liveQueueService: LiveQueueService,
    private readonly liveUpdates: LiveUpdatesService,
    private readonly qrAccessService: QrAccessService,
    private readonly devicesService: DevicesService,
    private readonly jwtService: JwtService,
    @InjectRepository(VenueStaff)
    private readonly venueStaffRepository: Repository<VenueStaff>,
  ) {}

  // La autenticacion va en un middleware del handshake: si falla, el cliente
  // recibe connect_error con el motivo y nunca llega a entrar en una sala.
  afterInit(server: Namespace): void {
    server.use((socket: LiveSocket, next) => {
      this.authenticate(socket.handshake.auth as HandshakeAuth)
        .then((data) => {
          socket.data = data;
          next();
        })
        .catch((error: Error) => next(error));
    });
    this.subscription = this.liveUpdates.venueChanged$.subscribe((venueId) =>
      this.refresh(venueId),
    );
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  // Unirse y pedir una difusion a la sala, en lugar de mandar el estado solo
  // a este socket: asi todo envio pasa por refresh(), que los serializa, y un
  // estado viejo nunca llega despues de uno nuevo.
  async handleConnection(socket: LiveSocket): Promise<void> {
    await socket.join(venueRoom(socket.data.venueId));
    this.refresh(socket.data.venueId);
  }

  // Coalescencia por local: una sola lectura de la base en curso, y si llegan
  // cambios mientras tanto, una sola relectura al terminar. Con veinte votos
  // por segundo se hacen pocas lecturas, y la ultima difusion siempre refleja
  // el ultimo cambio confirmado.
  private refresh(venueId: string): void {
    if (this.refreshing.has(venueId)) {
      this.refreshing.set(venueId, true);
      return;
    }
    this.refreshing.set(venueId, false);
    void this.broadcastUntilSettled(venueId);
  }

  private async broadcastUntilSettled(venueId: string): Promise<void> {
    try {
      do {
        this.refreshing.set(venueId, false);
        await this.broadcast(venueId);
      } while (this.refreshing.get(venueId));
    } catch (error) {
      // Un fallo de difusion no debe tumbar el servidor; el siguiente cambio
      // o la siguiente reconexion vuelven a enviar el estado completo.
      this.logger.error(
        `Live queue broadcast failed for venue ${venueId}`,
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.refreshing.delete(venueId);
    }
  }

  // Una lectura para toda la sala; la marca «Votado» de cada telefono se
  // calcula en memoria con los votantes que trae la foto.
  private async broadcast(venueId: string): Promise<void> {
    const sockets = await this.server.in(venueRoom(venueId)).fetchSockets();
    if (sockets.length === 0) {
      return;
    }
    const snapshot = await this.liveQueueService.readSnapshot(venueId);
    for (const socket of sockets) {
      const { deviceHash } = socket.data as LiveSocketData;
      socket.emit(QUEUE_STATE_EVENT, personalize(snapshot, deviceHash));
    }
  }

  private authenticate(auth: HandshakeAuth): Promise<LiveSocketData> {
    if (typeof auth.accessToken === 'string') {
      return this.authenticateStaff(auth.accessToken, auth.venueId);
    }
    if (typeof auth.qrToken === 'string') {
      return this.authenticateClient(auth.qrToken, auth.installationId);
    }
    return Promise.reject(new Error('qrToken or accessToken is required'));
  }

  // Las mismas comprobaciones que el HTTP: QR conocido y activo de un local
  // activo (resolveToken). No exige sesion abierta.
  private async authenticateClient(
    qrToken: string,
    installationId: unknown,
  ): Promise<LiveSocketData> {
    if (!isUUID(qrToken)) {
      throw new Error('qrToken must be a UUID');
    }
    if (installationId !== undefined && !isUUID(installationId)) {
      throw new Error('installationId must be a UUID');
    }
    const { venueId } = await this.qrAccessService.resolveToken(qrToken);
    const deviceHash =
      typeof installationId === 'string'
        ? await this.devicesService.deviceHashFor(venueId, installationId)
        : null;
    return { venueId, deviceHash };
  }

  // Token valido y pertenencia al local leida de la base, como el guard HTTP.
  private async authenticateStaff(
    accessToken: string,
    venueId: unknown,
  ): Promise<LiveSocketData> {
    if (typeof venueId !== 'string') {
      throw new Error('venueId is required');
    }
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(accessToken);
    } catch {
      throw new Error('Unauthorized');
    }
    const role = await findActiveVenueRole(
      this.venueStaffRepository,
      payload.sub,
      venueId,
    );
    if (!role) {
      throw new Error('No access to this venue');
    }
    return { venueId, deviceHash: null };
  }
}
