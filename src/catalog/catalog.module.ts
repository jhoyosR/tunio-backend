import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VenuesModule } from '../venues/venues.module';
import { YoutubeSearchCache } from './entities/youtube-search-cache.entity';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { YoutubeClient } from './youtube.client';
import { YoutubeQuotaService } from './youtube-quota.service';

@Module({
  imports: [TypeOrmModule.forFeature([YoutubeSearchCache]), VenuesModule],
  controllers: [SearchController],
  providers: [SearchService, YoutubeClient, YoutubeQuotaService],
})
export class CatalogModule {}
