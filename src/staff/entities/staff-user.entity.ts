import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TUNIO_SCHEMA } from '../../database/database.constants';

// Solo el personal tiene credenciales. Los clientes nunca crean cuenta.
@Entity({ name: 'staff_users', schema: TUNIO_SCHEMA })
@Unique('staff_users_email_key', ['email'])
export class StaffUser {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'staff_users_pkey',
  })
  id: string;

  @Column({ name: 'display_name', type: 'text' })
  displayName: string;

  @Column({ type: 'text' })
  email: string;

  // Derivacion con sal; nunca texto claro.
  @Column({ name: 'password_hash', type: 'text' })
  passwordHash: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
