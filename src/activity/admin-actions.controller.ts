import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Paginated } from '../common/interfaces/api-response.interface';
import { AdminActionEntry, AdminActionsService } from './admin-actions.service';
import { AdminActionsQueryDto } from './dto/admin-actions-query.dto';

// Sin @Roles: la bitacora esta en el panel de operacion (WEB-11) y es la
// evidencia de que el bloqueo y el salto del DJ quedan registrados.
@ApiTags('Admin actions')
@ApiBearerAuth()
@Controller('venues/:venueId/admin-actions')
export class AdminActionsController {
  constructor(private readonly adminActionsService: AdminActionsService) {}

  @Get()
  list(
    @Param('venueId') venueId: string,
    @Query() query: AdminActionsQueryDto,
  ): Promise<Paginated<AdminActionEntry>> {
    return this.adminActionsService.list(venueId, query);
  }
}
