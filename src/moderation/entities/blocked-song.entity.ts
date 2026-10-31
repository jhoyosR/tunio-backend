import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { Song } from '../../catalog/entities/song.entity';
import { VenueStaff } from '../../staff/entities/venue-staff.entity';

// Todo bloqueo es temporal: expiresAt es obligatorio. liftedAt marca el
// levantamiento y conserva el historial.
@Entity({ name: 'blocked_songs', schema: TUNIO_SCHEMA })
@Check('blocked_songs_check', 'expires_at > blocked_at')
@Check('blocked_songs_check1', 'lifted_at IS NULL OR lifted_at >= blocked_at')
// Un solo bloqueo abierto por cancion y local. El indice no puede filtrar por
// now() (no es inmutable): antes de crear un bloqueo nuevo, el servicio cierra
// el anterior ya vencido poniendo lifted_at = expires_at.
@Index('uq_one_open_block_per_song', ['venueId', 'songId'], {
  unique: true,
  where: 'lifted_at IS NULL',
})
@Index('idx_blocked_lookup', ['venueId', 'songId', 'expiresAt'])
export class BlockedSong {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'blocked_songs_pkey',
  })
  id: string;

  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @Column({ name: 'song_id', type: 'uuid' })
  songId: string;

  @Column({ name: 'blocked_by_staff_id', type: 'uuid' })
  blockedByStaffId: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'blocked_at', type: 'timestamptz', default: () => 'now()' })
  blockedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'lifted_at', type: 'timestamptz', nullable: true })
  liftedAt: Date | null;

  @ManyToOne(() => Song)
  @JoinColumn({
    name: 'song_id',
    foreignKeyConstraintName: 'blocked_songs_song_id_fkey',
  })
  song: Song;

  @ManyToOne(() => VenueStaff)
  @JoinColumn([
    {
      name: 'venue_id',
      referencedColumnName: 'venueId',
      foreignKeyConstraintName:
        'blocked_songs_venue_id_blocked_by_staff_id_fkey',
    },
    { name: 'blocked_by_staff_id', referencedColumnName: 'staffUserId' },
  ])
  blockedByStaff: VenueStaff;
}
