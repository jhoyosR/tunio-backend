import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MusicSession } from '../sessions/entities/music-session.entity';
import { QrAccess } from './entities/qr-access.entity';
import { Venue } from './entities/venue.entity';
import { QrAccessController } from './qr-access.controller';
import { QrAccessService } from './qr-access.service';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';

@Module({
  imports: [TypeOrmModule.forFeature([Venue, QrAccess, MusicSession])],
  controllers: [VenuesController, QrAccessController],
  providers: [VenuesService, QrAccessService],
})
export class VenuesModule {}
