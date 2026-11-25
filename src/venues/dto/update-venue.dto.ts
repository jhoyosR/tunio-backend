import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const VENUE_NAME_MAX_LENGTH = 100;

// Solo el nombre es editable (decision 21): sin zona horaria ni horarios.
export class UpdateVenueDto {
  @ApiProperty({ example: 'Bar La Esquina' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(VENUE_NAME_MAX_LENGTH)
  name: string;
}
