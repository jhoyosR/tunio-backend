import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/auth.decorators';
import {
  ClearQueueResult,
  QueueMaintenanceService,
} from './queue-maintenance.service';

@ApiTags('Queue')
@ApiBearerAuth()
@Controller('venues/:venueId/queue')
export class QueueMaintenanceController {
  constructor(private readonly maintenanceService: QueueMaintenanceService) {}

  // El boton «Limpiar cola ahora» de la configuracion (WEB-08), que es del
  // panel de administracion.
  @Roles('ADMIN')
  @Post('clear')
  @HttpCode(HttpStatus.OK)
  clearQueue(@Param('venueId') venueId: string): Promise<ClearQueueResult> {
    return this.maintenanceService.clearQueue(venueId);
  }
}
