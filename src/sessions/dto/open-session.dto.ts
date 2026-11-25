import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const EVENT_NAME_MAX_LENGTH = 100;

export class OpenSessionDto {
  // Etiqueta libre de la noche. Un texto en blanco cuenta como ausente.
  @ApiPropertyOptional({ example: 'Viernes crossover' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(EVENT_NAME_MAX_LENGTH)
  eventName?: string;
}
