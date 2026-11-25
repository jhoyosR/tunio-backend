import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { hashPassword } from '../../auth/password';
import { Song } from '../../catalog/entities/song.entity';
import { DefaultPlaylistTrack } from '../../playlists/entities/default-playlist-track.entity';
import { DefaultPlaylist } from '../../playlists/entities/default-playlist.entity';
import { StaffUser } from '../../staff/entities/staff-user.entity';
import { StaffRole, VenueStaff } from '../../staff/entities/venue-staff.entity';
import { QrAccess } from '../../venues/entities/qr-access.entity';
import { Venue } from '../../venues/entities/venue.entity';
import { POP_ROCK_SONGS, SeedSong, TROPICAL_SONGS } from './seed-catalog';

interface SeedVenue {
  name: string;
  slug: string;
  playlistName: string;
  songs: SeedSong[];
}

// Dos locales para poder demostrar el aislamiento entre establecimientos.
const SEED_VENUES: SeedVenue[] = [
  {
    name: 'Taberna El Faro',
    slug: 'taberna-el-faro',
    playlistName: 'Vallenato y tropical',
    songs: TROPICAL_SONGS,
  },
  {
    name: 'Discoteca La Terraza',
    slug: 'discoteca-la-terraza',
    playlistName: 'Pop y rock en español',
    songs: POP_ROCK_SONGS,
  },
];

const SEED_ROLES: StaffRole[] = ['ADMIN', 'DJ'];

export interface SeededVenue {
  name: string;
  qrToken: string;
  staffEmails: string[];
}

// Idempotente: volver a ejecutarlo no duplica nada. Conserva el token del QR
// (los codigos ya impresos siguen sirviendo) y las pistas ya anadidas, y
// actualiza la contrasena del personal por si cambio SEED_STAFF_PASSWORD.
export async function seedDatabase(
  dataSource: DataSource,
  staffPassword: string,
): Promise<SeededVenue[]> {
  const passwordHash = await hashPassword(staffPassword);
  return dataSource.transaction(async (manager) => {
    await manager.upsert(
      Song,
      [...TROPICAL_SONGS, ...POP_ROCK_SONGS],
      ['youtubeVideoId'],
    );
    const seeded: SeededVenue[] = [];
    for (const seedVenue of SEED_VENUES) {
      seeded.push(await seedVenueData(manager, seedVenue, passwordHash));
    }
    return seeded;
  });
}

async function seedVenueData(
  manager: EntityManager,
  seedVenue: SeedVenue,
  passwordHash: string,
): Promise<SeededVenue> {
  await manager.upsert(Venue, { name: seedVenue.name, slug: seedVenue.slug }, [
    'slug',
  ]);
  const venue = await manager.findOneByOrFail(Venue, { slug: seedVenue.slug });

  const staffEmails: string[] = [];
  for (const role of SEED_ROLES) {
    const email = `${role.toLowerCase()}@${seedVenue.slug}.test`;
    await manager.upsert(
      StaffUser,
      {
        displayName: `${role} ${seedVenue.name}`,
        email,
        passwordHash,
        isActive: true,
      },
      ['email'],
    );
    const staff = await manager.findOneByOrFail(StaffUser, { email });
    await manager.upsert(
      VenueStaff,
      { venueId: venue.id, staffUserId: staff.id, role },
      ['venueId', 'staffUserId'],
    );
    staffEmails.push(email);
  }

  await manager
    .createQueryBuilder()
    .insert()
    .into(QrAccess)
    .values({ venueId: venue.id, publicToken: randomUUID() })
    .orIgnore()
    .execute();
  const qrAccess = await manager.findOneByOrFail(QrAccess, {
    venueId: venue.id,
  });

  await seedPlaylist(manager, venue.id, seedVenue);
  return { name: venue.name, qrToken: qrAccess.publicToken, staffEmails };
}

// Las pistas se anaden al final en el orden del catalogo, igual que hara
// BE-17 (position = max + 1). Las que ya estan no se tocan.
async function seedPlaylist(
  manager: EntityManager,
  venueId: string,
  seedVenue: SeedVenue,
): Promise<void> {
  await manager.upsert(
    DefaultPlaylist,
    { venueId, name: seedVenue.playlistName },
    ['venueId'],
  );
  const playlist = await manager.findOneByOrFail(DefaultPlaylist, { venueId });

  const existing = await manager.findBy(DefaultPlaylistTrack, {
    playlistId: playlist.id,
  });
  const existingSongIds = new Set(existing.map((track) => track.songId));
  let lastPosition = Math.max(0, ...existing.map((track) => track.position));

  for (const seedSong of seedVenue.songs) {
    const song = await manager.findOneByOrFail(Song, {
      youtubeVideoId: seedSong.youtubeVideoId,
    });
    if (existingSongIds.has(song.id)) {
      continue;
    }
    lastPosition += 1;
    await manager.insert(DefaultPlaylistTrack, {
      playlistId: playlist.id,
      venueId,
      songId: song.id,
      position: lastPosition,
    });
  }
}
