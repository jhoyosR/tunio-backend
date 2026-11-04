import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { DefaultPlaylistController } from './default-playlist.controller';
import { DefaultPlaylistService } from './default-playlist.service';
import { DefaultPlaylistTrack } from './entities/default-playlist-track.entity';
import { DefaultPlaylist } from './entities/default-playlist.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([DefaultPlaylist, DefaultPlaylistTrack]),
    CatalogModule,
  ],
  controllers: [DefaultPlaylistController],
  providers: [DefaultPlaylistService],
})
export class PlaylistsModule {}
