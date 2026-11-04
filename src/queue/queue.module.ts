import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DevicesModule } from '../devices/devices.module';
import { SessionsModule } from '../sessions/sessions.module';
import { VenuesModule } from '../venues/venues.module';
import { LiveQueueController } from './live-queue.controller';
import { LiveQueueService } from './live-queue.service';
import { SongRequestsController } from './song-requests.controller';
import { SongRequestsService } from './song-requests.service';

@Module({
  imports: [
    VenuesModule,
    SessionsModule,
    CatalogModule,
    DevicesModule,
    ActivityModule,
  ],
  controllers: [SongRequestsController, LiveQueueController],
  providers: [SongRequestsService, LiveQueueService],
})
export class QueueModule {}
