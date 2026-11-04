import { Module } from '@nestjs/common';
import { PlaybackModule } from '../playback/playback.module';
import { LiveUpdatesModule } from '../realtime/live-updates.module';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({
  imports: [PlaybackModule, LiveUpdatesModule],
  controllers: [ModerationController],
  providers: [ModerationService],
})
export class ModerationModule {}
