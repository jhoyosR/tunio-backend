import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, Matches } from 'class-validator';
import { YOUTUBE_VIDEO_ID } from '../../catalog/youtube-video-id';

export class RequestSongDto {
  // Igual que en el registro del dispositivo (BE-07): viaja en el cuerpo, que
  // el registro de peticiones nunca escribe, y solo se usa para calcular el hash.
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  installationId: string;

  @ApiProperty({ example: 'Nmb80HXWsFQ' })
  @Matches(YOUTUBE_VIDEO_ID, { message: 'youtubeVideoId is not valid' })
  youtubeVideoId: string;
}
