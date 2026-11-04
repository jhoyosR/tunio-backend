import { ForbiddenException, NotFoundException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { DataSource, Repository } from 'typeorm';
import { AdminActionsService } from '../activity/admin-actions.service';
import { SessionsService } from '../sessions/sessions.service';
import { QrAccess } from './entities/qr-access.entity';
import { QrAccessService } from './qr-access.service';

jest.mock('qrcode', () => ({
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('png')),
}));

const VENUE_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = '33333333-3333-4333-8333-333333333333';

describe('QrAccessService', () => {
  const findQr = jest.fn();
  const findSession = jest.fn();
  let service: QrAccessService;

  const qrAccess = (overrides: object = {}) => ({
    venueId: VENUE_ID,
    publicToken: TOKEN,
    isEnabled: true,
    venue: { name: 'Bar A', slug: 'bar-a', isActive: true },
    ...overrides,
  });

  beforeEach(() => {
    findQr.mockReset();
    findSession.mockReset().mockResolvedValue(null);
    service = new QrAccessService(
      { findOne: findQr } as unknown as Repository<QrAccess>,
      { findOpenSession: findSession } as unknown as SessionsService,
      // resolveToken no escribe: no necesita transaccion ni bitacora.
      {} as DataSource,
      {} as AdminActionsService,
    );
  });

  describe('resolveToken', () => {
    it('devuelve el local y la sesion abierta', async () => {
      findQr.mockResolvedValue(qrAccess());
      findSession.mockResolvedValue({ id: 'session-1', status: 'PAUSED' });

      await expect(service.resolveToken(TOKEN)).resolves.toEqual({
        venueId: VENUE_ID,
        venueName: 'Bar A',
        openSession: { id: 'session-1', status: 'PAUSED' },
      });
    });

    it('sin sesion abierta no es un error: openSession es null', async () => {
      findQr.mockResolvedValue(qrAccess());

      await expect(service.resolveToken(TOKEN)).resolves.toMatchObject({
        openSession: null,
      });
    });

    it('un token desconocido responde 404', async () => {
      findQr.mockResolvedValue(null);

      await expect(service.resolveToken(TOKEN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('un QR desactivado responde 403 sin consultar la sesion', async () => {
      findQr.mockResolvedValue(qrAccess({ isEnabled: false }));

      await expect(service.resolveToken(TOKEN)).rejects.toThrow(
        new ForbiddenException('QR access is disabled'),
      );
      expect(findSession).not.toHaveBeenCalled();
    });

    it('un local inactivo responde 403 aunque el QR este activo', async () => {
      findQr.mockResolvedValue(
        qrAccess({ venue: { name: 'Bar A', isActive: false } }),
      );

      await expect(service.resolveToken(TOKEN)).rejects.toThrow(
        new ForbiddenException('Venue is not active'),
      );
    });
  });

  it('la imagen codifica el token en texto plano, no una URL', async () => {
    findQr.mockResolvedValue(qrAccess());
    const image = await service.renderImage(VENUE_ID);

    expect(QRCode.toBuffer).toHaveBeenCalledWith(
      TOKEN,
      expect.objectContaining({ type: 'png' }),
    );
    expect(image.fileName).toBe('tunio-qr-bar-a.png');
  });
});
