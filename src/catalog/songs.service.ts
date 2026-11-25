import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Song } from './entities/song.entity';
import {
  SearchResult,
  VIDEO_LOOKUP_QUOTA_COST,
  VideoDetails,
  YoutubeClient,
  YoutubeUnavailableError,
} from './youtube.client';
import { YoutubeQuotaService } from './youtube-quota.service';

@Injectable()
export class SongsService {
  private readonly logger = new Logger(SongsService.name);

  constructor(
    @InjectRepository(Song)
    private readonly songRepository: Repository<Song>,
    private readonly youtubeClient: YoutubeClient,
    private readonly quotaService: YoutubeQuotaService,
  ) {}

  // Comprueba con YouTube que el video se puede reproducir ANTES de encolarlo
  // y devuelve la cancion persistida. BE-12 debe llamarlo antes de abrir su
  // transaccion: esperar a la red con un bloqueo tomado frenaria a todos los
  // que piden la misma cancion.
  async resolvePlayableSong(youtubeVideoId: string): Promise<Song> {
    const known = await this.songRepository.findOneBy({ youtubeVideoId });

    let video: VideoDetails | undefined;
    try {
      video = await this.lookUpVideo(youtubeVideoId);
    } catch (error) {
      if (!(error instanceof YoutubeUnavailableError)) {
        throw error;
      }
      return this.fallBackToLastKnown(known, error);
    }

    if (!video?.playable) {
      if (known) {
        await this.markVerified(known, false);
      }
      throw new UnprocessableEntityException(
        'This song cannot be played in the venue',
      );
    }
    return known
      ? this.markVerified(known, true)
      : this.saveNewSong(video.song);
  }

  // undefined: YouTube no lo devolvio (borrado o privado).
  private async lookUpVideo(
    youtubeVideoId: string,
  ): Promise<VideoDetails | undefined> {
    const allowed = await this.quotaService.tryConsume(
      VIDEO_LOOKUP_QUOTA_COST,
      this.quotaService.dailyQuota,
    );
    if (!allowed) {
      throw new YoutubeUnavailableError('Daily quota exhausted');
    }
    const videos = await this.youtubeClient.getVideos([youtubeVideoId]);
    return videos.get(youtubeVideoId);
  }

  // Sin poder verificar, se confia en lo ultimo que se supo: una cancion que
  // ya sono no deja de pedirse porque YouTube tarde o se agote la cuota. Una
  // cancion nueva no se puede aceptar: no hay de donde sacar su duracion.
  private fallBackToLastKnown(
    known: Song | null,
    error: YoutubeUnavailableError,
  ): Song {
    this.logger.warn({ event: 'song_verification', error: error.message });
    if (!known) {
      throw new ServiceUnavailableException('Song catalog is unavailable');
    }
    if (!known.lastKnownPlayable) {
      throw new UnprocessableEntityException(
        'This song cannot be played in the venue',
      );
    }
    return known;
  }

  // Solo se actualiza la disponibilidad: el titulo y el artista se fijan al
  // crear la cancion, para no pisar los que se corrigieron a mano.
  private async markVerified(song: Song, playable: boolean): Promise<Song> {
    const changes = { lastKnownPlayable: playable, verifiedAt: new Date() };
    await this.songRepository.update({ id: song.id }, changes);
    return Object.assign(song, changes);
  }

  // ON CONFLICT DO NOTHING: si dos clientes piden a la vez la misma cancion
  // nueva, la segunda insercion no falla y ambos leen la misma fila.
  private async saveNewSong(video: SearchResult): Promise<Song> {
    await this.songRepository
      .createQueryBuilder()
      .insert()
      .values({
        youtubeVideoId: video.youtubeVideoId,
        title: video.title,
        artistDisplay: video.artistDisplay,
        channelTitle: video.channelTitle,
        durationSeconds: video.durationSeconds,
        thumbnailUrl: video.thumbnailUrl,
        lastKnownPlayable: true,
        verifiedAt: new Date(),
      })
      .orIgnore()
      .execute();
    return this.songRepository.findOneByOrFail({
      youtubeVideoId: video.youtubeVideoId,
    });
  }
}
