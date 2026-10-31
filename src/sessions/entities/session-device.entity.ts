import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { AnonymousDevice } from '../../devices/entities/anonymous-device.entity';
import { MusicSession } from './music-session.entity';

// Participacion de cada dispositivo en cada sesion. Las dos claves comparten
// venue_id: el motor impide adherir un dispositivo a la sesion de otro local.
@Entity({ name: 'session_devices', schema: TUNIO_SCHEMA })
export class SessionDevice {
  @PrimaryColumn({
    name: 'session_id',
    type: 'uuid',
    primaryKeyConstraintName: 'session_devices_pkey',
  })
  sessionId: string;

  @PrimaryColumn({
    name: 'device_id',
    type: 'uuid',
    primaryKeyConstraintName: 'session_devices_pkey',
  })
  deviceId: string;

  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @Column({
    name: 'first_seen_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  firstSeenAt: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'now()' })
  lastSeenAt: Date;

  @ManyToOne(() => MusicSession)
  @JoinColumn([
    {
      name: 'session_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'session_devices_session_id_venue_id_fkey',
    },
    { name: 'venue_id', referencedColumnName: 'venueId' },
  ])
  session: MusicSession;

  @ManyToOne(() => AnonymousDevice)
  @JoinColumn([
    {
      name: 'device_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'session_devices_device_id_venue_id_fkey',
    },
    { name: 'venue_id', referencedColumnName: 'venueId' },
  ])
  device: AnonymousDevice;
}
