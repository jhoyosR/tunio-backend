import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { Venue } from '../../venues/entities/venue.entity';

// deviceHash = SHA-256(uuid_de_instalacion || sal_del_establecimiento).
// El UUID en claro nunca se guarda ni aparece en los registros del servidor.
@Entity({ name: 'anonymous_devices', schema: TUNIO_SCHEMA })
@Unique('anonymous_devices_venue_id_device_hash_key', ['venueId', 'deviceHash'])
// Soporte para las claves compuestas que atan el dispositivo a su local.
@Unique('anonymous_devices_id_venue_id_key', ['id', 'venueId'])
@Check('anonymous_devices_device_hash_check', `device_hash ~ '^[0-9a-f]{64}$'`)
export class AnonymousDevice {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'anonymous_devices_pkey',
  })
  id: string;

  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @Column({ name: 'device_hash', type: 'char', length: 64 })
  deviceHash: string;

  @Column({
    name: 'first_seen_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  firstSeenAt: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'now()' })
  lastSeenAt: Date;

  @ManyToOne(() => Venue)
  @JoinColumn({
    name: 'venue_id',
    foreignKeyConstraintName: 'anonymous_devices_venue_id_fkey',
  })
  venue: Venue;
}
