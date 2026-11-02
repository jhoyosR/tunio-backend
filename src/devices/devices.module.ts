import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { VenuesModule } from '../venues/venues.module';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [VenuesModule, ActivityModule],
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
