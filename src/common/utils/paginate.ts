import { SelectQueryBuilder } from 'typeorm';
import { Paginated } from '../interfaces/api-response.interface';

// Helper generico de paginacion offset-based, reutilizable por cualquier
// modulo: aplica skip/take sobre el query builder recibido y arma la metadata.
export async function paginate<T extends object>(
  queryBuilder: SelectQueryBuilder<T>,
  page: number,
  limit: number,
): Promise<Paginated<T>> {
  const [items, totalItems] = await queryBuilder
    .skip((page - 1) * limit)
    .take(limit)
    .getManyAndCount();

  return {
    items,
    meta: {
      totalItems,
      itemsPerPage: limit,
      currentPage: page,
      totalPages: Math.ceil(totalItems / limit) || 1,
    },
  };
}
