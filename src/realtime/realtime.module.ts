import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DevicesModule } from '../devices/devices.module';
import { QueueModule } from '../queue/queue.module';
import { VenueStaff } from '../staff/entities/venue-staff.entity';
import { VenuesModule } from '../venues/venues.module';
import { LiveQueueGateway } from './live-queue.gateway';
import { LiveUpdatesModule } from './live-updates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VenueStaff]),
    AuthModule,
    VenuesModule,
    DevicesModule,
    QueueModule,
    LiveUpdatesModule,
  ],
  providers: [LiveQueueGateway],
})
export class RealtimeModule {}
