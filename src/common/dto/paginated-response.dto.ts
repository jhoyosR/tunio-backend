import { ApiProperty } from '@nestjs/swagger';

// Describe la forma de metadata de paginacion para Swagger; los modulos concretos
// (ej. UserPaginatedResponseDto) extienden esto tipando `items` con su propio DTO.
export class PaginationMetaDto {
  @ApiProperty()
  totalItems: number;

  @ApiProperty()
  itemsPerPage: number;

  @ApiProperty()
  currentPage: number;

  @ApiProperty()
  totalPages: number;
}
