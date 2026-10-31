import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { Venue } from '../../venues/entities/venue.entity';

// Una sola lista por establecimiento.
@Entity({ name: 'default_playlists', schema: TUNIO_SCHEMA })
@Unique('default_playlists_venue_id_key', ['venueId'])
@Unique('default_playlists_id_venue_id_key', ['id', 'venueId'])
export class DefaultPlaylist {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'default_playlists_pkey',
  })
  id: string;

  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @Column({ type: 'text' })
  name: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Venue)
  @JoinColumn({
    name: 'venue_id',
    foreignKeyConstraintName: 'default_playlists_venue_id_fkey',
  })
  venue: Venue;
}
