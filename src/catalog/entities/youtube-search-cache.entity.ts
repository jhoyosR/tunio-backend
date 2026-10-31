import {
  Check,
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';

// Cache de busquedas. Sin ella, la cuota diaria da para ~100 busquedas en
// todo el sistema (search.list cuesta 100 de 10.000 unidades diarias).
@Entity({ name: 'youtube_search_cache', schema: TUNIO_SCHEMA })
@Unique('youtube_search_cache_query_normalized_key', ['queryNormalized'])
@Check('youtube_search_cache_check', 'expires_at > fetched_at')
@Index('idx_search_cache_expiry', ['expiresAt'])
export class YoutubeSearchCache {
  // BIGINT llega como texto desde node-postgres.
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'youtube_search_cache_pkey',
  })
  id: string;

  // Minusculas, sin tildes, sin espacios dobles.
  @Column({ name: 'query_normalized', type: 'text' })
  queryNormalized: string;

  // Lista de resultados ya normalizados.
  @Column({ type: 'jsonb' })
  results: unknown;

  @Column({ name: 'fetched_at', type: 'timestamptz', default: () => 'now()' })
  fetchedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'hit_count', type: 'integer', default: 0 })
  hitCount: number;
}
