import {
  Check,
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';

// Presupuesto diario de cuota: el servidor suma el coste de cada llamada y,
// al llegar al tope, sirve solo desde cache.
@Entity({ name: 'youtube_quota_usage', schema: TUNIO_SCHEMA })
@Check('youtube_quota_usage_units_consumed_check', 'units_consumed >= 0')
export class YoutubeQuotaUsage {
  // Fecha en formato YYYY-MM-DD.
  @PrimaryColumn({
    name: 'usage_date',
    type: 'date',
    primaryKeyConstraintName: 'youtube_quota_usage_pkey',
  })
  usageDate: string;

  @Column({ name: 'units_consumed', type: 'integer', default: 0 })
  unitsConsumed: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
