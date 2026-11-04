import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import {
  FinishContext,
  finishPlayback,
  PlaybackOutcome,
} from './finish-playback';
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
  // Si hubo que avisar a la sala: algo empezo, termino o salio de la cola.
  changed: boolean;
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
  next(venueId: string, staffId: string): Promise<PlayerTrack | null> {
    return this.inSessionTransaction(venueId, (manager, session) =>
      this.currentOrNext(manager, session, staffId),
    );
  }

  // Cada aviso cierra la reproduccion y elige la siguiente en la misma
  // transaccion (decision 13): nunca queda un hueco sin musica entre dos
  // llamadas, y un video no disponible deja paso al siguiente sin que la
  // pantalla haga nada mas. Repetir el aviso -un reintento por red- no
  // cierra nada dos veces: la reproduccion ya no esta en curso y se devuelve
  // lo que suena.
  finish(
    venueId: string,
    playbackId: string,
    outcome: PlaybackOutcome,
    context: FinishContext,
  ): Promise<PlayerTrack | null> {
    return this.inSessionTransaction(venueId, async (manager, session) => {
      // Filtrar por la sesion abierta hace que una reproduccion de otro
      // local, o de una noche anterior, se vea como inexistente.
      const playback = await manager.findOneBy(Playback, {
        id: playbackId,
        sessionId: session.id,
      });
      if (!playback) {
        throw new NotFoundException('Playback not found');
      }
      if (playback.status !== 'PLAYING') {
        return this.currentOrNext(manager, session, context.staffUserId);
      }
      await finishPlayback(
        manager,
        this.activityEvents,
        playback,
        outcome,
        context,
      );
      const result = await this.currentOrNext(
        manager,
        session,
        context.staffUserId,
      );
      return { ...result, changed: true };
    });
  }

  // FOR UPDATE sobre la sesion serializa las decisiones del local: dos
  // peticiones simultaneas no pueden ver ambas "no suena nada" y arrancar dos
  // canciones, ni cerrar dos veces la misma. El indice
  // uq_one_playback_running_per_session es la red de seguridad. Pedir o
  // votar y cerrar la sesion toman tambien la sesion antes que nada, asi que
  // todos los caminos bloquean en el mismo orden y no se interbloquean.
  private async inSessionTransaction(
    venueId: string,
    work: (
      manager: EntityManager,
      session: MusicSession,
    ) => Promise<NextResult>,
  ): Promise<PlayerTrack | null> {
    const { track, changed } = await this.dataSource.transaction(
      async (manager) => {
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
        return work(manager, session);
      },
    );
    if (changed) {
      this.liveUpdates.venueChanged(venueId);
    }
    return track;
  }

  private async currentOrNext(
    manager: EntityManager,
    session: MusicSession,
    staffId: string,
  ): Promise<NextResult> {
    const running = await manager.findOneBy(Playback, {
      sessionId: session.id,
      status: 'PLAYING',
    });
    if (running) {
      return {
        track: await this.readTrack(manager, session.id),
        changed: false,
      };
    }

    const discarded = await this.discardUnplayableRequests(manager, session);
    const next =
      (await this.nextFromQueue(manager, session)) ??
      (await this.nextFromDefaultPlaylist(manager, session));
    if (!next) {
      return { track: null, changed: discarded > 0 };
    }
    await this.start(manager, session, next, staffId);
    return { track: await this.readTrack(manager, session.id), changed: true };
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
  ): Promise<number> {
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
    const discarded = result.raw as { id: string; song_id: string }[];
    for (const item of discarded) {
      await this.activityEvents.record(manager, {
        eventType: 'PLAYBACK_UNAVAILABLE',
        venueId: session.venueId,
        sessionId: session.id,
        songId: item.song_id,
        details: { queueItemId: item.id, detectedAt: 'SELECTION' },
      });
    }
    return discarded.length;
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
