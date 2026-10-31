import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';

// Establecimiento: unidad de aislamiento. Sin zona horaria propia: el
// sistema usa una fija (TUNIO_TIMEZONE).
@Entity({ name: 'venues', schema: TUNIO_SCHEMA })
@Unique('venues_slug_key', ['slug'])
export class Venue {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'venues_pkey' })
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  slug: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
