import { ViewColumn, ViewEntity } from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { numberFromString } from '../../database/transformers/number-from-string.transformer';

// Popularidad por sesion y cancion, sumando todas sus entradas de cola.
// Vista de solo lectura: la crea la migracion con el SQL del esquema de referencia.
@ViewEntity({
  name: 'v_session_song_popularity',
  schema: TUNIO_SCHEMA,
  synchronize: false,
})
export class SessionSongPopularityView {
  @ViewColumn({ name: 'session_id' })
  sessionId: string;

  @ViewColumn({ name: 'song_id' })
  songId: string;

  @ViewColumn({ name: 'youtube_video_id' })
  youtubeVideoId: string;

  @ViewColumn()
  title: string;

  @ViewColumn({ name: 'artist_display' })
  artistDisplay: string | null;

  @ViewColumn()
  genre: string | null;

  @ViewColumn({ name: 'total_votes', transformer: numberFromString })
  totalVotes: number;

  @ViewColumn({ name: 'unique_voters', transformer: numberFromString })
  uniqueVoters: number;

  @ViewColumn({ name: 'first_vote_at' })
  firstVoteAt: Date;
}
