import { ValueTransformer } from 'typeorm';

// node-postgres entrega BIGINT y NUMERIC como texto para no perder precision.
// Los conteos y porcentajes de las vistas son pequenos: se leen como number.
export const numberFromString: ValueTransformer = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};
