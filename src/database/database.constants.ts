// Esquema de PostgreSQL donde viven todas las tablas y vistas de Tunio.
// Se declara en cada entidad, y no como esquema global del DataSource,
// porque TypeORM crearia su tabla de migraciones dentro de un esquema
// que todavia no existe en una base vacia (lo crea la primera migracion).
export const TUNIO_SCHEMA = 'tunio';
