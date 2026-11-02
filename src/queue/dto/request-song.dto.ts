import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, Matches } from 'class-validator';

// Los ids de video de YouTube tienen 11 caracteres de este alfabeto.
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

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
