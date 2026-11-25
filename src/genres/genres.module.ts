import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { GenresController } from './genres.controller';
import { GenresService } from './genres.service';

@Module({
  imports: [ActivityModule],
  controllers: [GenresController],
  providers: [GenresService],
  // BE-22 toma de aqui la cobertura, para no definirla dos veces.
  exports: [GenresService],
})
export class GenresModule {}
