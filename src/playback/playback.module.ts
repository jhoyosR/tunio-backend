import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { LiveUpdatesModule } from '../realtime/live-updates.module';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
  imports: [ActivityModule, LiveUpdatesModule],
  controllers: [PlayerController],
  providers: [PlayerService],
  exports: [PlayerService],
})
export class PlaybackModule {}
