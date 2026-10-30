import { ApiProperty } from '@nestjs/swagger';

export class PermissionResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({
    example: 'Crear usuarios',
    description: 'Nombre en lenguaje natural, para mostrar en la UI',
  })
  name: string;

  @ApiProperty({
    example: 'users.create',
    description:
      'Identificador tecnico estable (slug). Usalo para chequeos programaticos de permisos en el frontend en vez de comparar por "name", que puede cambiar de redaccion.',
  })
  code: string;
}
