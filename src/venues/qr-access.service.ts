import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import * as QRCode from 'qrcode';
import { Repository } from 'typeorm';
import { SessionStatus } from '../sessions/entities/music-session.entity';
import { SessionsService } from '../sessions/sessions.service';
import { QrAccess } from './entities/qr-access.entity';

// Tamano pensado para imprimir: a 1024 px el codigo se lee bien incluso
// pegado en una mesa a media luz. Correccion "M" tolera ~15 % de dano.
const QR_IMAGE_WIDTH_PX = 1024;
const QR_IMAGE_MARGIN_MODULES = 4;
const QR_ERROR_CORRECTION = 'M';

export interface QrAccessDetails {
  publicToken: string;
  isEnabled: boolean;
  updatedAt: Date;
}

export interface QrImage {
  png: Buffer;
  fileName: string;
}

export interface OpenSessionSummary {
  id: string;
  status: SessionStatus;
}

// Lo que recibe la app al escanear. openSession = null significa servicio
// cerrado: no es un error, la app lo muestra como tal (MOV-03).
export interface QrResolution {
  venueId: string;
  venueName: string;
  openSession: OpenSessionSummary | null;
}

@Injectable()
export class QrAccessService {
  constructor(
    @InjectRepository(QrAccess)
    private readonly qrAccessRepository: Repository<QrAccess>,
    private readonly sessionsService: SessionsService,
  ) {}

  async getQrAccess(venueId: string): Promise<QrAccessDetails> {
    return this.toDetails(await this.findByVenueOrFail(venueId));
  }

  // Genera el token la primera vez y lo reemplaza las siguientes. Al
  // regenerar, los QR impresos con el token anterior dejan de funcionar:
  // es la forma de invalidar un codigo que circula donde no debe.
  async regenerateToken(venueId: string): Promise<QrAccessDetails> {
    const qrAccess =
      (await this.qrAccessRepository.findOneBy({ venueId })) ??
      this.qrAccessRepository.create({ venueId });
    qrAccess.publicToken = randomUUID();
    return this.toDetails(await this.qrAccessRepository.save(qrAccess));
  }

  async setEnabled(
    venueId: string,
    isEnabled: boolean,
  ): Promise<QrAccessDetails> {
    const qrAccess = await this.findByVenueOrFail(venueId);
    qrAccess.isEnabled = isEnabled;
    return this.toDetails(await this.qrAccessRepository.save(qrAccess));
  }

  // El QR lleva el token en texto plano, no una URL (decision 9): solo lo
  // entiende el escaner de la app.
  async renderImage(venueId: string): Promise<QrImage> {
    const qrAccess = await this.findByVenueOrFail(venueId);
    const png = await QRCode.toBuffer(qrAccess.publicToken, {
      type: 'png',
      width: QR_IMAGE_WIDTH_PX,
      margin: QR_IMAGE_MARGIN_MODULES,
      errorCorrectionLevel: QR_ERROR_CORRECTION,
    });
    return { png, fileName: `tunio-qr-${qrAccess.venue.slug}.png` };
  }

  // Ruta publica: el token es lo unico que el cliente aporta. Cada caso
  // responde distinto para que la app muestre un mensaje claro (MOV-09).
  async resolveToken(publicToken: string): Promise<QrResolution> {
    const qrAccess = await this.qrAccessRepository.findOne({
      where: { publicToken },
      relations: { venue: true },
    });
    if (!qrAccess) {
      throw new NotFoundException('Unknown QR code');
    }
    if (!qrAccess.venue.isActive) {
      throw new ForbiddenException('Venue is not active');
    }
    if (!qrAccess.isEnabled) {
      throw new ForbiddenException('QR access is disabled');
    }

    const openSession = await this.sessionsService.findOpenSession(
      qrAccess.venueId,
    );

    return {
      venueId: qrAccess.venueId,
      venueName: qrAccess.venue.name,
      openSession: openSession
        ? { id: openSession.id, status: openSession.status }
        : null,
    };
  }

  private async findByVenueOrFail(venueId: string): Promise<QrAccess> {
    const qrAccess = await this.qrAccessRepository.findOne({
      where: { venueId },
      relations: { venue: true },
    });
    if (!qrAccess) {
      throw new NotFoundException('QR access has not been generated yet');
    }
    return qrAccess;
  }

  private toDetails(qrAccess: QrAccess): QrAccessDetails {
    return {
      publicToken: qrAccess.publicToken,
      isEnabled: qrAccess.isEnabled,
      updatedAt: qrAccess.updatedAt,
    };
  }
}
