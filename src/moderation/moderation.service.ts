import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { AdminActionsService } from '../activity/admin-actions.service';
import { Song } from '../catalog/entities/song.entity';
import { PlayerService } from '../playback/player.service';
import { QueueItem } from '../queue/entities/queue-item.entity';
import { LiveUpdatesService } from '../realtime/live-updates.service';
import { MusicSession } from '../sessions/entities/music-session.entity';
import { lockOpenSession } from '../sessions/lock-open-session';
import { BlockedSong } from './entities/blocked-song.entity';

const ONE_OPEN_BLOCK_PER_SONG = 'uq_one_open_block_per_song';
const UNIQUE_VIOLATION = '23505';
// Vigente: sin levantar y sin vencer. Misma condicion que al pedir (BE-12).
const ACTIVE_BLOCK = 'block.lifted_at IS NULL AND block.expires_at > now()';

export interface BlockDetails {
  blockId: string;
  songId: string;
  title: string;
  artistDisplay: string | null;
  thumbnailUrl: string | null;
  reason: string | null;
  blockedByStaffId: string;
  blockedAt: Date;
  expiresAt: Date;
  liftedAt: Date | null;
}

export interface BlockResult extends BlockDetails {
  // Lo que el bloqueo hizo en la sesion abierta, para mostrarlo en el panel.
  removedFromQueue: boolean;
  skippedPlayback: boolean;
}

interface BlockEffects {
  blockId: string;
  removedFromQueue: boolean;
  skippedPlayback: boolean;
}

@Injectable()
export class ModerationService {
  private readonly blockDurationHours: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly playerService: PlayerService,
    private readonly adminActions: AdminActionsService,
    private readonly liveUpdates: LiveUpdatesService,
    configService: ConfigService,
  ) {
    this.blockDurationHours = configService.getOrThrow<number>(
      'tunio.blockDurationHours',
    );
  }

  // Bloqueos vigentes del local: de aqui saca el panel el blockId para
  // levantarlos antes de tiempo.
  async listActiveBlocks(venueId: string): Promise<BlockDetails[]> {
    const blocks = await this.dataSource.manager
      .createQueryBuilder(BlockedSong, 'block')
      .innerJoinAndSelect('block.song', 'song')
      .where('block.venue_id = :venueId', { venueId })
      .andWhere(ACTIVE_BLOCK)
      .orderBy('block.blocked_at', 'DESC')
      .getMany();
    return blocks.map((block) => this.toDetails(block));
  }

  // Bloquear es del local, no de la noche: funciona sin sesion abierta. Si
  // la hay, su entrada pendiente pasa a BLOCKED y, si sonaba, se salta
  // (decision 18), todo en la misma transaccion que el bloqueo. Con la
  // sesion tomada, ninguna solicitud crea una entrada de la cancion entre el
  // bloqueo y su confirmacion.
  async blockSong(
    venueId: string,
    staffId: string,
    songId: string,
    reason: string | null,
  ): Promise<BlockResult> {
    if (!(await this.dataSource.manager.existsBy(Song, { id: songId }))) {
      throw new NotFoundException('Song not found');
    }
    let effects: BlockEffects;
    try {
      effects = await this.dataSource.transaction(async (manager) => {
        const session = await lockOpenSession(manager, venueId);
        const blockId = await this.insertBlock(
          manager,
          venueId,
          staffId,
          songId,
          reason,
        );
        const removedFromQueue = session
          ? await this.blockPendingEntry(manager, session, songId)
          : false;
        // El salto es consecuencia del bloqueo, no una accion aparte: no se
        // registra como SKIP.
        const skippedPlayback = session
          ? await this.playerService.skipBlockedSong(
              manager,
              session,
              songId,
              staffId,
            )
          : false;
        await this.adminActions.record(manager, {
          venueId,
          actorStaffId: staffId,
          action: 'BLOCK',
          sessionId: session?.id ?? null,
          songId,
          details: { blockId, reason, removedFromQueue, skippedPlayback },
        });
        return { blockId, removedFromQueue, skippedPlayback };
      });
    } catch (error) {
      if (isUniqueViolation(error, ONE_OPEN_BLOCK_PER_SONG)) {
        throw new ConflictException(
          'This song is already blocked in the venue',
        );
      }
      throw error;
    }
    if (effects.removedFromQueue || effects.skippedPlayback) {
      this.liveUpdates.venueChanged(venueId);
    }
    const { blockId, ...result } = effects;
    return { ...(await this.findDetails(venueId, blockId)), ...result };
  }

  // Levantar no devuelve a la cola las entradas que el bloqueo saco: ya
  // salieron. La cancion se puede volver a pedir y entra como entrada nueva.
  // UPDATE condicionado: dos levantamientos simultaneos aplican uno solo, y
  // solo ese queda en la bitacora.
  async liftBlock(
    venueId: string,
    staffId: string,
    blockId: string,
  ): Promise<BlockDetails> {
    const lifted = await this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(BlockedSong)
        .set({ liftedAt: () => 'now()' })
        .where('id = :blockId AND venue_id = :venueId', { blockId, venueId })
        .andWhere('lifted_at IS NULL AND expires_at > now()')
        .returning(['songId'])
        .execute();
      const rows = result.raw as { song_id: string }[];
      if (rows.length === 0) {
        return false;
      }
      await this.adminActions.record(manager, {
        venueId,
        actorStaffId: staffId,
        action: 'UNBLOCK',
        songId: rows[0].song_id,
        details: { blockId },
      });
      return true;
    });
    const details = await this.findDetails(venueId, blockId);
    if (!lifted) {
      throw new ConflictException('This block is no longer active');
    }
    return details;
  }

  // Retirar es solo para lo que espera turno: lo que suena se salta (BE-16).
  // La entrada pasa a REMOVED y no se borra: sus votos siguen para la
  // analitica, que la cuenta como «retirada por el personal».
  async removeEntry(
    venueId: string,
    staffId: string,
    queueItemId: string,
  ): Promise<void> {
    // Con la sesion tomada, el reproductor no puede empezar a la vez la
    // entrada que se esta retirando.
    await this.dataSource.transaction(async (manager) => {
      const session = await lockOpenSession(manager, venueId);
      if (!session) {
        throw new ConflictException('The venue has no open session');
      }
      // Filtrar por la sesion abierta hace que una entrada de otro local, o
      // de una noche anterior, se vea como inexistente.
      const item = await manager.findOneBy(QueueItem, {
        id: queueItemId,
        sessionId: session.id,
      });
      if (!item) {
        throw new NotFoundException('Queue entry not found');
      }
      if (item.status !== 'PENDING') {
        throw new ConflictException(`Cannot remove a ${item.status} entry`);
      }
      await manager.update(
        QueueItem,
        { id: item.id },
        { status: 'REMOVED', finishedAt: () => 'now()' },
      );
      await this.adminActions.record(manager, {
        venueId,
        actorStaffId: staffId,
        action: 'REMOVE',
        sessionId: session.id,
        queueItemId: item.id,
        songId: item.songId,
      });
    });
    this.liveUpdates.venueChanged(venueId);
  }

  // El indice uq_one_open_block_per_song no puede filtrar por now(), asi que
  // un bloqueo vencido sigue «abierto» hasta que se cierra aqui (docs/06).
  // Si queda uno vigente, la insercion choca con el indice: ya esta bloqueada.
  private async insertBlock(
    manager: EntityManager,
    venueId: string,
    staffId: string,
    songId: string,
    reason: string | null,
  ): Promise<string> {
    await manager
      .createQueryBuilder()
      .update(BlockedSong)
      .set({ liftedAt: () => 'expires_at' })
      .where('venue_id = :venueId AND song_id = :songId', { venueId, songId })
      .andWhere('lifted_at IS NULL AND expires_at <= now()')
      .execute();
    const { identifiers } = await manager.insert(BlockedSong, {
      venueId,
      songId,
      blockedByStaffId: staffId,
      reason,
      // Caducidad obligatoria (decision 17), con el reloj de la base, el
      // mismo que fija blocked_at: el CHECK expires_at > blocked_at se cumple.
      expiresAt: () =>
        `now() + make_interval(hours => ${this.blockDurationHours})`,
    });
    return (identifiers[0] as { id: string }).id;
  }

  // Como mucho una: uq_active_song_per_session. Si la cancion suena, su
  // entrada esta PLAYING y la cierra el salto.
  private async blockPendingEntry(
    manager: EntityManager,
    session: MusicSession,
    songId: string,
  ): Promise<boolean> {
    const result = await manager.update(
      QueueItem,
      { sessionId: session.id, songId, status: 'PENDING' },
      { status: 'BLOCKED', finishedAt: () => 'now()' },
    );
    return (result.affected ?? 0) > 0;
  }

  // Filtrar por venue_id hace que un bloqueo de otro local se vea como
  // inexistente, aunque se conozca su id.
  private async findDetails(
    venueId: string,
    blockId: string,
  ): Promise<BlockDetails> {
    const block = await this.dataSource.manager.findOne(BlockedSong, {
      where: { id: blockId, venueId },
      relations: { song: true },
    });
    if (!block) {
      throw new NotFoundException('Block not found');
    }
    return this.toDetails(block);
  }

  private toDetails(block: BlockedSong): BlockDetails {
    return {
      blockId: block.id,
      songId: block.songId,
      title: block.song.title,
      artistDisplay: block.song.artistDisplay,
      thumbnailUrl: block.song.thumbnailUrl,
      reason: block.reason,
      blockedByStaffId: block.blockedByStaffId,
      blockedAt: block.blockedAt,
      expiresAt: block.expiresAt,
      liftedAt: block.liftedAt,
    };
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = error.driverError as {
    code?: string;
    constraint?: string;
  };
  return (
    driverError.code === UNIQUE_VIOLATION &&
    driverError.constraint === constraint
  );
}
