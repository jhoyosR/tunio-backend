import { EntityManager } from 'typeorm';
import { ActivityEventsService } from '../activity/activity-events.service';
import { Song } from '../catalog/entities/song.entity';
import {
  QueueItem,
  QueueItemStatus,
} from '../queue/entities/queue-item.entity';
import { Playback, PlaybackStatus } from './entities/playback.entity';

export type PlaybackOutcome = Exclude<PlaybackStatus, 'PLAYING'>;

// Un ERROR deja la entrada como UNAVAILABLE porque queue_items no tiene
// estado de error y no va a sonar; a diferencia de UNAVAILABLE, no veta la
// cancion (ver finishPlayback).
const QUEUE_ITEM_STATUS_BY_OUTCOME = {
  COMPLETED: 'PLAYED',
  SKIPPED: 'SKIPPED',
  UNAVAILABLE: 'UNAVAILABLE',
  ERROR: 'UNAVAILABLE',
} as const satisfies Record<PlaybackOutcome, QueueItemStatus>;

const EVENT_BY_OUTCOME = {
  COMPLETED: 'PLAYBACK_COMPLETED',
  SKIPPED: 'PLAYBACK_SKIPPED',
  UNAVAILABLE: 'PLAYBACK_UNAVAILABLE',
  ERROR: 'PLAYBACK_ERROR',
} as const satisfies Record<PlaybackOutcome, string>;

export interface FinishContext {
  // Quien lo provoco: el personal del reproductor, del panel o del cierre.
  staffUserId: string;
  errorMessage?: string | null;
  // Por que termino, cuando no lo dice el desenlace (p. ej. SESSION_CLOSED).
  reason?: string;
}

// Cierra una reproduccion en curso y su entrada de cola en la transaccion
// del llamador, con su evento. La comparten el reproductor (BE-16) y el
// cierre de la sesion (BE-08), que la da por saltada.
export async function finishPlayback(
  manager: EntityManager,
  activityEvents: ActivityEventsService,
  playback: Playback,
  outcome: PlaybackOutcome,
  context: FinishContext,
): Promise<void> {
  await manager.update(
    Playback,
    { id: playback.id },
    {
      status: outcome,
      endedAt: () => 'now()',
      errorMessage: context.errorMessage ?? null,
    },
  );
  if (playback.queueItemId) {
    await manager.update(
      QueueItem,
      { id: playback.queueItemId },
      {
        status: QUEUE_ITEM_STATUS_BY_OUTCOME[outcome],
        finishedAt: () => 'now()',
      },
    );
  }
  // Solo «no disponible» lo afirma el propio reproductor de YouTube (borrado,
  // privado o no embebible); un ERROR puede ser pasajero y no debe vetar la
  // cancion en todos los locales. La siguiente verificacion (BE-11) la
  // rehabilita si vuelve a estar disponible.
  if (outcome === 'UNAVAILABLE') {
    await manager.update(
      Song,
      { id: playback.songId },
      { lastKnownPlayable: false, verifiedAt: () => 'now()' },
    );
  }
  await activityEvents.record(manager, {
    eventType: EVENT_BY_OUTCOME[outcome],
    venueId: playback.venueId,
    sessionId: playback.sessionId,
    songId: playback.songId,
    staffUserId: context.staffUserId,
    details: {
      playbackId: playback.id,
      source: playback.source,
      queueItemId: playback.queueItemId,
      ...(context.reason ? { reason: context.reason } : {}),
    },
  });
}
