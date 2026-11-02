import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import {
  MAX_QUERY_LENGTH,
  MIN_QUERY_LENGTH,
  normalizeQuery,
} from '../search-query';

export class SearchQueryDto {
  // El minimo se mide sobre la consulta ya normalizada: "  a " no llega a 3
  // caracteres aunque el texto enviado si.
  @ApiProperty({ example: 'bad bunny', minLength: MIN_QUERY_LENGTH })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeQuery(value) : value,
  )
  @IsString()
  @MinLength(MIN_QUERY_LENGTH)
  @MaxLength(MAX_QUERY_LENGTH)
  q: string;
}
