import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { GenresController } from './genres.controller';
import { GenresService } from './genres.service';

@Module({
  imports: [ActivityModule],
  controllers: [GenresController],
  providers: [GenresService],
})
export class GenresModule {}
