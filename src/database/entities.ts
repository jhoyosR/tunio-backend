import { ActivityEvent } from '../activity/entities/activity-event.entity';
import { AdminAction } from '../activity/entities/admin-action.entity';
import { HourlyParticipationView } from '../analytics/views/hourly-participation.view';
import { NightComparisonView } from '../analytics/views/night-comparison.view';
import { SessionSongPopularityView } from '../analytics/views/session-song-popularity.view';
import { SessionSummaryView } from '../analytics/views/session-summary.view';
import { UnplayedRequestView } from '../analytics/views/unplayed-request.view';
import { VoteConcentrationView } from '../analytics/views/vote-concentration.view';
import { WaitTimeView } from '../analytics/views/wait-time.view';
import { Song } from '../catalog/entities/song.entity';
import { YoutubeQuotaUsage } from '../catalog/entities/youtube-quota-usage.entity';
import { YoutubeSearchCache } from '../catalog/entities/youtube-search-cache.entity';
import { AnonymousDevice } from '../devices/entities/anonymous-device.entity';
import { BlockedSong } from '../moderation/entities/blocked-song.entity';
import { Playback } from '../playback/entities/playback.entity';
import { NowPlayingView } from '../playback/views/now-playing.view';
import { DefaultPlaylistTrack } from '../playlists/entities/default-playlist-track.entity';
import { DefaultPlaylist } from '../playlists/entities/default-playlist.entity';
import { QueueItem } from '../queue/entities/queue-item.entity';
import { Vote } from '../queue/entities/vote.entity';
import { LiveQueueView } from '../queue/views/live-queue.view';
import { MusicSession } from '../sessions/entities/music-session.entity';
import { SessionDevice } from '../sessions/entities/session-device.entity';
import { StaffUser } from '../staff/entities/staff-user.entity';
import { VenueStaff } from '../staff/entities/venue-staff.entity';
import { QrAccess } from '../venues/entities/qr-access.entity';
import { Venue } from '../venues/entities/venue.entity';

// Registro unico de entidades y vistas: lo comparten la app (app.module.ts)
// y el CLI de migraciones (data-source.ts).
export const ENTITIES = [
  Venue,
  StaffUser,
  VenueStaff,
  QrAccess,
  AnonymousDevice,
  Song,
  YoutubeSearchCache,
  YoutubeQuotaUsage,
  DefaultPlaylist,
  DefaultPlaylistTrack,
  MusicSession,
  SessionDevice,
  QueueItem,
  Vote,
  BlockedSong,
  Playback,
  AdminAction,
  ActivityEvent,
  LiveQueueView,
  NowPlayingView,
  UnplayedRequestView,
  SessionSummaryView,
  WaitTimeView,
  SessionSongPopularityView,
  HourlyParticipationView,
  VoteConcentrationView,
  NightComparisonView,
];
