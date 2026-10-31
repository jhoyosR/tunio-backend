import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';
import { Venue } from '../../venues/entities/venue.entity';
import { StaffUser } from './staff-user.entity';

export type StaffRole = 'ADMIN' | 'DJ';

// Un mismo empleado puede tener rol distinto en locales distintos.
@Entity({ name: 'venue_staff', schema: TUNIO_SCHEMA })
@Check('venue_staff_role_check', `role IN ('ADMIN', 'DJ')`)
export class VenueStaff {
  @PrimaryColumn({
    name: 'venue_id',
    type: 'uuid',
    primaryKeyConstraintName: 'venue_staff_pkey',
  })
  venueId: string;

  @PrimaryColumn({
    name: 'staff_user_id',
    type: 'uuid',
    primaryKeyConstraintName: 'venue_staff_pkey',
  })
  staffUserId: string;

  @Column({ type: 'text' })
  role: StaffRole;

  @Column({ name: 'assigned_at', type: 'timestamptz', default: () => 'now()' })
  assignedAt: Date;

  @ManyToOne(() => Venue)
  @JoinColumn({
    name: 'venue_id',
    foreignKeyConstraintName: 'venue_staff_venue_id_fkey',
  })
  venue: Venue;

  @ManyToOne(() => StaffUser)
  @JoinColumn({
    name: 'staff_user_id',
    foreignKeyConstraintName: 'venue_staff_staff_user_id_fkey',
  })
  staffUser: StaffUser;
}
