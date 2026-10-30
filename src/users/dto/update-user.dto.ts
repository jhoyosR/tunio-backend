import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

// Update no permite cambiar password aqui: eso vive en el flujo de reset password.
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {
  @ApiPropertyOptional({ description: 'Activa o desactiva al usuario' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
