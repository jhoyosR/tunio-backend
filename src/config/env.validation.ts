import * as Joi from 'joi';

// Esquema de validacion de variables de entorno: la app falla al arrancar
// si falta o esta mal alguna variable requerida, en lugar de fallar en runtime.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),

  CORS_ORIGINS: Joi.string().required(),

  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().default(5432),
  DATABASE_USERNAME: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),

  // Constantes del servicio (docs/06 §5). No son ajustes por establecimiento:
  // valen para todo el sistema (decision 21).
  TUNIO_TIMEZONE: Joi.string().default('America/Bogota'),
  TUNIO_MAX_REQUESTS_PER_HOUR: Joi.number().integer().min(1).default(5),
  TUNIO_BLOCK_DURATION_HOURS: Joi.number().integer().min(1).default(4),
  TUNIO_SEARCH_CACHE_TTL_HOURS: Joi.number().integer().min(1).default(24),
  TUNIO_YOUTUBE_DAILY_QUOTA: Joi.number().integer().min(1).default(10000),
  TUNIO_YOUTUBE_QUOTA_RESERVE_PCT: Joi.number()
    .integer()
    .min(0)
    .max(100)
    .default(20),
  TUNIO_EVENT_RETENTION_DAYS: Joi.number().integer().min(1).default(180),
});
