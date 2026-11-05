import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentStaff, Roles } from '../auth/decorators/auth.decorators';
import type { AuthenticatedStaff } from '../auth/interfaces/authenticated-staff.interface';
import { Paginated } from '../common/interfaces/api-response.interface';
import {
  GenrePeriodQueryDto,
  UnclassifiedSongsQueryDto,
} from './dto/genre-period-query.dto';
import { SetGenreDto } from './dto/set-genre.dto';
import {
  GenreCoverage,
  GenreOption,
  GenresService,
  SongGenre,
  UnclassifiedSong,
} from './genres.service';

// Clasificar es del panel de administracion (WEB-12), no de la operacion de
// la noche.
@ApiTags('Genres')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('venues/:venueId')
export class GenresController {
  constructor(private readonly genresService: GenresService) {}

  @Get('genres')
  listGenres(): GenreOption[] {
    return this.genresService.listGenres();
  }

  @Get('genres/unclassified-songs')
  listUnclassified(
    @Param('venueId') venueId: string,
    @Query() query: UnclassifiedSongsQueryDto,
  ): Promise<Paginated<UnclassifiedSong>> {
    return this.genresService.listUnclassified(venueId, query);
  }

  @Get('genres/coverage')
  getCoverage(
    @Param('venueId') venueId: string,
    @Query() query: GenrePeriodQueryDto,
  ): Promise<GenreCoverage> {
    return this.genresService.getCoverage(venueId, query);
  }

  // Asignar y cambiar son la misma operacion: el genero se reemplaza entero.
  @Put('songs/:songId/genre')
  setGenre(
    @Param('venueId') venueId: string,
    @Param('songId', ParseUUIDPipe) songId: string,
    @CurrentStaff() staff: AuthenticatedStaff,
    @Body() dto: SetGenreDto,
  ): Promise<SongGenre> {
    return this.genresService.setGenre(
      venueId,
      staff.staffId,
      songId,
      dto.genre,
    );
  }
}
