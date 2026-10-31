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
import { Song } from '../../catalog/entities/song.entity';
import { DefaultPlaylist } from './default-playlist.entity';

// Se permite anadir y quitar, no reordenar: position se asigna como max+1.
// El borrado es fisico y seguro porque playbacks no referencia esta tabla.
@Entity({ name: 'default_playlist_tracks', schema: TUNIO_SCHEMA })
@Unique('default_playlist_tracks_playlist_id_position_key', [
  'playlistId',
  'position',
])
@Unique('default_playlist_tracks_playlist_id_song_id_key', [
  'playlistId',
  'songId',
])
@Check('default_playlist_tracks_position_check', '"position" > 0')
export class DefaultPlaylistTrack {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'default_playlist_tracks_pkey',
  })
  id: string;

  @Column({ name: 'playlist_id', type: 'uuid' })
  playlistId: string;

  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @Column({ name: 'song_id', type: 'uuid' })
  songId: string;

  @Column({ type: 'integer' })
  position: number;

  @Column({ name: 'added_at', type: 'timestamptz', default: () => 'now()' })
  addedAt: Date;

  @ManyToOne(() => DefaultPlaylist, { onDelete: 'CASCADE' })
  @JoinColumn([
    {
      name: 'playlist_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName:
        'default_playlist_tracks_playlist_id_venue_id_fkey',
    },
    { name: 'venue_id', referencedColumnName: 'venueId' },
  ])
  playlist: DefaultPlaylist;

  @ManyToOne(() => Song)
  @JoinColumn({
    name: 'song_id',
    foreignKeyConstraintName: 'default_playlist_tracks_song_id_fkey',
  })
  song: Song;
}
