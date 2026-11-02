import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VenuesModule } from '../venues/venues.module';
import { Song } from './entities/song.entity';
import { YoutubeSearchCache } from './entities/youtube-search-cache.entity';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SongsService } from './songs.service';
import { YoutubeClient } from './youtube.client';
import { YoutubeQuotaService } from './youtube-quota.service';

@Module({
  imports: [TypeOrmModule.forFeature([YoutubeSearchCache, Song]), VenuesModule],
  controllers: [SearchController],
  providers: [SearchService, SongsService, YoutubeClient, YoutubeQuotaService],
  // BE-12 verifica la cancion antes de encolarla.
  exports: [SongsService],
})
export class CatalogModule {}
