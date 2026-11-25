import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentStaff } from '../auth/decorators/auth.decorators';
import type { AuthenticatedStaff } from '../auth/interfaces/authenticated-staff.interface';
import { ReportFailureDto } from './dto/report-failure.dto';
import { PlayerService, PlayerTrack } from './player.service';

// El reproductor de la pantalla del bar actua con el token del personal que
// la abrio (docs/00, decision 13): el token del QR esta impreso en el local.
// Sin @Roles: el DJ y el ADMIN operan la noche, y los dos pueden saltar.
// Todas responden 200 con lo que suena despues: null = silencio.
@ApiTags('Player')
@ApiBearerAuth()
@Controller('venues/:venueId/player')
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  // 200 y no 201: casi siempre devuelve lo que ya sonaba.
  @Post('next')
  @HttpCode(HttpStatus.OK)
  next(
    @Param('venueId') venueId: string,
    @CurrentStaff() staff: AuthenticatedStaff,
  ): Promise<PlayerTrack | null> {
    return this.playerService.next(venueId, staff.staffId);
  }

  @Post('playbacks/:playbackId/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @Param('venueId') venueId: string,
    @Param('playbackId', ParseUUIDPipe) playbackId: string,
    @CurrentStaff() staff: AuthenticatedStaff,
  ): Promise<PlayerTrack | null> {
    return this.playerService.finish(venueId, playbackId, 'COMPLETED', {
      staffUserId: staff.staffId,
    });
  }

  // El salto manual del panel de operacion (WEB-06).
  @Post('playbacks/:playbackId/skip')
  @HttpCode(HttpStatus.OK)
  skip(
    @Param('venueId') venueId: string,
    @Param('playbackId', ParseUUIDPipe) playbackId: string,
    @CurrentStaff() staff: AuthenticatedStaff,
  ): Promise<PlayerTrack | null> {
    return this.playerService.finish(venueId, playbackId, 'SKIPPED', {
      staffUserId: staff.staffId,
    });
  }

  // El reproductor de YouTube dice que el video no existe o no se puede
  // embeber (RF-06): se marca, se registra y suena la siguiente.
  @Post('playbacks/:playbackId/unavailable')
  @HttpCode(HttpStatus.OK)
  reportUnavailable(
    @Param('venueId') venueId: string,
    @Param('playbackId', ParseUUIDPipe) playbackId: string,
    @CurrentStaff() staff: AuthenticatedStaff,
    @Body() dto: ReportFailureDto,
  ): Promise<PlayerTrack | null> {
    return this.playerService.finish(venueId, playbackId, 'UNAVAILABLE', {
      staffUserId: staff.staffId,
      errorMessage: dto.errorMessage,
    });
  }

  @Post('playbacks/:playbackId/error')
  @HttpCode(HttpStatus.OK)
  reportError(
    @Param('venueId') venueId: string,
    @Param('playbackId', ParseUUIDPipe) playbackId: string,
    @CurrentStaff() staff: AuthenticatedStaff,
    @Body() dto: ReportFailureDto,
  ): Promise<PlayerTrack | null> {
    return this.playerService.finish(venueId, playbackId, 'ERROR', {
      staffUserId: staff.staffId,
      errorMessage: dto.errorMessage,
    });
  }
}
