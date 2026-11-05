import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsISO8601, IsOptional, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Solo el dia: la hora la pone el servidor con la zona horaria del sistema.
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Periodo de solicitudes: rango de dias inclusivo, y cualquiera de los dos
// extremos puede faltar. Mismas reglas que la bitacora (BE-20).
export class GenrePeriodQueryDto {
  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Matches(CALENDAR_DAY, { message: 'from must be a date (YYYY-MM-DD)' })
  @IsISO8601({ strict: true }, { message: 'from must be a date (YYYY-MM-DD)' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-04' })
  @IsOptional()
  @Matches(CALENDAR_DAY, { message: 'to must be a date (YYYY-MM-DD)' })
  @IsISO8601({ strict: true }, { message: 'to must be a date (YYYY-MM-DD)' })
  to?: string;
}

export class UnclassifiedSongsQueryDto extends IntersectionType(
  PaginationQueryDto,
  GenrePeriodQueryDto,
) {}
