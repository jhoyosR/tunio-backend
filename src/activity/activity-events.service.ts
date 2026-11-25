import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  ActivityEvent,
  ActivityEventType,
} from './entities/activity-event.entity';

// Contexto que exige cada tipo de evento. Lo comprueba el compilador: un
// evento de voto sin dispositivo, o de sesion sin sesion, no compila.
// device_id es el id de anonymous_devices, nunca el UUID de instalacion.
type EventContext =
  | {
      eventType: 'SONG_REQUESTED' | 'VOTE_CAST' | 'VOTE_REJECTED';
      sessionId: string;
      songId: string;
      deviceId: string;
    }
  | {
      eventType:
        | 'PLAYBACK_STARTED'
        | 'PLAYBACK_COMPLETED'
        | 'PLAYBACK_SKIPPED'
        | 'PLAYBACK_UNAVAILABLE'
        | 'PLAYBACK_ERROR';
      sessionId: string;
      songId: string;
      staffUserId?: string;
    }
  | {
      eventType: 'SESSION_ACTIVE' | 'SESSION_PAUSED' | 'SESSION_CLOSED';
      sessionId: string;
      staffUserId: string;
    }
  | {
      eventType: 'DEVICE_JOINED';
      sessionId: string;
      deviceId: string;
    }
  | {
      eventType: 'ADMIN_ACTION';
      staffUserId: string;
      sessionId?: string;
      songId?: string;
    }
  | {
      // Eventos que informa la app (MOV-11); pueden ocurrir sin sesion.
      eventType: 'QR_SCANNED' | 'SEARCH_PERFORMED' | 'SEARCH_RESULT_SELECTED';
      sessionId?: string;
      songId?: string;
      deviceId?: string;
    };

export type NewActivityEvent = EventContext & {
  venueId: string;
  details?: Record<string, unknown>;
};

// Sustituye a los disparadores que se eliminaron del esquema (decision 6).
@Injectable()
export class ActivityEventsService {
  // Recibe el EntityManager de la transaccion del hecho a proposito, en lugar
  // de abrir una propia: si el evento se escribiera despues de confirmar y el
  // proceso cayera en medio, quedaria un hecho sin evento y el tablero dejaria
  // de cuadrar con la operacion.
  async record(manager: EntityManager, event: NewActivityEvent): Promise<void> {
    await manager.save(ActivityEvent, {
      venueId: event.venueId,
      eventType: event.eventType satisfies ActivityEventType,
      sessionId: event.sessionId ?? null,
      songId: 'songId' in event ? (event.songId ?? null) : null,
      deviceId: 'deviceId' in event ? (event.deviceId ?? null) : null,
      staffUserId: 'staffUserId' in event ? (event.staffUserId ?? null) : null,
      details: event.details ?? {},
    });
  }
}
