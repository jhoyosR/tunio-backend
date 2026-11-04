import { Module } from '@nestjs/common';
import { ActivityEventsService } from './activity-events.service';
import { AdminActionsController } from './admin-actions.controller';
import { AdminActionsService } from './admin-actions.service';

@Module({
  controllers: [AdminActionsController],
  providers: [ActivityEventsService, AdminActionsService],
  exports: [ActivityEventsService, AdminActionsService],
})
export class ActivityModule {}
