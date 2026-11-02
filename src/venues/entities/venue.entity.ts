import {
  Check,
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
@Check('venues_device_hash_salt_check', 'octet_length(device_hash_salt) = 32')
export class Venue {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'venues_pkey' })
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  slug: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  // Sal del hash de dispositivo, aleatoria y fija por local. select: false
  // para que no viaje en ninguna consulta que no la pida expresamente.
  @Column({
    name: 'device_hash_salt',
    type: 'bytea',
    default: () => 'gen_random_bytes(32)',
    select: false,
  })
  deviceHashSalt: Buffer;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
