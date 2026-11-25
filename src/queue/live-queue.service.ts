import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Song } from '../catalog/entities/song.entity';
import { AnonymousDevice } from '../devices/entities/anonymous-device.entity';
import { DevicesService } from '../devices/devices.service';
import { PlaybackSource } from '../playback/entities/playback.entity';
import { NowPlayingView } from '../playback/views/now-playing.view';
import { MusicSession } from '../sessions/entities/music-session.entity';
import { OPEN_SESSION_STATUSES } from '../sessions/sessions.service';
import {
  OpenSessionSummary,
  QrAccessService,
} from '../venues/qr-access.service';
import { QueueItem } from './entities/queue-item.entity';
import { Vote } from './entities/vote.entity';
import { LiveQueueView } from './views/live-queue.view';

export interface LiveQueueEntry {
  queueItemId: string;
  songId: string;
  // Pedir o votar se hace por video: con el la app vota desde la cola y
  // reconoce en la busqueda lo que ya esta pedido (MOV-05, MOV-07).
  youtubeVideoId: string;
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
  youtubeVideoId: string;
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

// Estado del local leido una sola vez, todavia sin personalizar. Lleva quien
// voto cada entrada pendiente para que el WebSocket pueda marcar «Votado» a
// cada telefono de la sala sin volver a la base por cada uno.
export interface LiveQueueSnapshot {
  session: OpenSessionSummary | null;
  nowPlaying: NowPlaying | null;
  rows: LiveQueueView[];
  voterHashesByItem: Map<string, Set<string>>;
  videoIdsBySong: Map<string, string>;
}

const CLOSED_SERVICE: LiveQueueSnapshot = {
  session: null,
  nowPlaying: null,
  rows: [],
  voterHashesByItem: new Map(),
  videoIdsBySong: new Map(),
};

@Injectable()
export class LiveQueueService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly qrAccessService: QrAccessService,
    private readonly devicesService: DevicesService,
  ) {}

  // App del cliente y pantalla del bar. Sin installationId (la pantalla) no
  // hay dispositivo que marcar y votedByDevice sale siempre false.
  async getForClient(
    publicToken: string,
    installationId: string | null,
  ): Promise<LiveQueue> {
    const { venueId } = await this.qrAccessService.resolveToken(publicToken);
    const deviceHash = installationId
      ? await this.devicesService.deviceHashFor(venueId, installationId)
      : null;
    return personalize(await this.readSnapshot(venueId), deviceHash);
  }

  // Panel del DJ. El personal no vota, asi que no hay nada que marcar.
  async getForStaff(venueId: string): Promise<LiveQueue> {
    return personalize(await this.readSnapshot(venueId), null);
  }

  // Una sola foto de la base: en REPEATABLE READ todas las consultas ven el
  // mismo instante y el mismo now(). Si no, una cancion que empieza a sonar
  // entre dos lecturas podria faltar en la cola y en "ahora suena" a la vez,
  // o la espera se calcularia contra un relevo distinto del que se muestra.
  readSnapshot(venueId: string): Promise<LiveQueueSnapshot> {
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const session = await manager.findOneBy(MusicSession, {
        venueId,
        status: In(OPEN_SESSION_STATUSES),
      });
      if (!session) {
        return CLOSED_SERVICE;
      }
      const rows = await manager.find(LiveQueueView, {
        where: { sessionId: session.id },
        order: { queuePosition: 'ASC' },
      });
      const nowPlaying = await manager.findOneBy(NowPlayingView, {
        sessionId: session.id,
      });
      const videoIdsBySong = await this.findVideoIds(manager, [
        ...rows.map((row) => row.songId),
        ...(nowPlaying ? [nowPlaying.songId] : []),
      ]);
      return {
        session: { id: session.id, status: session.status },
        nowPlaying: nowPlaying
          ? toNowPlaying(nowPlaying, videoIdsBySong.get(nowPlaying.songId)!)
          : null,
        rows,
        voterHashesByItem: await this.findPendingVoters(manager, session.id),
        videoIdsBySong,
      };
    });
  }

  // Las vistas no traen el video, y se lee aparte para no cambiar el esquema
  // de referencia; como el reproductor, que hace lo mismo.
  private async findVideoIds(
    manager: EntityManager,
    songIds: string[],
  ): Promise<Map<string, string>> {
    if (songIds.length === 0) {
      return new Map();
    }
    const songs = await manager.find(Song, {
      select: { id: true, youtubeVideoId: true },
      where: { id: In(songIds) },
    });
    return new Map(songs.map((song) => [song.id, song.youtubeVideoId]));
  }

  // Solo las entradas pendientes, que son las unicas que se muestran.
  private async findPendingVoters(
    manager: EntityManager,
    sessionId: string,
  ): Promise<Map<string, Set<string>>> {
    const votes = await manager
      .createQueryBuilder(Vote, 'vote')
      .innerJoin(QueueItem, 'item', 'item.id = vote.queue_item_id')
      .innerJoin(AnonymousDevice, 'device', 'device.id = vote.device_id')
      .select('vote.queue_item_id', 'queueItemId')
      .addSelect('device.device_hash', 'deviceHash')
      .where('vote.session_id = :sessionId', { sessionId })
      .andWhere(`item.status = 'PENDING'`)
      .getRawMany<{ queueItemId: string; deviceHash: string }>();

    const votersByItem = new Map<string, Set<string>>();
    for (const { queueItemId, deviceHash } of votes) {
      const voters = votersByItem.get(queueItemId) ?? new Set<string>();
      voters.add(deviceHash);
      votersByItem.set(queueItemId, voters);
    }
    return votersByItem;
  }
}

// La cola tal como la ve un telefono concreto; deviceHash = null para la
// pantalla del bar y el personal.
export function personalize(
  snapshot: LiveQueueSnapshot,
  deviceHash: string | null,
): LiveQueue {
  return {
    session: snapshot.session,
    nowPlaying: snapshot.nowPlaying,
    entries: snapshot.rows.map((row) =>
      toEntry(
        row,
        snapshot.videoIdsBySong.get(row.songId)!,
        deviceHash !== null &&
          (snapshot.voterHashesByItem.get(row.queueItemId)?.has(deviceHash) ??
            false),
      ),
    ),
  };
}

function toEntry(
  row: LiveQueueView,
  youtubeVideoId: string,
  votedByDevice: boolean,
): LiveQueueEntry {
  return {
    queueItemId: row.queueItemId,
    songId: row.songId,
    youtubeVideoId,
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

// Tambien la usa el reproductor (BE-15), que devuelve lo mismo.
export function toNowPlaying(
  view: NowPlayingView,
  youtubeVideoId: string,
): NowPlaying {
  return {
    playbackId: view.playbackId,
    songId: view.songId,
    youtubeVideoId,
    title: view.title,
    artistDisplay: view.artistDisplay,
    thumbnailUrl: view.thumbnailUrl,
    durationSeconds: view.durationSeconds,
    source: view.source,
    startedAt: view.startedAt,
    elapsedSeconds: view.elapsedSeconds,
  };
}
