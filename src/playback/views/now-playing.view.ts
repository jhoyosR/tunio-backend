import { ViewColumn, ViewEntity } from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import type { PlaybackSource } from '../entities/playback.entity';

// Que suena ahora y cuanto lleva, calculado desde started_at: por eso recargar
// la pantalla del bar no pierde el hilo.
// Vista de solo lectura: la crea la migracion con el SQL del esquema de referencia.
@ViewEntity({
  name: 'v_now_playing',
  schema: TUNIO_SCHEMA,
  synchronize: false,
})
export class NowPlayingView {
  @ViewColumn({ name: 'session_id' })
  sessionId: string;

  @ViewColumn({ name: 'playback_id' })
  playbackId: string;

  @ViewColumn({ name: 'song_id' })
  songId: string;

  @ViewColumn()
  title: string;

  @ViewColumn({ name: 'artist_display' })
  artistDisplay: string | null;

  @ViewColumn({ name: 'thumbnail_url' })
  thumbnailUrl: string | null;

  @ViewColumn({ name: 'duration_seconds' })
  durationSeconds: number;

  @ViewColumn()
  source: PlaybackSource;

  @ViewColumn({ name: 'started_at' })
  startedAt: Date;

  @ViewColumn({ name: 'elapsed_seconds' })
  elapsedSeconds: number;
}
