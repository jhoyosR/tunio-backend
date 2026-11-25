import { IntersectionType } from '@nestjs/swagger';
import { CalendarRangeQueryDto } from '../../common/dto/calendar-range-query.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class UnclassifiedSongsQueryDto extends IntersectionType(
  PaginationQueryDto,
  CalendarRangeQueryDto,
) {}
