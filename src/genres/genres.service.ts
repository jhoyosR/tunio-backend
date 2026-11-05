import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, SelectQueryBuilder } from 'typeorm';
import { AdminActionsService } from '../activity/admin-actions.service';
import { Song } from '../catalog/entities/song.entity';
import { Paginated } from '../common/interfaces/api-response.interface';
import { percentage } from '../common/utils/percentage';
import { DefaultPlaylistTrack } from '../playlists/entities/default-playlist-track.entity';
import { QueueItem } from '../queue/entities/queue-item.entity';
import { SessionScope, sessionsInScope } from '../sessions/sessions-in-scope';
import { UnclassifiedSongsQueryDto } from './dto/unclassified-songs-query.dto';
import { Genre, GENRE_CODES, GENRES } from './genres';

export interface GenreOption {
  code: Genre;
  label: string;
}

export interface SongGenre {
  songId: string;
  title: string;
  artistDisplay: string | null;
  thumbnailUrl: string | null;
  genre: Genre;
  genreSetByStaffId: string;
  genreSetAt: Date;
}

export interface UnclassifiedSong {
  songId: string;
  title: string;
  artistDisplay: string | null;
  thumbnailUrl: string | null;
  requestCount: number;
  lastRequestedAt: Date;
}

export interface GenreCoverage {
  totalRequests: number;
  classifiedRequests: number;
  // null sin solicitudes en el periodo: 0 % diria que nada esta clasificado.
  coveragePercent: number | null;
}

interface UnclassifiedRow {
  song_id: string;
  title: string;
  artist_display: string | null;
  thumbnail_url: string | null;
  request_count: string;
  last_requested_at: Date;
}

// Clasificacion manual de generos (decision 23). Una «solicitud» es una
// entrada de cola, la misma unidad que el total de solicitudes del tablero.
@Injectable()
export class GenresService {
  private readonly timezone: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly adminActions: AdminActionsService,
    configService: ConfigService,
  ) {
    this.timezone = configService.getOrThrow<string>('tunio.timezone');
  }

  listGenres(): GenreOption[] {
    return GENRE_CODES.map((code) => ({ code, label: GENRES[code] }));
  }

  // El genero es del catalogo comun, pero cada local solo clasifica lo que
  // le ha pasado por el: lo demas se ve como inexistente.
  async setGenre(
    venueId: string,
    staffId: string,
    songId: string,
    genre: Genre,
  ): Promise<SongGenre> {
    return this.dataSource.transaction(async (manager) => {
      // FOR NO KEY UPDATE y no FOR UPDATE: serializa dos clasificaciones
      // simultaneas (para que previousGenre sea cierto) sin frenar a quien
      // inserta una entrada de cola que referencia la cancion.
      const song = await manager.findOne(Song, {
        where: { id: songId },
        lock: { mode: 'for_no_key_update' },
      });
      if (!song || !(await this.isVenueSong(manager, venueId, songId))) {
        throw new NotFoundException('Song not found');
      }
      const previousGenre = song.genre;
      await manager.update(
        Song,
        { id: songId },
        {
          genre,
          genreSetByStaffId: staffId,
          genreSetAt: () => 'now()',
        },
      );
      await this.adminActions.record(manager, {
        venueId,
        actorStaffId: staffId,
        action: 'GENRE_SET',
        songId,
        details: { genre, previousGenre },
      });
      const updated = await manager.findOneByOrFail(Song, { id: songId });
      return this.toSongGenre(updated);
    });
  }

  // Las mas solicitadas primero, para que el esfuerzo de clasificar rinda.
  // Solo las pedidas: la lista por defecto no cuenta en la cobertura.
  async listUnclassified(
    venueId: string,
    query: UnclassifiedSongsQueryDto,
  ): Promise<Paginated<UnclassifiedSong>> {
    const scope = { venueId, from: query.from, to: query.to };
    const unclassified = this.requestsInScope(scope)
      .innerJoin('item.song', 'song')
      .andWhere('song.genre IS NULL');
    const totalRow = await unclassified
      .clone()
      .select('COUNT(DISTINCT song.id)', 'total')
      .getRawOne<{ total: string }>();
    const rows = await unclassified
      .select('song.id', 'song_id')
      .addSelect('song.title', 'title')
      .addSelect('song.artist_display', 'artist_display')
      .addSelect('song.thumbnail_url', 'thumbnail_url')
      .addSelect('COUNT(*)', 'request_count')
      .addSelect('MAX(item.requested_at)', 'last_requested_at')
      .groupBy('song.id')
      .orderBy('request_count', 'DESC')
      .addOrderBy('last_requested_at', 'DESC')
      .addOrderBy('song.id')
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany<UnclassifiedRow>();
    const totalItems = Number(totalRow?.total ?? 0);
    return {
      items: rows.map((row) => this.toUnclassified(row)),
      meta: {
        totalItems,
        itemsPerPage: query.limit,
        currentPage: query.page,
        totalPages: Math.ceil(totalItems / query.limit) || 1,
      },
    };
  }

  // Se mide con el genero que la cancion tiene hoy: clasificar una cancion
  // sube la cobertura de todos los periodos en que se pidio. Es la unica
  // definicion de la cobertura (docs/08, D9): el tablero (BE-22) la toma de
  // aqui.
  async getCoverage(scope: SessionScope): Promise<GenreCoverage> {
    const row = await this.requestsInScope(scope)
      .innerJoin('item.song', 'song')
      .select('COUNT(*)', 'total')
      .addSelect('COUNT(*) FILTER (WHERE song.genre IS NOT NULL)', 'classified')
      .getRawOne<{ total: string; classified: string }>();
    const totalRequests = Number(row?.total ?? 0);
    const classifiedRequests = Number(row?.classified ?? 0);
    return {
      totalRequests,
      classifiedRequests,
      coveragePercent: percentage(classifiedRequests, totalRequests),
    };
  }

  // Solicitudes de las sesiones del filtro, con la regla de la noche: una
  // pedida a la 1:00 cuenta en el dia en que empezo su sesion.
  private requestsInScope(scope: SessionScope): SelectQueryBuilder<QueueItem> {
    const sessions = sessionsInScope(scope, this.timezone);
    return this.dataSource.manager
      .createQueryBuilder(QueueItem, 'item')
      .where(`item.session_id IN (${sessions.sql})`, sessions.params);
  }

  // Cancion del local: pedida en alguna de sus sesiones o en su lista por
  // defecto (decision 23).
  private async isVenueSong(
    manager: EntityManager,
    venueId: string,
    songId: string,
  ): Promise<boolean> {
    const requested = await manager
      .createQueryBuilder(QueueItem, 'item')
      .innerJoin('item.session', 'session')
      .where('session.venue_id = :venueId', { venueId })
      .andWhere('item.song_id = :songId', { songId })
      .getExists();
    return (
      requested || manager.existsBy(DefaultPlaylistTrack, { venueId, songId })
    );
  }

  private toSongGenre(song: Song): SongGenre {
    return {
      songId: song.id,
      title: song.title,
      artistDisplay: song.artistDisplay,
      thumbnailUrl: song.thumbnailUrl,
      genre: song.genre as Genre,
      genreSetByStaffId: song.genreSetByStaffId as string,
      genreSetAt: song.genreSetAt as Date,
    };
  }

  private toUnclassified(row: UnclassifiedRow): UnclassifiedSong {
    return {
      songId: row.song_id,
      title: row.title,
      artistDisplay: row.artist_display,
      thumbnailUrl: row.thumbnail_url,
      requestCount: Number(row.request_count),
      lastRequestedAt: row.last_requested_at,
    };
  }
}
