import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { GENRE_CODES } from '../genres';
import type { Genre } from '../genres';

export class SetGenreDto {
  @ApiProperty({ enum: GENRE_CODES, example: 'SALSA' })
  @IsIn(GENRE_CODES, { message: 'genre must be one of the listed genres' })
  genre: Genre;
}
