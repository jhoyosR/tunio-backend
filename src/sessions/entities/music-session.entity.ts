import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { DefaultPlaylist } from '../../playlists/entities/default-playlist.entity';
import { VenueStaff } from '../../staff/entities/venue-staff.entity';
import { Venue } from '../../venues/entities/venue.entity';

// ACTIVE acepta solicitudes y votos; PAUSED sigue sonando pero no los acepta.
export type SessionStatus = 'ACTIVE' | 'PAUSED' | 'CLOSED';

// Una sesion = una noche. La abre y la cierra el personal a mano.
@Entity({ name: 'music_sessions', schema: TUNIO_SCHEMA })
// Soporte para las claves compuestas que atan la sesion a su local.
@Unique('music_sessions_id_venue_id_key', ['id', 'venueId'])
@Check(
  'music_sessions_status_check',
  `status IN ('ACTIVE', 'PAUSED', 'CLOSED')`,
)
@Check(
  'music_sessions_default_playlist_cursor_check',
  'default_playlist_cursor >= 0',
)
@Check(
  'music_sessions_check',
  `(status =  'CLOSED' AND ended_at IS NOT NULL)
      OR (status <> 'CLOSED' AND ended_at IS NULL)`,
)
// Como maximo una sesion abierta (ACTIVE o PAUSED) por establecimiento.
@Index('uq_one_open_session_per_venue', ['venueId'], {
  unique: true,
  where: `status IN ('ACTIVE', 'PAUSED')`,
})
export class MusicSession {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'music_sessions_pkey',
  })
  id: string;

  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @Column({ type: 'text', default: 'ACTIVE' })
  status: SessionStatus;

  // Etiqueta libre de la noche, p. ej. "Viernes crossover".
  @Column({ name: 'event_name', type: 'text', nullable: true })
  eventName: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ name: 'default_playlist_id', type: 'uuid', nullable: true })
  defaultPlaylistId: string | null;

  // position (no numero de orden) de la ultima pista servida de la lista por
  // defecto. La rotacion es secuencial y ciclica: al llegar al final vuelve a 0.
  @Column({ name: 'default_playlist_cursor', type: 'integer', default: 0 })
  defaultPlaylistCursor: number;

  @Column({ name: 'opened_by_staff_id', type: 'uuid', nullable: true })
  openedByStaffId: string | null;

  @ManyToOne(() => Venue)
  @JoinColumn({
    name: 'venue_id',
    foreignKeyConstraintName: 'music_sessions_venue_id_fkey',
  })
  venue: Venue;

  @ManyToOne(() => DefaultPlaylist)
  @JoinColumn([
    {
      name: 'default_playlist_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName:
        'music_sessions_default_playlist_id_venue_id_fkey',
    },
    { name: 'venue_id', referencedColumnName: 'venueId' },
  ])
  defaultPlaylist: DefaultPlaylist | null;

  @ManyToOne(() => VenueStaff)
  @JoinColumn([
    {
      name: 'venue_id',
      referencedColumnName: 'venueId',
      foreignKeyConstraintName:
        'music_sessions_venue_id_opened_by_staff_id_fkey',
    },
    { name: 'opened_by_staff_id', referencedColumnName: 'staffUserId' },
  ])
  openedByStaff: VenueStaff | null;
}
