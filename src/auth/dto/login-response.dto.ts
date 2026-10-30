import { ApiProperty } from '@nestjs/swagger';

// code = slug tecnico ('users.create'), name = lenguaje natural ('Crear usuarios').
// El frontend deberia comparar por "code" en su logica y usar "name" solo para mostrar.
class PermissionSummaryDto {
  @ApiProperty({ example: 'users.create' })
  code: string;

  @ApiProperty({ example: 'Crear usuarios' })
  name: string;
}

class AuthenticatedUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ type: [String] })
  roles: string[];

  @ApiProperty({ type: [PermissionSummaryDto] })
  permissions: PermissionSummaryDto[];
}

// Incluye roles y permisos ya resueltos junto al token para que el frontend
// pueda renderizar condicionalmente sin hacer una segunda peticion.
export class LoginResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ type: AuthenticatedUserDto })
  user: AuthenticatedUserDto;
}
