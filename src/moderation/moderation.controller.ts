import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentStaff } from '../auth/decorators/auth.decorators';
import type { AuthenticatedStaff } from '../auth/interfaces/authenticated-staff.interface';
import { BlockSongDto } from './dto/block-song.dto';
import {
  BlockDetails,
  BlockResult,
  ModerationService,
} from './moderation.service';

// Sin @Roles: bloquear y retirar son operacion de la noche, y los hacen
// tanto el DJ como el ADMIN desde el panel de operacion (WEB-06).
@ApiTags('Moderation')
@ApiBearerAuth()
@Controller('venues/:venueId')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('blocks')
  listActiveBlocks(@Param('venueId') venueId: string): Promise<BlockDetails[]> {
    return this.moderationService.listActiveBlocks(venueId);
  }

  @Post('blocks')
  blockSong(
    @Param('venueId') venueId: string,
    @CurrentStaff() staff: AuthenticatedStaff,
    @Body() dto: BlockSongDto,
  ): Promise<BlockResult> {
    return this.moderationService.blockSong(
      venueId,
      staff.staffId,
      dto.songId,
      dto.reason ?? null,
    );
  }

  // Levantar no borra la fila: lifted_at conserva el historial.
  @Post('blocks/:blockId/lift')
  @HttpCode(HttpStatus.OK)
  liftBlock(
    @Param('venueId') venueId: string,
    @Param('blockId', ParseUUIDPipe) blockId: string,
  ): Promise<BlockDetails> {
    return this.moderationService.liftBlock(venueId, blockId);
  }

  @Post('queue/items/:queueItemId/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeEntry(
    @Param('venueId') venueId: string,
    @Param('queueItemId', ParseUUIDPipe) queueItemId: string,
  ): Promise<void> {
    return this.moderationService.removeEntry(venueId, queueItemId);
  }
}
