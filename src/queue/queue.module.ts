import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DevicesModule } from '../devices/devices.module';
import { VenuesModule } from '../venues/venues.module';
import { SongRequestsController } from './song-requests.controller';
import { SongRequestsService } from './song-requests.service';

@Module({
  imports: [VenuesModule, CatalogModule, DevicesModule, ActivityModule],
  controllers: [SongRequestsController],
  providers: [SongRequestsService],
})
export class QueueModule {}
