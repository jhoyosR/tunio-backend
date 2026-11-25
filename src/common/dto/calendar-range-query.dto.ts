import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, Matches } from 'class-validator';

// Solo el dia: la hora la pone el servidor con la zona horaria del sistema.
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Rango de dias inclusivo; cualquiera de los dos extremos puede faltar.
export class CalendarRangeQueryDto {
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
