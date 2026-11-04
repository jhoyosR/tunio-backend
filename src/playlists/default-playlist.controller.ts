import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/auth.decorators';
import {
  DefaultPlaylistService,
  PlaylistDetails,
  PlaylistTrack,
} from './default-playlist.service';
import { AddTrackDto } from './dto/add-track.dto';

@ApiTags('Default playlist')
@ApiBearerAuth()
@Controller('venues/:venueId/playlist')
export class DefaultPlaylistController {
  constructor(private readonly playlistService: DefaultPlaylistService) {}

  // Cualquier rol: el DJ tambien necesita saber que suena cuando la cola se vacia.
  @Get()
  getPlaylist(@Param('venueId') venueId: string): Promise<PlaylistDetails> {
    return this.playlistService.getPlaylist(venueId);
  }

  // Editar la lista es del panel de administracion (WEB-07).
  @Roles('ADMIN')
  @Post('tracks')
  addTrack(
    @Param('venueId') venueId: string,
    @Body() dto: AddTrackDto,
  ): Promise<PlaylistTrack> {
    return this.playlistService.addTrack(venueId, dto.youtubeVideoId);
  }

  @Roles('ADMIN')
  @Delete('tracks/:trackId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTrack(
    @Param('venueId') venueId: string,
    @Param('trackId', ParseUUIDPipe) trackId: string,
  ): Promise<void> {
    return this.playlistService.removeTrack(venueId, trackId);
  }
}
