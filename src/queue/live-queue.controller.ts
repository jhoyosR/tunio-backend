import {
  Controller,
  createParamDecorator,
  ExecutionContext,
  Get,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../auth/decorators/auth.decorators';
import { LiveQueue, LiveQueueService } from './live-queue.service';

// En una lectura no hay cuerpo, asi que el UUID de instalacion viaja en una
// cabecera: como el cuerpo, el registro de peticiones nunca la escribe, y a
// diferencia de la URL no queda en historiales ni registros de proxies.
const INSTALLATION_ID_HEADER = 'x-installation-id';

// @Headers() no admite tuberias; un decorador propio si, y asi la cabecera
// se valida como UUID igual que el installationId del cuerpo.
const InstallationIdHeader = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined =>
    context.switchToHttp().getRequest<Request>().header(INSTALLATION_ID_HEADER),
);

@ApiTags('Queue')
@Controller()
export class LiveQueueController {
  constructor(private readonly liveQueueService: LiveQueueService) {}

  @Public()
  @Get('qr/:token/queue')
  @ApiHeader({
    name: INSTALLATION_ID_HEADER,
    required: false,
    description: 'UUID de instalación; marca las entradas ya votadas',
  })
  getClientQueue(
    @Param('token', ParseUUIDPipe) token: string,
    @InstallationIdHeader(new ParseUUIDPipe({ optional: true }))
    installationId?: string,
  ): Promise<LiveQueue> {
    return this.liveQueueService.getForClient(token, installationId ?? null);
  }

  // Sin @Roles: el DJ y el ADMIN operan la cola de la noche (WEB-06).
  @ApiBearerAuth()
  @Get('venues/:venueId/queue')
  getStaffQueue(@Param('venueId') venueId: string): Promise<LiveQueue> {
    return this.liveQueueService.getForStaff(venueId);
  }
}
