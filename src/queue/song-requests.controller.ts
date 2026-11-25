import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/auth.decorators';
import { RequestSongDto } from './dto/request-song.dto';
import { RequestResult, SongRequestsService } from './song-requests.service';

@ApiTags('Queue')
@Controller()
export class SongRequestsController {
  constructor(private readonly songRequestsService: SongRequestsService) {}

  // Un unico extremo para pedir y votar: la app no sabe si la cancion ya
  // esta en la cola en el instante exacto en que se procesa. La respuesta
  // dice cual de las dos cosas paso.
  @Public()
  @Post('qr/:token/requests')
  @HttpCode(HttpStatus.OK)
  requestOrVote(
    @Param('token', ParseUUIDPipe) token: string,
    @Body() dto: RequestSongDto,
  ): Promise<RequestResult> {
    return this.songRequestsService.requestOrVote(
      token,
      dto.installationId,
      dto.youtubeVideoId,
    );
  }
}
