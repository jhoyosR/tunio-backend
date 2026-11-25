import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { YOUTUBE_VIDEO_ID } from '../../catalog/youtube-video-id';

// La cancion se elige entre los resultados de GET /venues/:venueId/search,
// que identifican cada video por su id de YouTube.
export class AddTrackDto {
  @ApiProperty({ example: 'Nmb80HXWsFQ' })
  @Matches(YOUTUBE_VIDEO_ID, { message: 'youtubeVideoId is not valid' })
  youtubeVideoId: string;
}
