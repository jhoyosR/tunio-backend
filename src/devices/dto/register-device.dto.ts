import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RegisterDeviceDto {
  // UUID aleatorio que la app genera una vez al instalarse (MOV-02). Viaja
  // en el cuerpo, que el registro de peticiones nunca escribe, y se descarta
  // nada mas calcular su hash. Los mensajes de validacion no repiten el valor.
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  installationId: string;
}
