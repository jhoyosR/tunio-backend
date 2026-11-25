import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DevicesModule } from '../devices/devices.module';
import { LiveUpdatesModule } from '../realtime/live-updates.module';
import { VenuesModule } from '../venues/venues.module';
import { LiveQueueController } from './live-queue.controller';
import { LiveQueueService } from './live-queue.service';
import { QueueMaintenanceController } from './queue-maintenance.controller';
import { QueueMaintenanceService } from './queue-maintenance.service';
import { SongRequestsController } from './song-requests.controller';
import { SongRequestsService } from './song-requests.service';

@Module({
  imports: [
    VenuesModule,
    CatalogModule,
    DevicesModule,
    ActivityModule,
    LiveUpdatesModule,
  ],
  controllers: [
    SongRequestsController,
    LiveQueueController,
    QueueMaintenanceController,
  ],
  providers: [SongRequestsService, LiveQueueService, QueueMaintenanceService],
  exports: [LiveQueueService],
})
export class QueueModule {}
