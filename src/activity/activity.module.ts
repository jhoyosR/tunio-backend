import { Module } from '@nestjs/common';
import { ActivityEventsService } from './activity-events.service';

@Module({
  providers: [ActivityEventsService],
  exports: [ActivityEventsService],
})
export class ActivityModule {}
