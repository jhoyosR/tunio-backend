import { Module } from '@nestjs/common';
import { VenuesModule } from '../venues/venues.module';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [VenuesModule],
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
