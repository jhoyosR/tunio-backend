import { EntityManager } from 'typeorm';
import { ActivityEventsService } from './activity-events.service';
import { ActivityEvent } from './entities/activity-event.entity';

const VENUE_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const SONG_ID = '33333333-3333-4333-8333-333333333333';
const DEVICE_ID = '44444444-4444-4444-8444-444444444444';
const STAFF_ID = '55555555-5555-4555-8555-555555555555';

describe('ActivityEventsService', () => {
  const save = jest.fn();
  const manager = { save } as unknown as EntityManager;
  const service = new ActivityEventsService();

  beforeEach(() => save.mockReset());

  it('escribe con el manager recibido, el de la transaccion del hecho', async () => {
    await service.record(manager, {
      eventType: 'VOTE_CAST',
      venueId: VENUE_ID,
      sessionId: SESSION_ID,
      songId: SONG_ID,
      deviceId: DEVICE_ID,
      details: { origin: 'VOTE' },
    });

    expect(save).toHaveBeenCalledWith(ActivityEvent, {
      venueId: VENUE_ID,
      eventType: 'VOTE_CAST',
      sessionId: SESSION_ID,
      songId: SONG_ID,
      deviceId: DEVICE_ID,
      staffUserId: null,
      details: { origin: 'VOTE' },
    });
  });

  it('deja en null lo que el tipo de evento no lleva', async () => {
    await service.record(manager, {
      eventType: 'SESSION_PAUSED',
      venueId: VENUE_ID,
      sessionId: SESSION_ID,
      staffUserId: STAFF_ID,
    });

    expect(save).toHaveBeenCalledWith(ActivityEvent, {
      venueId: VENUE_ID,
      eventType: 'SESSION_PAUSED',
      sessionId: SESSION_ID,
      songId: null,
      deviceId: null,
      staffUserId: STAFF_ID,
      details: {},
    });
  });

  it('admite eventos fuera de sesion, con el local siempre presente', async () => {
    await service.record(manager, {
      eventType: 'QR_SCANNED',
      venueId: VENUE_ID,
    });

    expect(save).toHaveBeenCalledWith(
      ActivityEvent,
      expect.objectContaining({ venueId: VENUE_ID, sessionId: null }),
    );
  });
});
