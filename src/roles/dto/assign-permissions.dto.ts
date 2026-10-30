import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class AssignPermissionsDto {
  @ApiProperty({
    type: [String],
    description: 'Lista completa de IDs de permisos que tendra el rol',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds: string[];
}
