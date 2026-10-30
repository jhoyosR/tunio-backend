import { Permission } from './entities/permission.entity';
import { PermissionResponseDto } from './dto/permission-response.dto';

// Unico punto de conversion Permission -> DTO: "name" (permission.description)
// es el texto en espanol para la UI; "code" (permission.name) es el slug tecnico
// que siguen usando @RequirePermissions() y el catalogo de seeders sin cambios.
export function toPermissionResponseDto(
  permission: Permission,
): PermissionResponseDto {
  return {
    id: permission.id,
    name: permission.description ?? permission.name,
    code: permission.name,
  };
}
