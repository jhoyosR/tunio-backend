import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentStaff } from '../auth/decorators/auth.decorators';
import type { AuthenticatedStaff } from '../auth/interfaces/authenticated-staff.interface';
import { PlayerService, PlayerTrack } from './player.service';

// El reproductor de la pantalla del bar actua con el token del personal que
// la abrio (docs/00, decision 13): el token del QR esta impreso en el local.
// Sin @Roles: el DJ y el ADMIN operan la noche.
@ApiTags('Player')
@ApiBearerAuth()
@Controller('venues/:venueId/player')
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  // 200 y no 201: casi siempre devuelve lo que ya sonaba. null = silencio.
  @Post('next')
  @HttpCode(HttpStatus.OK)
  next(
    @Param('venueId') venueId: string,
    @CurrentStaff() staff: AuthenticatedStaff,
  ): Promise<PlayerTrack | null> {
    return this.playerService.next(venueId, staff.staffId);
  }
}
