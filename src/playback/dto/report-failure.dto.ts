import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const MAX_ERROR_MESSAGE_LENGTH = 500;

// Lo que el reproductor sabe del fallo, p. ej. el codigo de error de YouTube.
// Se guarda en playbacks.error_message para diagnosticar despues.
export class ReportFailureDto {
  @ApiPropertyOptional({
    example: 'YouTube error 150',
    maxLength: MAX_ERROR_MESSAGE_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ERROR_MESSAGE_LENGTH)
  errorMessage?: string;
}
