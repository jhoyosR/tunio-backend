import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

// Interruptor manual del QR. Aun encendido, entrar exige sesion abierta.
export class UpdateQrAccessDto {
  @ApiProperty()
  @IsBoolean()
  isEnabled: boolean;
}
