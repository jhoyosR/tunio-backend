import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { Song } from '../catalog/entities/song.entity';
import { SongsService } from '../catalog/songs.service';
import { DefaultPlaylistTrack } from './entities/default-playlist-track.entity';
import { DefaultPlaylist } from './entities/default-playlist.entity';

const UNIQUE_VIOLATION = '23505';
const ONE_SONG_PER_PLAYLIST = 'default_playlist_tracks_playlist_id_song_id_key';

export interface PlaylistTrack {
  trackId: string;
  songId: string;
  youtubeVideoId: string;
  title: string;
  artistDisplay: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number;
  position: number;
  addedAt: Date;
}

export interface PlaylistDetails {
  id: string;
  name: string;
  trackCount: number;
  // Lo que el panel muestra como duracion total de la lista (WEB-07).
  totalDurationSeconds: number;
  tracks: PlaylistTrack[];
}

// Una sola lista por local (docs/06): se consulta, se anade al final y se
// quita. No hay reordenamiento (decision 14).
@Injectable()
export class DefaultPlaylistService {
  constructor(
    @InjectRepository(DefaultPlaylist)
    private readonly playlistRepository: Repository<DefaultPlaylist>,
    @InjectRepository(DefaultPlaylistTrack)
    private readonly trackRepository: Repository<DefaultPlaylistTrack>,
    private readonly dataSource: DataSource,
    private readonly songsService: SongsService,
  ) {}

  // Las pistas salen en el orden en que sonaran: por position.
  async getPlaylist(venueId: string): Promise<PlaylistDetails> {
    const playlist = await this.findPlaylist(this.dataSource.manager, venueId);
    const tracks = await this.trackRepository.find({
      where: { playlistId: playlist.id },
      relations: { song: true },
      order: { position: 'ASC' },
    });
    const entries = tracks.map((track) => this.toTrack(track, track.song));
    return {
      id: playlist.id,
      name: playlist.name,
      trackCount: entries.length,
      totalDurationSeconds: entries.reduce(
        (total, track) => total + track.durationSeconds,
        0,
      ),
      tracks: entries,
    };
  }

  async addTrack(
    venueId: string,
    youtubeVideoId: string,
  ): Promise<PlaylistTrack> {
    // Fuera de la transaccion, como en BE-12: consulta a YouTube, y esperar a
    // la red con la lista bloqueada frenaria a quien anade a la vez.
    const song = await this.songsService.resolvePlayableSong(youtubeVideoId);
    try {
      const track = await this.dataSource.transaction((manager) =>
        this.appendTrack(manager, venueId, song),
      );
      return this.toTrack(track, song);
    } catch (error) {
      if (this.isDuplicateSongViolation(error)) {
        throw new ConflictException(
          'This song is already in the default playlist',
        );
      }
      throw error;
    }
  }

  // Borrado fisico: playbacks no referencia esta tabla, asi que una cancion
  // que ya sono se puede quitar sin tocar su historial. Filtrar por venue_id
  // hace que una pista de otro local se vea como inexistente.
  async removeTrack(venueId: string, trackId: string): Promise<void> {
    const result = await this.trackRepository.delete({ id: trackId, venueId });
    if (result.affected === 0) {
      throw new NotFoundException('Track not found in the default playlist');
    }
  }

  // FOR UPDATE sobre la lista serializa a quienes anaden a la vez: sin el,
  // dos altas leerian el mismo max(position) y la segunda chocaria con
  // UNIQUE (playlist_id, position). Los huecos que dejan los borrados no
  // importan: la posicion nueva siempre es la ultima mas uno.
  private async appendTrack(
    manager: EntityManager,
    venueId: string,
    song: Song,
  ): Promise<DefaultPlaylistTrack> {
    const playlist = await this.findPlaylist(manager, venueId, true);
    const { lastPosition } = (await manager
      .createQueryBuilder(DefaultPlaylistTrack, 'track')
      .select('COALESCE(MAX(track.position), 0)', 'lastPosition')
      .where('track.playlist_id = :playlistId', { playlistId: playlist.id })
      .getRawOne<{ lastPosition: number }>()) ?? { lastPosition: 0 };

    return manager.save(
      manager.create(DefaultPlaylistTrack, {
        playlistId: playlist.id,
        venueId,
        songId: song.id,
        position: Number(lastPosition) + 1,
      }),
    );
  }

  // Los locales se crean con su lista (semilla, BE-04); si faltara, es un
  // dato ausente y no se crea a escondidas.
  private async findPlaylist(
    manager: EntityManager,
    venueId: string,
    lock = false,
  ): Promise<DefaultPlaylist> {
    const query = manager
      .createQueryBuilder(DefaultPlaylist, 'playlist')
      .where('playlist.venue_id = :venueId', { venueId });
    if (lock) {
      query.setLock('pessimistic_write');
    }
    const playlist = await query.getOne();
    if (!playlist) {
      throw new NotFoundException('This venue has no default playlist');
    }
    return playlist;
  }

  private isDuplicateSongViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = error.driverError as {
      code?: string;
      constraint?: string;
    };
    return (
      driverError.code === UNIQUE_VIOLATION &&
      driverError.constraint === ONE_SONG_PER_PLAYLIST
    );
  }

  private toTrack(track: DefaultPlaylistTrack, song: Song): PlaylistTrack {
    return {
      trackId: track.id,
      songId: song.id,
      youtubeVideoId: song.youtubeVideoId,
      title: song.title,
      artistDisplay: song.artistDisplay,
      thumbnailUrl: song.thumbnailUrl,
      durationSeconds: song.durationSeconds,
      position: track.position,
      addedAt: track.addedAt,
    };
  }
}
