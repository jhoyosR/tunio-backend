import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/auth.decorators';
import { Paginated } from '../common/interfaces/api-response.interface';
import {
  AnalyticsService,
  AnalyticsSummary,
  GenreDistribution,
  HourlyParticipation,
  NightComparison,
  PlaybackHistoryEntry,
  SessionParticipation,
  SongPopularity,
  UnplayedRequests,
  VoteConcentration,
} from './analytics.service';
import {
  AnalyticsFilterDto,
  AnalyticsPageQueryDto,
} from './dto/analytics-filter.dto';

// El tablero es del menu de administracion (WEB-02). Las definiciones de
// cada cifra estan en docs/08.
@ApiTags('Analytics')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('venues/:venueId/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // Tambien el DJ: son los indicadores de la noche del panel de operacion
  // (WEB-06).
  @Roles('ADMIN', 'DJ')
  @Get('summary')
  getSummary(
    @Param('venueId') venueId: string,
    @Query() filter: AnalyticsFilterDto,
  ): Promise<AnalyticsSummary> {
    return this.analyticsService.getSummary(venueId, filter);
  }

  @Get('popularity')
  getPopularity(
    @Param('venueId') venueId: string,
    @Query() query: AnalyticsPageQueryDto,
  ): Promise<Paginated<SongPopularity>> {
    return this.analyticsService.getPopularity(venueId, query);
  }

  @Get('hourly-participation')
  getHourlyParticipation(
    @Param('venueId') venueId: string,
    @Query() filter: AnalyticsFilterDto,
  ): Promise<HourlyParticipation[]> {
    return this.analyticsService.getHourlyParticipation(venueId, filter);
  }

  @Get('playbacks')
  getPlaybacks(
    @Param('venueId') venueId: string,
    @Query() query: AnalyticsPageQueryDto,
  ): Promise<Paginated<PlaybackHistoryEntry>> {
    return this.analyticsService.getPlaybacks(venueId, query);
  }

  @Get('genres')
  getGenreDistribution(
    @Param('venueId') venueId: string,
    @Query() filter: AnalyticsFilterDto,
  ): Promise<GenreDistribution> {
    return this.analyticsService.getGenreDistribution(venueId, filter);
  }

  @Get('unplayed-requests')
  getUnplayedRequests(
    @Param('venueId') venueId: string,
    @Query() query: AnalyticsPageQueryDto,
  ): Promise<UnplayedRequests> {
    return this.analyticsService.getUnplayedRequests(venueId, query);
  }

  @Get('vote-concentration')
  getVoteConcentration(
    @Param('venueId') venueId: string,
    @Query() filter: AnalyticsFilterDto,
  ): Promise<VoteConcentration[]> {
    return this.analyticsService.getVoteConcentration(venueId, filter);
  }

  @Get('low-participation')
  getLowParticipation(
    @Param('venueId') venueId: string,
    @Query() filter: AnalyticsFilterDto,
  ): Promise<SessionParticipation[]> {
    return this.analyticsService.getLowParticipation(venueId, filter);
  }

  @Get('night-comparison')
  getNightComparison(
    @Param('venueId') venueId: string,
    @Query() filter: AnalyticsFilterDto,
  ): Promise<NightComparison[]> {
    return this.analyticsService.getNightComparison(venueId, filter);
  }
}
