// Agrupa las variables de entorno ya validadas en objetos tipados y
// tematicos, para inyectarlos por namespace via ConfigService.get('database'), etc.
// Los defaults de Joi ya quedaron aplicados en process.env al llegar aqui.
export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  database: {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    name: process.env.DATABASE_NAME,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresInHours: Number(process.env.JWT_EXPIRES_IN_HOURS),
  },

  tunio: {
    timezone: process.env.TUNIO_TIMEZONE,
    maxRequestsPerHour: Number(process.env.TUNIO_MAX_REQUESTS_PER_HOUR),
    blockDurationHours: Number(process.env.TUNIO_BLOCK_DURATION_HOURS),
    searchCacheTtlHours: Number(process.env.TUNIO_SEARCH_CACHE_TTL_HOURS),
    youtubeDailyQuota: Number(process.env.TUNIO_YOUTUBE_DAILY_QUOTA),
    youtubeQuotaReservePct: Number(process.env.TUNIO_YOUTUBE_QUOTA_RESERVE_PCT),
    eventRetentionDays: Number(process.env.TUNIO_EVENT_RETENTION_DAYS),
  },
});
