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
import { OpenSessionDto } from './dto/open-session.dto';
import { SessionDetails, SessionsService } from './sessions.service';

// Sin @Roles: abrir, pausar y cerrar es operacion de la noche, y la hacen
// tanto el DJ como el ADMIN (WEB-06).
@ApiTags('Sessions')
@ApiBearerAuth()
@Controller('venues/:venueId/sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  // null si el servicio esta cerrado: no es un error.
  @Get('current')
  getOpenSession(
    @Param('venueId') venueId: string,
  ): Promise<SessionDetails | null> {
    return this.sessionsService.getOpenSession(venueId);
  }

  @Post()
  openSession(
    @Param('venueId') venueId: string,
    @CurrentStaff() staff: AuthenticatedStaff,
    @Body() dto: OpenSessionDto,
  ): Promise<SessionDetails> {
    return this.sessionsService.openSession(
      venueId,
      staff.staffId,
      dto.eventName ?? null,
    );
  }

  @Post(':sessionId/pause')
  @HttpCode(HttpStatus.OK)
  pauseSession(
    @Param('venueId') venueId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentStaff() staff: AuthenticatedStaff,
  ): Promise<SessionDetails> {
    return this.sessionsService.pauseSession(venueId, sessionId, staff.staffId);
  }

  @Post(':sessionId/resume')
  @HttpCode(HttpStatus.OK)
  resumeSession(
    @Param('venueId') venueId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentStaff() staff: AuthenticatedStaff,
  ): Promise<SessionDetails> {
    return this.sessionsService.resumeSession(
      venueId,
      sessionId,
      staff.staffId,
    );
  }

  @Post(':sessionId/close')
  @HttpCode(HttpStatus.OK)
  closeSession(
    @Param('venueId') venueId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentStaff() staff: AuthenticatedStaff,
  ): Promise<SessionDetails> {
    return this.sessionsService.closeSession(venueId, sessionId, staff.staffId);
  }
}
