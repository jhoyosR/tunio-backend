import { SelectQueryBuilder } from 'typeorm';
import { paginate } from './paginate';

describe('paginate', () => {
  function buildQueryBuilder(items: unknown[], total: number) {
    return {
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([items, total]),
    } as unknown as SelectQueryBuilder<unknown>;
  }

  it('aplica skip/take segun page y limit', async () => {
    const queryBuilder = buildQueryBuilder([{ id: 1 }], 25);

    const result = await paginate(queryBuilder, 3, 10);

    expect(queryBuilder.skip).toHaveBeenCalledWith(20);
    expect(queryBuilder.take).toHaveBeenCalledWith(10);
    expect(result.meta).toEqual({
      totalItems: 25,
      itemsPerPage: 10,
      currentPage: 3,
      totalPages: 3,
    });
  });

  it('devuelve totalPages 1 cuando no hay resultados', async () => {
    const queryBuilder = buildQueryBuilder([], 0);

    const result = await paginate(queryBuilder, 1, 10);

    expect(result.items).toEqual([]);
    expect(result.meta.totalPages).toBe(1);
  });
});
