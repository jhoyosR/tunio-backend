import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CalendarRangeQueryDto } from '../../common/dto/calendar-range-query.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Una sesion (RF-09) o un periodo, no las dos cosas: lo comprueba el
// servicio. Sin ninguno, toda la historia del local.
export class AnalyticsFilterDto extends CalendarRangeQueryDto {
  @ApiPropertyOptional({ example: '0b6f0c1e-5d7a-4c1b-9a51-0f4f1b2c3d4e' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}

export class AnalyticsPageQueryDto extends IntersectionType(
  AnalyticsFilterDto,
  PaginationQueryDto,
) {}
