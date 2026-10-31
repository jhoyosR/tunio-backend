import {
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { Venue } from './venue.entity';

// El QR impreso codifica publicToken en texto plano (no una URL).
// isEnabled es el interruptor manual; el acceso ademas exige sesion abierta.
@Entity({ name: 'qr_access', schema: TUNIO_SCHEMA })
@Unique('qr_access_venue_id_key', ['venueId'])
@Unique('qr_access_public_token_key', ['publicToken'])
export class QrAccess {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'qr_access_pkey',
  })
  id: string;

  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @Column({ name: 'public_token', type: 'uuid' })
  @Generated('uuid')
  publicToken: string;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Venue)
  @JoinColumn({
    name: 'venue_id',
    foreignKeyConstraintName: 'qr_access_venue_id_fkey',
  })
  venue: Venue;
}
