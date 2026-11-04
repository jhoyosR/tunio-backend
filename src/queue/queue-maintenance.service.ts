import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LiveUpdatesService } from '../realtime/live-updates.service';
import { lockOpenSession } from '../sessions/lock-open-session';
import { QueueItem } from './entities/queue-item.entity';

export interface ClearQueueResult {
  removedCount: number;
}

@Injectable()
export class QueueMaintenanceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly liveUpdates: LiveUpdatesService,
  ) {}

  // Modo mantenimiento (docs/00, decision 16): vacia la cola de la sesion
  // abierta sin cerrarla. Las entradas pasan a REMOVED y no se borran, asi
  // que sus votos y su historia siguen para la analitica. Lo que suena no se
  // toca: al terminar entra la lista por defecto. Las sesiones cerradas
  // tampoco: sus pendientes cuentan como "la sesion cerro antes de su turno".
  async clearQueue(venueId: string): Promise<ClearQueueResult> {
    const removedCount = await this.dataSource.transaction(async (manager) => {
      // Con la sesion tomada, ninguna solicitud queda a medias entre la
      // limpieza y la cola vacia.
      const session = await lockOpenSession(manager, venueId);
      if (!session) {
        throw new ConflictException('The venue has no open session');
      }
      const result = await manager.update(
        QueueItem,
        { sessionId: session.id, status: 'PENDING' },
        { status: 'REMOVED', finishedAt: () => 'now()' },
      );
      return result.affected ?? 0;
    });
    if (removedCount > 0) {
      this.liveUpdates.venueChanged(venueId);
    }
    return { removedCount };
  }
}
