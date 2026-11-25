import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const REASON_MAX_LENGTH = 200;

// La cancion se elige en la cola en vivo o en lo que suena, que la
// identifican por su songId del catalogo.
export class BlockSongDto {
  @ApiProperty({ example: '0b6f0c1e-5d7a-4c1b-9a51-0f4f1b2c3d4e' })
  @IsUUID()
  songId: string;

  // Si lo hay, el cliente que intente pedirla lo recibe. Un texto en blanco
  // cuenta como ausente.
  @ApiPropertyOptional({
    example: 'Letra ofensiva',
    maxLength: REASON_MAX_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(REASON_MAX_LENGTH)
  reason?: string;
}
