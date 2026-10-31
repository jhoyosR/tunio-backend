import { MigrationInterface, QueryRunner } from 'typeorm';

// Esquema inicial de Tunio. Tablas, checks, claves (incluidas las compuestas)
// e indices parciales los genera TypeORM desde las entidades; las vistas y
// los indices DESC se copian literales de docs/06-ESQUEMA-DE-DATOS.sql.
const VIEWS_SQL = `
-- Cola en vivo: solo PENDING, ordenada por votos y desempatada por antigüedad.
-- approx_wait_seconds SÍ incluye lo que resta de la canción en curso.
CREATE VIEW v_live_queue AS
WITH counts AS (
  SELECT qi.id          AS queue_item_id,
         qi.session_id,
         qi.song_id,
         qi.requested_at,
         s.title,
         s.artist_display,
         s.thumbnail_url,
         s.duration_seconds,
         COUNT(v.id)::BIGINT AS vote_count
  FROM queue_items qi
  JOIN songs s       ON s.id = qi.song_id
  LEFT JOIN votes v  ON v.queue_item_id = qi.id
  WHERE qi.status = 'PENDING'
  GROUP BY qi.id, s.id
),
current_track AS (
  SELECT p.session_id,
         GREATEST(s.duration_seconds
                  - EXTRACT(EPOCH FROM (now() - p.started_at))::INTEGER, 0) AS remaining_seconds
  FROM playbacks p
  JOIN songs s ON s.id = p.song_id
  WHERE p.status = 'PLAYING'
)
SELECT c.*,
       ROW_NUMBER() OVER w AS queue_position,
       (COALESCE(ct.remaining_seconds, 0)
        + COALESCE(SUM(c.duration_seconds)
                   OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)
       )::BIGINT AS approx_wait_seconds
FROM counts c
LEFT JOIN current_track ct ON ct.session_id = c.session_id
WINDOW w AS (PARTITION BY c.session_id
             ORDER BY c.vote_count DESC, c.requested_at ASC, c.queue_item_id ASC);

-- Qué suena ahora, con su progreso.
CREATE VIEW v_now_playing AS
SELECT p.session_id,
       p.id AS playback_id,
       p.song_id,
       s.title,
       s.artist_display,
       s.thumbnail_url,
       s.duration_seconds,
       p.source,
       p.started_at,
       LEAST(EXTRACT(EPOCH FROM (now() - p.started_at))::INTEGER,
             s.duration_seconds) AS elapsed_seconds
FROM playbacks p
JOIN songs s ON s.id = p.song_id
WHERE p.status = 'PLAYING';

-- DEFINICIÓN ÚNICA de "solicitud no reproducida":
--   entrada de cola que nunca llegó a tener una reproducción en PLAYING o COMPLETED,
--   y que ya no puede sonar (porque terminó mal o porque la sesión cerró).
-- Esta misma condición se usa en v_session_summary. No duplicar con otra distinta.
CREATE VIEW v_unplayed_requests AS
SELECT qi.session_id,
       qi.id AS queue_item_id,
       qi.song_id,
       s.title,
       s.artist_display,
       qi.status,
       qi.requested_at,
       (SELECT COUNT(*) FROM votes v WHERE v.queue_item_id = qi.id)::BIGINT AS vote_count,
       CASE qi.status
         WHEN 'BLOCKED'     THEN 'Bloqueada por el personal'
         WHEN 'REMOVED'     THEN 'Retirada por el personal'
         WHEN 'SKIPPED'     THEN 'Saltada al llegar su turno'
         WHEN 'UNAVAILABLE' THEN 'El vídeo no estaba disponible'
         WHEN 'PENDING'     THEN 'La sesión cerró antes de su turno'
         ELSE                    'Sin reproducir'
       END AS reason
FROM queue_items qi
JOIN music_sessions ms ON ms.id = qi.session_id
JOIN songs s           ON s.id  = qi.song_id
WHERE (ms.status = 'CLOSED'
       OR qi.status IN ('SKIPPED','REMOVED','BLOCKED','UNAVAILABLE'))
  AND NOT EXISTS (
    SELECT 1 FROM playbacks p
    WHERE p.queue_item_id = qi.id
      AND p.status IN ('PLAYING','COMPLETED')
  );

-- Resumen por sesión. Alimenta las tarjetas del panel y del tablero.
CREATE VIEW v_session_summary AS
SELECT ms.id AS session_id,
       ms.venue_id,
       ms.event_name,
       ms.status,
       ms.started_at,
       ms.ended_at,
       (SELECT COUNT(*) FROM queue_items q
         WHERE q.session_id = ms.id)::BIGINT                       AS song_requests,
       (SELECT COUNT(*) FROM votes v
         WHERE v.session_id = ms.id)::BIGINT                       AS total_votes,
       (SELECT COUNT(*) FROM session_devices sd
         WHERE sd.session_id = ms.id)::BIGINT                      AS unique_devices,
       (SELECT COUNT(*) FROM playbacks pb
         WHERE pb.session_id = ms.id AND pb.status = 'COMPLETED')::BIGINT
                                                                   AS completed_playbacks,
       (SELECT COUNT(*) FROM v_unplayed_requests ur
         WHERE ur.session_id = ms.id)::BIGINT                      AS unplayed_requests
FROM music_sessions ms;

-- Tiempo que esperó cada solicitud hasta empezar a sonar.
CREATE VIEW v_wait_times AS
SELECT qi.session_id,
       qi.id AS queue_item_id,
       qi.song_id,
       qi.requested_at,
       p.started_at AS playback_started_at,
       EXTRACT(EPOCH FROM (p.started_at - qi.requested_at))::BIGINT AS wait_seconds
FROM queue_items qi
JOIN playbacks p ON p.queue_item_id = qi.id
WHERE p.source = 'QUEUE';

-- Popularidad por sesión y canción, sumando todas sus entradas de cola.
CREATE VIEW v_session_song_popularity AS
SELECT qi.session_id,
       qi.song_id,
       s.youtube_video_id,
       s.title,
       s.artist_display,
       s.genre,
       COUNT(v.id)::BIGINT                  AS total_votes,
       COUNT(DISTINCT v.device_id)::BIGINT  AS unique_voters,
       MIN(v.voted_at)                      AS first_vote_at
FROM votes v
JOIN queue_items qi ON qi.id = v.queue_item_id
JOIN songs s        ON s.id  = qi.song_id
GROUP BY qi.session_id, qi.song_id, s.id;

-- Participación por franja horaria local.
CREATE VIEW v_hourly_participation AS
SELECT ms.venue_id,
       v.session_id,
       date_trunc('hour', v.voted_at AT TIME ZONE 'America/Bogota') AS local_hour,
       COUNT(*)::BIGINT                     AS total_votes,
       COUNT(DISTINCT v.device_id)::BIGINT  AS unique_devices
FROM votes v
JOIN music_sessions ms ON ms.id = v.session_id
GROUP BY ms.venue_id, v.session_id,
         date_trunc('hour', v.voted_at AT TIME ZONE 'America/Bogota');

-- Diagnóstico: ¿cuánto acaparan las tres canciones más votadas de la sesión?
CREATE VIEW v_vote_concentration AS
WITH per_song AS (
  SELECT qi.session_id, qi.song_id, COUNT(v.id) AS votes
  FROM votes v
  JOIN queue_items qi ON qi.id = v.queue_item_id
  GROUP BY qi.session_id, qi.song_id
),
ranked AS (
  SELECT ps.*,
         ROW_NUMBER() OVER (PARTITION BY ps.session_id ORDER BY ps.votes DESC) AS rnk
  FROM per_song ps
)
SELECT session_id,
       SUM(votes)::BIGINT                                  AS total_votes,
       COALESCE(SUM(votes) FILTER (WHERE rnk <= 3), 0)::BIGINT AS top3_votes,
       ROUND(100.0 * COALESCE(SUM(votes) FILTER (WHERE rnk <= 3), 0)
             / NULLIF(SUM(votes), 0), 1)                   AS top3_share_pct
FROM ranked
GROUP BY session_id;

-- Comparativo por noche. La columna weekday usa el estándar ISO: 1 = lunes.
CREATE VIEW v_night_comparison AS
SELECT ss.venue_id,
       ss.session_id,
       ss.event_name,
       (ss.started_at AT TIME ZONE 'America/Bogota')::date                       AS night_date,
       EXTRACT(ISODOW FROM (ss.started_at AT TIME ZONE 'America/Bogota'))::INTEGER AS weekday,
       ss.unique_devices,
       ss.song_requests,
       ss.total_votes,
       ss.completed_playbacks,
       ss.unplayed_requests
FROM v_session_summary ss
WHERE ss.status = 'CLOSED';
`;

export class InitTunioSchema1793485867491 implements MigrationInterface {
  name = 'InitTunioSchema1793485867491';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // La extension y el esquema no los genera TypeORM.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS tunio`);
    await queryRunner.query(
      `CREATE TABLE "tunio"."staff_users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "display_name" text NOT NULL, "email" text NOT NULL, "password_hash" text NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "staff_users_email_key" UNIQUE ("email"), CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tunio"."songs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "youtube_video_id" text NOT NULL, "title" text NOT NULL, "artist_display" text, "channel_title" text, "genre" text, "genre_set_by_staff_id" uuid, "genre_set_at" TIMESTAMP WITH TIME ZONE, "duration_seconds" integer NOT NULL, "thumbnail_url" text, "last_known_playable" boolean NOT NULL DEFAULT true, "verified_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "songs_youtube_video_id_key" UNIQUE ("youtube_video_id"), CONSTRAINT "songs_check" CHECK ((genre IS NULL) = (genre_set_at IS NULL)), CONSTRAINT "songs_duration_seconds_check" CHECK (duration_seconds > 0), CONSTRAINT "songs_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_songs_genre" ON "tunio"."songs" ("genre") WHERE genre IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "tunio"."venues" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" text NOT NULL, "slug" text NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "venues_slug_key" UNIQUE ("slug"), CONSTRAINT "venues_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tunio"."default_playlists" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "venue_id" uuid NOT NULL, "name" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "default_playlists_id_venue_id_key" UNIQUE ("id", "venue_id"), CONSTRAINT "default_playlists_venue_id_key" UNIQUE ("venue_id"), CONSTRAINT "default_playlists_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tunio"."venue_staff" ("venue_id" uuid NOT NULL, "staff_user_id" uuid NOT NULL, "role" text NOT NULL, "assigned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "venue_staff_role_check" CHECK (role IN ('ADMIN', 'DJ')), CONSTRAINT "venue_staff_pkey" PRIMARY KEY ("venue_id", "staff_user_id"))`,
    );
    await queryRunner.query(`CREATE TABLE "tunio"."music_sessions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "venue_id" uuid NOT NULL, "status" text NOT NULL DEFAULT 'ACTIVE', "event_name" text, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "ended_at" TIMESTAMP WITH TIME ZONE, "default_playlist_id" uuid, "default_playlist_cursor" integer NOT NULL DEFAULT '0', "opened_by_staff_id" uuid, CONSTRAINT "music_sessions_id_venue_id_key" UNIQUE ("id", "venue_id"), CONSTRAINT "music_sessions_check" CHECK ((status =  'CLOSED' AND ended_at IS NOT NULL)
      OR (status <> 'CLOSED' AND ended_at IS NULL)), CONSTRAINT "music_sessions_default_playlist_cursor_check" CHECK (default_playlist_cursor >= 0), CONSTRAINT "music_sessions_status_check" CHECK (status IN ('ACTIVE', 'PAUSED', 'CLOSED')), CONSTRAINT "music_sessions_pkey" PRIMARY KEY ("id"))`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_one_open_session_per_venue" ON "tunio"."music_sessions" ("venue_id") WHERE status IN ('ACTIVE', 'PAUSED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tunio"."anonymous_devices" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "venue_id" uuid NOT NULL, "device_hash" character(64) NOT NULL, "first_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "anonymous_devices_id_venue_id_key" UNIQUE ("id", "venue_id"), CONSTRAINT "anonymous_devices_venue_id_device_hash_key" UNIQUE ("venue_id", "device_hash"), CONSTRAINT "anonymous_devices_device_hash_check" CHECK (device_hash ~ '^[0-9a-f]{64}$'), CONSTRAINT "anonymous_devices_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tunio"."session_devices" ("session_id" uuid NOT NULL, "device_id" uuid NOT NULL, "venue_id" uuid NOT NULL, "first_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "session_devices_pkey" PRIMARY KEY ("session_id", "device_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tunio"."activity_events" ("id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL, "venue_id" uuid NOT NULL, "session_id" uuid, "song_id" uuid, "device_id" uuid, "staff_user_id" uuid, "event_type" text NOT NULL, "details" jsonb NOT NULL DEFAULT '{}'::jsonb, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tunio"."queue_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "session_id" uuid NOT NULL, "song_id" uuid NOT NULL, "requested_by_device_id" uuid NOT NULL, "status" text NOT NULL DEFAULT 'PENDING', "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "finished_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "queue_items_id_session_id_key" UNIQUE ("id", "session_id"), CONSTRAINT "queue_items_check" CHECK (finished_at IS NULL OR finished_at >= requested_at), CONSTRAINT "queue_items_status_check" CHECK (status IN ('PENDING','PLAYING','PLAYED','SKIPPED','REMOVED','BLOCKED','UNAVAILABLE')), CONSTRAINT "queue_items_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_queue_session_status" ON "tunio"."queue_items" ("session_id", "status", "requested_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_active_song_per_session" ON "tunio"."queue_items" ("session_id", "song_id") WHERE status IN ('PENDING', 'PLAYING')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tunio"."admin_actions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "venue_id" uuid NOT NULL, "session_id" uuid, "actor_staff_id" uuid NOT NULL, "action" text NOT NULL, "queue_item_id" uuid, "details" jsonb NOT NULL DEFAULT '{}'::jsonb, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "admin_actions_check" CHECK (queue_item_id IS NULL OR session_id IS NOT NULL), CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tunio"."youtube_quota_usage" ("usage_date" date NOT NULL, "units_consumed" integer NOT NULL DEFAULT '0', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "youtube_quota_usage_units_consumed_check" CHECK (units_consumed >= 0), CONSTRAINT "youtube_quota_usage_pkey" PRIMARY KEY ("usage_date"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tunio"."youtube_search_cache" ("id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL, "query_normalized" text NOT NULL, "results" jsonb NOT NULL, "fetched_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "hit_count" integer NOT NULL DEFAULT '0', CONSTRAINT "youtube_search_cache_query_normalized_key" UNIQUE ("query_normalized"), CONSTRAINT "youtube_search_cache_check" CHECK (expires_at > fetched_at), CONSTRAINT "youtube_search_cache_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_search_cache_expiry" ON "tunio"."youtube_search_cache" ("expires_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "tunio"."blocked_songs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "venue_id" uuid NOT NULL, "song_id" uuid NOT NULL, "blocked_by_staff_id" uuid NOT NULL, "reason" text, "blocked_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "lifted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "blocked_songs_check1" CHECK (lifted_at IS NULL OR lifted_at >= blocked_at), CONSTRAINT "blocked_songs_check" CHECK (expires_at > blocked_at), CONSTRAINT "blocked_songs_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_blocked_lookup" ON "tunio"."blocked_songs" ("venue_id", "song_id", "expires_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_one_open_block_per_song" ON "tunio"."blocked_songs" ("venue_id", "song_id") WHERE lifted_at IS NULL`,
    );
    await queryRunner.query(`CREATE TABLE "tunio"."playbacks" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "session_id" uuid NOT NULL, "venue_id" uuid NOT NULL, "song_id" uuid NOT NULL, "source" text NOT NULL, "queue_item_id" uuid, "status" text NOT NULL DEFAULT 'PLAYING', "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "ended_at" TIMESTAMP WITH TIME ZONE, "error_message" text, CONSTRAINT "playbacks_check2" CHECK (ended_at IS NULL OR ended_at >= started_at), CONSTRAINT "playbacks_check1" CHECK ((status =  'PLAYING' AND ended_at IS NULL)
      OR (status <> 'PLAYING' AND ended_at IS NOT NULL)), CONSTRAINT "playbacks_check" CHECK ((source = 'QUEUE'            AND queue_item_id IS NOT NULL)
      OR (source = 'DEFAULT_PLAYLIST' AND queue_item_id IS NULL)), CONSTRAINT "playbacks_status_check" CHECK (status IN ('PLAYING','COMPLETED','SKIPPED','UNAVAILABLE','ERROR')), CONSTRAINT "playbacks_source_check" CHECK (source IN ('QUEUE', 'DEFAULT_PLAYLIST')), CONSTRAINT "playbacks_pkey" PRIMARY KEY ("id"))`);
    await queryRunner.query(
      `CREATE INDEX "idx_playbacks_queue_item" ON "tunio"."playbacks" ("queue_item_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_playbacks_session_time" ON "tunio"."playbacks" ("session_id", "started_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_one_playback_running_per_session" ON "tunio"."playbacks" ("session_id") WHERE status = 'PLAYING'`,
    );
    await queryRunner.query(
      `CREATE TABLE "tunio"."default_playlist_tracks" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "playlist_id" uuid NOT NULL, "venue_id" uuid NOT NULL, "song_id" uuid NOT NULL, "position" integer NOT NULL, "added_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "default_playlist_tracks_playlist_id_song_id_key" UNIQUE ("playlist_id", "song_id"), CONSTRAINT "default_playlist_tracks_playlist_id_position_key" UNIQUE ("playlist_id", "position"), CONSTRAINT "default_playlist_tracks_position_check" CHECK ("position" > 0), CONSTRAINT "default_playlist_tracks_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tunio"."votes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "queue_item_id" uuid NOT NULL, "session_id" uuid NOT NULL, "device_id" uuid NOT NULL, "origin" text NOT NULL, "voted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "votes_queue_item_id_device_id_key" UNIQUE ("queue_item_id", "device_id"), CONSTRAINT "votes_origin_check" CHECK (origin IN ('REQUEST', 'VOTE')), CONSTRAINT "votes_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_votes_session_time" ON "tunio"."votes" ("session_id", "voted_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_votes_queue_item" ON "tunio"."votes" ("queue_item_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "tunio"."qr_access" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "venue_id" uuid NOT NULL, "public_token" uuid NOT NULL DEFAULT gen_random_uuid(), "is_enabled" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "qr_access_public_token_key" UNIQUE ("public_token"), CONSTRAINT "qr_access_venue_id_key" UNIQUE ("venue_id"), CONSTRAINT "qr_access_pkey" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."songs" ADD CONSTRAINT "songs_genre_set_by_staff_id_fkey" FOREIGN KEY ("genre_set_by_staff_id") REFERENCES "tunio"."staff_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."default_playlists" ADD CONSTRAINT "default_playlists_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "tunio"."venues"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."venue_staff" ADD CONSTRAINT "venue_staff_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "tunio"."venues"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."venue_staff" ADD CONSTRAINT "venue_staff_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "tunio"."staff_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."music_sessions" ADD CONSTRAINT "music_sessions_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "tunio"."venues"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."music_sessions" ADD CONSTRAINT "music_sessions_default_playlist_id_venue_id_fkey" FOREIGN KEY ("default_playlist_id", "venue_id") REFERENCES "tunio"."default_playlists"("id","venue_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."music_sessions" ADD CONSTRAINT "music_sessions_venue_id_opened_by_staff_id_fkey" FOREIGN KEY ("venue_id", "opened_by_staff_id") REFERENCES "tunio"."venue_staff"("venue_id","staff_user_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."anonymous_devices" ADD CONSTRAINT "anonymous_devices_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "tunio"."venues"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."session_devices" ADD CONSTRAINT "session_devices_session_id_venue_id_fkey" FOREIGN KEY ("session_id", "venue_id") REFERENCES "tunio"."music_sessions"("id","venue_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."session_devices" ADD CONSTRAINT "session_devices_device_id_venue_id_fkey" FOREIGN KEY ("device_id", "venue_id") REFERENCES "tunio"."anonymous_devices"("id","venue_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."activity_events" ADD CONSTRAINT "activity_events_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "tunio"."venues"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."activity_events" ADD CONSTRAINT "activity_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tunio"."music_sessions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."activity_events" ADD CONSTRAINT "activity_events_session_id_venue_id_fkey" FOREIGN KEY ("session_id", "venue_id") REFERENCES "tunio"."music_sessions"("id","venue_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."activity_events" ADD CONSTRAINT "activity_events_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "tunio"."songs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."activity_events" ADD CONSTRAINT "activity_events_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "tunio"."staff_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."activity_events" ADD CONSTRAINT "activity_events_session_id_device_id_fkey" FOREIGN KEY ("session_id", "device_id") REFERENCES "tunio"."session_devices"("session_id","device_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."queue_items" ADD CONSTRAINT "queue_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tunio"."music_sessions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."queue_items" ADD CONSTRAINT "queue_items_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "tunio"."songs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."queue_items" ADD CONSTRAINT "queue_items_session_id_requested_by_device_id_fkey" FOREIGN KEY ("session_id", "requested_by_device_id") REFERENCES "tunio"."session_devices"("session_id","device_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."admin_actions" ADD CONSTRAINT "admin_actions_venue_id_actor_staff_id_fkey" FOREIGN KEY ("venue_id", "actor_staff_id") REFERENCES "tunio"."venue_staff"("venue_id","staff_user_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."admin_actions" ADD CONSTRAINT "admin_actions_session_id_venue_id_fkey" FOREIGN KEY ("session_id", "venue_id") REFERENCES "tunio"."music_sessions"("id","venue_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."admin_actions" ADD CONSTRAINT "admin_actions_queue_item_id_session_id_fkey" FOREIGN KEY ("queue_item_id", "session_id") REFERENCES "tunio"."queue_items"("id","session_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."blocked_songs" ADD CONSTRAINT "blocked_songs_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "tunio"."songs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."blocked_songs" ADD CONSTRAINT "blocked_songs_venue_id_blocked_by_staff_id_fkey" FOREIGN KEY ("venue_id", "blocked_by_staff_id") REFERENCES "tunio"."venue_staff"("venue_id","staff_user_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."playbacks" ADD CONSTRAINT "playbacks_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "tunio"."songs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."playbacks" ADD CONSTRAINT "playbacks_session_id_venue_id_fkey" FOREIGN KEY ("session_id", "venue_id") REFERENCES "tunio"."music_sessions"("id","venue_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."playbacks" ADD CONSTRAINT "playbacks_queue_item_id_session_id_fkey" FOREIGN KEY ("queue_item_id", "session_id") REFERENCES "tunio"."queue_items"("id","session_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."default_playlist_tracks" ADD CONSTRAINT "default_playlist_tracks_playlist_id_venue_id_fkey" FOREIGN KEY ("playlist_id", "venue_id") REFERENCES "tunio"."default_playlists"("id","venue_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."default_playlist_tracks" ADD CONSTRAINT "default_playlist_tracks_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "tunio"."songs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."votes" ADD CONSTRAINT "votes_queue_item_id_session_id_fkey" FOREIGN KEY ("queue_item_id", "session_id") REFERENCES "tunio"."queue_items"("id","session_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."votes" ADD CONSTRAINT "votes_session_id_device_id_fkey" FOREIGN KEY ("session_id", "device_id") REFERENCES "tunio"."session_devices"("session_id","device_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."qr_access" ADD CONSTRAINT "qr_access_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "tunio"."venues"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    // Indices con orden DESC: @Index no sabe expresarlos (synchronize: false
    // en la entidad). Copiados de docs/06-ESQUEMA-DE-DATOS.sql.
    await queryRunner.query(
      `CREATE INDEX idx_queue_device_time ON tunio.queue_items(requested_by_device_id, requested_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_admin_actions_venue_date ON tunio.admin_actions(venue_id, occurred_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_activity_venue_time ON tunio.activity_events(venue_id, occurred_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_activity_session_time ON tunio.activity_events(session_id, occurred_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_activity_type_time ON tunio.activity_events(event_type, occurred_at DESC)`,
    );
    // Las vistas referencian las tablas sin esquema: de ahi el search_path local.
    await queryRunner.query(`SET LOCAL search_path TO tunio, public`);
    await queryRunner.query(VIEWS_SQL);
    await queryRunner.query(`SET LOCAL search_path TO DEFAULT`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Orden inverso de dependencia: v_night_comparison usa v_session_summary,
    // que usa v_unplayed_requests.
    await queryRunner.query(`DROP VIEW tunio.v_night_comparison`);
    await queryRunner.query(`DROP VIEW tunio.v_vote_concentration`);
    await queryRunner.query(`DROP VIEW tunio.v_hourly_participation`);
    await queryRunner.query(`DROP VIEW tunio.v_session_song_popularity`);
    await queryRunner.query(`DROP VIEW tunio.v_wait_times`);
    await queryRunner.query(`DROP VIEW tunio.v_session_summary`);
    await queryRunner.query(`DROP VIEW tunio.v_unplayed_requests`);
    await queryRunner.query(`DROP VIEW tunio.v_now_playing`);
    await queryRunner.query(`DROP VIEW tunio.v_live_queue`);
    await queryRunner.query(`DROP INDEX tunio.idx_queue_device_time`);
    await queryRunner.query(`DROP INDEX tunio.idx_admin_actions_venue_date`);
    await queryRunner.query(`DROP INDEX tunio.idx_activity_venue_time`);
    await queryRunner.query(`DROP INDEX tunio.idx_activity_session_time`);
    await queryRunner.query(`DROP INDEX tunio.idx_activity_type_time`);
    await queryRunner.query(
      `ALTER TABLE "tunio"."qr_access" DROP CONSTRAINT "qr_access_venue_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."votes" DROP CONSTRAINT "votes_session_id_device_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."votes" DROP CONSTRAINT "votes_queue_item_id_session_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."default_playlist_tracks" DROP CONSTRAINT "default_playlist_tracks_song_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."default_playlist_tracks" DROP CONSTRAINT "default_playlist_tracks_playlist_id_venue_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."playbacks" DROP CONSTRAINT "playbacks_queue_item_id_session_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."playbacks" DROP CONSTRAINT "playbacks_session_id_venue_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."playbacks" DROP CONSTRAINT "playbacks_song_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."blocked_songs" DROP CONSTRAINT "blocked_songs_venue_id_blocked_by_staff_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."blocked_songs" DROP CONSTRAINT "blocked_songs_song_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."admin_actions" DROP CONSTRAINT "admin_actions_queue_item_id_session_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."admin_actions" DROP CONSTRAINT "admin_actions_session_id_venue_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."admin_actions" DROP CONSTRAINT "admin_actions_venue_id_actor_staff_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."queue_items" DROP CONSTRAINT "queue_items_session_id_requested_by_device_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."queue_items" DROP CONSTRAINT "queue_items_song_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."queue_items" DROP CONSTRAINT "queue_items_session_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."activity_events" DROP CONSTRAINT "activity_events_session_id_device_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."activity_events" DROP CONSTRAINT "activity_events_staff_user_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."activity_events" DROP CONSTRAINT "activity_events_song_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."activity_events" DROP CONSTRAINT "activity_events_session_id_venue_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."activity_events" DROP CONSTRAINT "activity_events_session_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."activity_events" DROP CONSTRAINT "activity_events_venue_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."session_devices" DROP CONSTRAINT "session_devices_device_id_venue_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."session_devices" DROP CONSTRAINT "session_devices_session_id_venue_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."anonymous_devices" DROP CONSTRAINT "anonymous_devices_venue_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."music_sessions" DROP CONSTRAINT "music_sessions_venue_id_opened_by_staff_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."music_sessions" DROP CONSTRAINT "music_sessions_default_playlist_id_venue_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."music_sessions" DROP CONSTRAINT "music_sessions_venue_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."venue_staff" DROP CONSTRAINT "venue_staff_staff_user_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."venue_staff" DROP CONSTRAINT "venue_staff_venue_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."default_playlists" DROP CONSTRAINT "default_playlists_venue_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."songs" DROP CONSTRAINT "songs_genre_set_by_staff_id_fkey"`,
    );
    await queryRunner.query(`DROP TABLE "tunio"."qr_access"`);
    await queryRunner.query(`DROP INDEX "tunio"."idx_votes_queue_item"`);
    await queryRunner.query(`DROP INDEX "tunio"."idx_votes_session_time"`);
    await queryRunner.query(`DROP TABLE "tunio"."votes"`);
    await queryRunner.query(`DROP TABLE "tunio"."default_playlist_tracks"`);
    await queryRunner.query(
      `DROP INDEX "tunio"."uq_one_playback_running_per_session"`,
    );
    await queryRunner.query(`DROP INDEX "tunio"."idx_playbacks_session_time"`);
    await queryRunner.query(`DROP INDEX "tunio"."idx_playbacks_queue_item"`);
    await queryRunner.query(`DROP TABLE "tunio"."playbacks"`);
    await queryRunner.query(`DROP INDEX "tunio"."uq_one_open_block_per_song"`);
    await queryRunner.query(`DROP INDEX "tunio"."idx_blocked_lookup"`);
    await queryRunner.query(`DROP TABLE "tunio"."blocked_songs"`);
    await queryRunner.query(`DROP INDEX "tunio"."idx_search_cache_expiry"`);
    await queryRunner.query(`DROP TABLE "tunio"."youtube_search_cache"`);
    await queryRunner.query(`DROP TABLE "tunio"."youtube_quota_usage"`);
    await queryRunner.query(`DROP TABLE "tunio"."admin_actions"`);
    await queryRunner.query(`DROP INDEX "tunio"."uq_active_song_per_session"`);
    await queryRunner.query(`DROP INDEX "tunio"."idx_queue_session_status"`);
    await queryRunner.query(`DROP TABLE "tunio"."queue_items"`);
    await queryRunner.query(`DROP TABLE "tunio"."activity_events"`);
    await queryRunner.query(`DROP TABLE "tunio"."session_devices"`);
    await queryRunner.query(`DROP TABLE "tunio"."anonymous_devices"`);
    await queryRunner.query(
      `DROP INDEX "tunio"."uq_one_open_session_per_venue"`,
    );
    await queryRunner.query(`DROP TABLE "tunio"."music_sessions"`);
    await queryRunner.query(`DROP TABLE "tunio"."venue_staff"`);
    await queryRunner.query(`DROP TABLE "tunio"."default_playlists"`);
    await queryRunner.query(`DROP TABLE "tunio"."venues"`);
    await queryRunner.query(`DROP INDEX "tunio"."idx_songs_genre"`);
    await queryRunner.query(`DROP TABLE "tunio"."songs"`);
    await queryRunner.query(`DROP TABLE "tunio"."staff_users"`);
    await queryRunner.query(`DROP SCHEMA tunio`);
  }
}
