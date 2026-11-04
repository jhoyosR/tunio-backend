import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DevicesService } from '../devices/devices.service';
import { PlaybackSource } from '../playback/entities/playback.entity';
import { NowPlayingView } from '../playback/views/now-playing.view';
import { SessionsService } from '../sessions/sessions.service';
import {
  OpenSessionSummary,
  QrAccessService,
} from '../venues/qr-access.service';
import { Vote } from './entities/vote.entity';
import { LiveQueueView } from './views/live-queue.view';

export interface LiveQueueEntry {
  queueItemId: string;
  songId: string;
  title: string;
  artistDisplay: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number;
  requestedAt: Date;
  voteCount: number;
  position: number;
  approxWaitSeconds: number;
  // La interfaz muestra «Votado» con este dato, sin adivinarlo.
  votedByDevice: boolean;
}

export interface NowPlaying {
  playbackId: string;
  songId: string;
  title: string;
  artistDisplay: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number;
  source: PlaybackSource;
  startedAt: Date;
  elapsedSeconds: number;
}

// session = null significa servicio cerrado: no es un error, la pantalla del
// bar y la app lo muestran como tal (WEB-04, MOV-09).
export interface LiveQueue {
  session: OpenSessionSummary | null;
  nowPlaying: NowPlaying | null;
  entries: LiveQueueEntry[];
}

const CLOSED_SERVICE: LiveQueue = {
  session: null,
  nowPlaying: null,
  entries: [],
};

@Injectable()
export class LiveQueueService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly qrAccessService: QrAccessService,
    private readonly sessionsService: SessionsService,
    private readonly devicesService: DevicesService,
  ) {}

  // App del cliente y pantalla del bar. Sin installationId (la pantalla) no
  // hay dispositivo que marcar y votedByDevice sale siempre false.
  async getForClient(
    publicToken: string,
    installationId: string | null,
  ): Promise<LiveQueue> {
    const { venueId, openSession } =
      await this.qrAccessService.resolveToken(publicToken);
    if (!openSession) {
      return CLOSED_SERVICE;
    }
    const deviceId = installationId
      ? await this.devicesService.findDeviceId(venueId, installationId)
      : null;
    return this.readSnapshot(openSession, deviceId);
  }

  // Panel del DJ. El personal no vota, asi que no hay nada que marcar.
  async getForStaff(venueId: string): Promise<LiveQueue> {
    const session = await this.sessionsService.findOpenSession(venueId);
    if (!session) {
      return CLOSED_SERVICE;
    }
    return this.readSnapshot({ id: session.id, status: session.status }, null);
  }

  // Una sola foto de la base: en REPEATABLE READ las tres consultas ven el
  // mismo instante y el mismo now(). Si no, una cancion que empieza a sonar
  // entre dos lecturas podria faltar en la cola y en "ahora suena" a la vez,
  // o la espera se calcularia contra un relevo distinto del que se muestra.
  private readSnapshot(
    session: OpenSessionSummary,
    deviceId: string | null,
  ): Promise<LiveQueue> {
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const rows = await manager.find(LiveQueueView, {
        where: { sessionId: session.id },
        order: { queuePosition: 'ASC' },
      });
      const nowPlaying = await manager.findOneBy(NowPlayingView, {
        sessionId: session.id,
      });
      const votedItemIds = deviceId
        ? await this.findVotedItemIds(manager, session.id, deviceId)
        : new Set<string>();

      return {
        session,
        nowPlaying: nowPlaying ? toNowPlaying(nowPlaying) : null,
        entries: rows.map((row) =>
          toEntry(row, votedItemIds.has(row.queueItemId)),
        ),
      };
    });
  }

  private async findVotedItemIds(
    manager: EntityManager,
    sessionId: string,
    deviceId: string,
  ): Promise<Set<string>> {
    const votes = await manager.find(Vote, {
      select: { queueItemId: true },
      where: { sessionId, deviceId },
    });
    return new Set(votes.map((vote) => vote.queueItemId));
  }
}

function toEntry(row: LiveQueueView, votedByDevice: boolean): LiveQueueEntry {
  return {
    queueItemId: row.queueItemId,
    songId: row.songId,
    title: row.title,
    artistDisplay: row.artistDisplay,
    thumbnailUrl: row.thumbnailUrl,
    durationSeconds: row.durationSeconds,
    requestedAt: row.requestedAt,
    voteCount: row.voteCount,
    position: row.queuePosition,
    approxWaitSeconds: row.approxWaitSeconds,
    votedByDevice,
  };
}

function toNowPlaying(view: NowPlayingView): NowPlaying {
  return {
    playbackId: view.playbackId,
    songId: view.songId,
    title: view.title,
    artistDisplay: view.artistDisplay,
    thumbnailUrl: view.thumbnailUrl,
    durationSeconds: view.durationSeconds,
    source: view.source,
    startedAt: view.startedAt,
    elapsedSeconds: view.elapsedSeconds,
  };
}
