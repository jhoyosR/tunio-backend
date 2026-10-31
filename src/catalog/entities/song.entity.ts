import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { StaffUser } from '../../staff/entities/staff-user.entity';

// Metadatos observados via YouTube y persistidos para no volver a gastar
// cuota. El genero lo asigna a mano el administrador (YouTube no lo da).
@Entity({ name: 'songs', schema: TUNIO_SCHEMA })
@Unique('songs_youtube_video_id_key', ['youtubeVideoId'])
@Check('songs_duration_seconds_check', 'duration_seconds > 0')
@Check('songs_check', '(genre IS NULL) = (genre_set_at IS NULL)')
@Index('idx_songs_genre', ['genre'], { where: 'genre IS NOT NULL' })
export class Song {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'songs_pkey' })
  id: string;

  @Column({ name: 'youtube_video_id', type: 'text' })
  youtubeVideoId: string;

  @Column({ type: 'text' })
  title: string;

  // Derivado del titulo y el canal.
  @Column({ name: 'artist_display', type: 'text', nullable: true })
  artistDisplay: string | null;

  @Column({ name: 'channel_title', type: 'text', nullable: true })
  channelTitle: string | null;

  @Column({ type: 'text', nullable: true })
  genre: string | null;

  @Column({ name: 'genre_set_by_staff_id', type: 'uuid', nullable: true })
  genreSetByStaffId: string | null;

  @Column({ name: 'genre_set_at', type: 'timestamptz', nullable: true })
  genreSetAt: Date | null;

  @Column({ name: 'duration_seconds', type: 'integer' })
  durationSeconds: number;

  @Column({ name: 'thumbnail_url', type: 'text', nullable: true })
  thumbnailUrl: string | null;

  @Column({ name: 'last_known_playable', type: 'boolean', default: true })
  lastKnownPlayable: boolean;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => StaffUser)
  @JoinColumn({
    name: 'genre_set_by_staff_id',
    foreignKeyConstraintName: 'songs_genre_set_by_staff_id_fkey',
  })
  genreSetByStaff: StaffUser | null;
}
