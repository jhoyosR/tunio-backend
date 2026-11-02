import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/auth.decorators';
import { QrAccessService } from '../venues/qr-access.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchResponse, SearchService } from './search.service';

// Una busqueda por consulta enviada: la app busca al pulsar Enter, nunca
// mientras se escribe (no hay autocompletado, para proteger la cuota).
@ApiTags('Search')
@Controller()
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly qrAccessService: QrAccessService,
  ) {}

  // Cliente de la app. Exige un QR valido y activo de un local activo, para
  // que nadie ajeno a un local pueda gastar la cuota compartida.
  @Public()
  @Get('qr/:token/search')
  async searchFromQr(
    @Param('token', ParseUUIDPipe) token: string,
    @Query() dto: SearchQueryDto,
  ): Promise<SearchResponse> {
    await this.qrAccessService.resolveToken(token);
    return this.searchService.search(dto.q);
  }

  // Personal del local, p. ej. para anadir canciones a la lista por defecto.
  @ApiBearerAuth()
  @Get('venues/:venueId/search')
  searchFromVenue(@Query() dto: SearchQueryDto): Promise<SearchResponse> {
    return this.searchService.search(dto.q);
  }
}
