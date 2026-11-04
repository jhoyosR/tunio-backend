import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In, SelectQueryBuilder } from 'typeorm';
import { ActivityEventsService } from '../activity/activity-events.service';
import { Song } from '../catalog/entities/song.entity';
import { TUNIO_SCHEMA } from '../database/database.constants';
import { BlockedSong } from '../moderation/entities/blocked-song.entity';
import { DefaultPlaylistTrack } from '../playlists/entities/default-playlist-track.entity';
import { QueueItem } from '../queue/entities/queue-item.entity';
import { NowPlaying, toNowPlaying } from '../queue/live-queue.service';
import { LiveQueueView } from '../queue/views/live-queue.view';
import { LiveUpdatesService } from '../realtime/live-updates.service';
import { MusicSession } from '../sessions/entities/music-session.entity';
import { OPEN_SESSION_STATUSES } from '../sessions/sessions.service';
import { Playback, PlaybackSource } from './entities/playback.entity';
import { NowPlayingView } from './views/now-playing.view';

// Lo que el reproductor necesita para cargar el video y, tras una recarga,
// posicionarse en elapsedSeconds (WEB-05).
export interface PlayerTrack extends NowPlaying {
  youtubeVideoId: string;
}

interface NextTrack {
  songId: string;
  source: PlaybackSource;
  queueItemId: string | null;
  // Solo para la lista por defecto: lo que pasa a guardar el cursor.
  playlistPosition: number | null;
}

interface NextResult {
  track: PlayerTrack | null;
  started: boolean;
}

@Injectable()
export class PlayerService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly activityEvents: ActivityEventsService,
    private readonly liveUpdates: LiveUpdatesService,
  ) {}

  // Pedir la siguiente es empezarla (docs/00, decision 13): si ya suena algo
  // se devuelve eso, asi que repetir la peticion -una recarga de la pantalla,
  // un reintento por red- no consume otra cancion. null = no hay nada que
  // poner: cola vacia y lista por defecto vacia o sin nada reproducible.
  async next(venueId: string, staffId: string): Promise<PlayerTrack | null> {
    const { track, started } = await this.dataSource.transaction((manager) =>
      this.nextInTransaction(manager, venueId, staffId),
    );
    if (started) {
      this.liveUpdates.venueChanged(venueId);
    }
    return track;
  }

  // FOR UPDATE sobre la sesion serializa las decisiones del local: dos
  // peticiones simultaneas no pueden ver ambas "no suena nada" y arrancar dos
  // canciones. El indice uq_one_playback_running_per_session es la red de
  // seguridad. Pedir o votar toma la sesion FOR SHARE antes que nada, asi que
  // los dos caminos bloquean en el mismo orden y no se interbloquean.
  private async nextInTransaction(
    manager: EntityManager,
    venueId: string,
    staffId: string,
  ): Promise<NextResult> {
    const session = await manager
      .createQueryBuilder(MusicSession, 'session')
      .setLock('pessimistic_write')
      .where('session.venue_id = :venueId', { venueId })
      .andWhere({ status: In(OPEN_SESSION_STATUSES) })
      .getOne();
    // En PAUSED la musica sigue (BE-08); solo una sesion cerrada no suena.
    if (!session) {
      throw new ConflictException('The venue has no open session');
    }

    const running = await manager.findOneBy(Playback, {
      sessionId: session.id,
      status: 'PLAYING',
    });
    if (running) {
      return {
        track: await this.readTrack(manager, session.id),
        started: false,
      };
    }

    await this.discardUnplayableRequests(manager, session);
    const next =
      (await this.nextFromQueue(manager, session)) ??
      (await this.nextFromDefaultPlaylist(manager, session));
    if (!next) {
      return { track: null, started: false };
    }
    await this.start(manager, session, next, staffId);
    return { track: await this.readTrack(manager, session.id), started: true };
  }

  // La cola tiene prioridad sobre la lista por defecto, pero nunca la
  // interrumpe: solo se consulta al acabar la pista en curso. Una cancion
  // con bloqueo vigente no se elige; la entrada se queda PENDING y sale de
  // la cola cuando el bloqueo la marque BLOCKED (BE-19).
  private async nextFromQueue(
    manager: EntityManager,
    session: MusicSession,
  ): Promise<NextTrack | null> {
    const query = manager
      .createQueryBuilder(LiveQueueView, 'queue')
      .where('queue.session_id = :sessionId', { sessionId: session.id })
      .orderBy('queue.queue_position', 'ASC');
    const row = await this.withoutActiveBlock(
      query,
      'queue.song_id',
      session.venueId,
    ).getOne();
    return row
      ? {
          songId: row.songId,
          source: 'QUEUE',
          queueItemId: row.queueItemId,
          playlistPosition: null,
        }
      : null;
  }

  // El cursor guarda la position de la ultima pista servida (decision 15):
  // primero las pistas posteriores y, si no quedan, se vuelve a empezar. Asi
  // anadir o quitar pistas nunca descoloca la rotacion. Las que no se pueden
  // reproducir o estan bloqueadas se saltan sin mover el cursor sobre ellas.
  private async nextFromDefaultPlaylist(
    manager: EntityManager,
    session: MusicSession,
  ): Promise<NextTrack | null> {
    if (!session.defaultPlaylistId) {
      return null;
    }
    const query = manager
      .createQueryBuilder(DefaultPlaylistTrack, 'track')
      .innerJoin(Song, 'song', 'song.id = track.song_id')
      .where('track.playlist_id = :playlistId', {
        playlistId: session.defaultPlaylistId,
      })
      .andWhere('song.last_known_playable')
      .orderBy('CASE WHEN track.position > :cursor THEN 0 ELSE 1 END', 'ASC')
      .addOrderBy('track.position', 'ASC')
      .setParameter('cursor', session.defaultPlaylistCursor);
    const track = await this.withoutActiveBlock(
      query,
      'track.song_id',
      session.venueId,
    ).getOne();
    return track
      ? {
          songId: track.songId,
          source: 'DEFAULT_PLAYLIST',
          queueItemId: null,
          playlistPosition: track.position,
        }
      : null;
  }

  // Una entrada cuya cancion ya se sabe no reproducible (otro local o una
  // reproduccion anterior lo descubrio despues de encolarla) no va a sonar:
  // se marca UNAVAILABLE en lugar de dejarla en la cola para siempre.
  private async discardUnplayableRequests(
    manager: EntityManager,
    session: MusicSession,
  ): Promise<void> {
    const result = await manager
      .createQueryBuilder()
      .update(QueueItem)
      .set({ status: 'UNAVAILABLE', finishedAt: () => 'now()' })
      .where(`session_id = :sessionId AND status = 'PENDING'`, {
        sessionId: session.id,
      })
      .andWhere(
        `song_id IN (SELECT id FROM ${TUNIO_SCHEMA}.songs WHERE NOT last_known_playable)`,
      )
      .returning(['id', 'song_id'])
      .execute();
    for (const item of result.raw as { id: string; song_id: string }[]) {
      await this.activityEvents.record(manager, {
        eventType: 'PLAYBACK_UNAVAILABLE',
        venueId: session.venueId,
        sessionId: session.id,
        songId: item.song_id,
        details: { queueItemId: item.id, detectedAt: 'SELECTION' },
      });
    }
  }

  private async start(
    manager: EntityManager,
    session: MusicSession,
    next: NextTrack,
    staffId: string,
  ): Promise<void> {
    const playback = await manager.save(
      manager.create(Playback, {
        sessionId: session.id,
        venueId: session.venueId,
        songId: next.songId,
        source: next.source,
        queueItemId: next.queueItemId,
      }),
    );
    if (next.queueItemId) {
      await manager.update(
        QueueItem,
        { id: next.queueItemId },
        { status: 'PLAYING' },
      );
    }
    if (next.playlistPosition !== null) {
      await manager.update(
        MusicSession,
        { id: session.id },
        { defaultPlaylistCursor: next.playlistPosition },
      );
    }
    await this.activityEvents.record(manager, {
      eventType: 'PLAYBACK_STARTED',
      venueId: session.venueId,
      sessionId: session.id,
      songId: next.songId,
      staffUserId: staffId,
      details: {
        playbackId: playback.id,
        source: next.source,
        queueItemId: next.queueItemId,
      },
    });
  }

  // Leido de v_now_playing, igual que la cola en vivo: elapsedSeconds sale
  // del reloj del servidor, no del de la pantalla.
  private async readTrack(
    manager: EntityManager,
    sessionId: string,
  ): Promise<PlayerTrack> {
    const view = await manager.findOneByOrFail(NowPlayingView, { sessionId });
    const song = await manager.findOneByOrFail(Song, { id: view.songId });
    return { ...toNowPlaying(view), youtubeVideoId: song.youtubeVideoId };
  }

  private withoutActiveBlock<T extends object>(
    query: SelectQueryBuilder<T>,
    songColumn: string,
    venueId: string,
  ): SelectQueryBuilder<T> {
    const activeBlock = query
      .subQuery()
      .select('1')
      .from(BlockedSong, 'block')
      .where(`block.venue_id = :venueId AND block.song_id = ${songColumn}`)
      .andWhere('block.lifted_at IS NULL AND block.expires_at > now()')
      .getQuery();
    return query
      .andWhere(`NOT EXISTS ${activeBlock}`)
      .setParameter('venueId', venueId);
  }
}
