import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

// YouTube reinicia la cuota a medianoche de la hora del Pacifico, no de la
// hora del sistema (TUNIO_TIMEZONE). Contar el dia en otra zona desfasaria el
// presupuesto del contador real de Google.
const QUOTA_RESET_TIMEZONE = 'America/Los_Angeles';
const PERCENT = 100;

@Injectable()
export class YoutubeQuotaService {
  // Tope para las busquedas: la cuota diaria menos la reserva. La reserva
  // queda para las llamadas de 1 unidad (verificar un video antes de encolar,
  // BE-11), que no deben quedarse sin cuota porque las busquedas la agotaron.
  readonly searchBudget: number;

  constructor(
    private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    const dailyQuota = configService.getOrThrow<number>(
      'tunio.youtubeDailyQuota',
    );
    const reservePct = configService.getOrThrow<number>(
      'tunio.youtubeQuotaReservePct',
    );
    this.searchBudget = Math.floor(
      (dailyQuota * (PERCENT - reservePct)) / PERCENT,
    );
  }

  // Reserva las unidades ANTES de llamar a YouTube, en un solo UPSERT
  // condicionado: dos busquedas simultaneas no pueden pasar ambas el tope.
  // Si la llamada falla despues, las unidades no se devuelven: Google tambien
  // cobra las llamadas fallidas.
  async tryConsume(units: number, ceiling: number): Promise<boolean> {
    const rows = await this.dataSource.query<unknown[]>(
      `INSERT INTO tunio.youtube_quota_usage AS q (usage_date, units_consumed)
       SELECT $1::date, $2::integer WHERE $2::integer <= $3::integer
       ON CONFLICT (usage_date) DO UPDATE
          SET units_consumed = q.units_consumed + EXCLUDED.units_consumed,
              updated_at = now()
        WHERE q.units_consumed + EXCLUDED.units_consumed <= $3::integer
       RETURNING q.units_consumed`,
      [currentQuotaDate(), units, ceiling],
    );
    return rows.length > 0;
  }
}

// Fecha YYYY-MM-DD del dia de cuota en curso.
export function currentQuotaDate(now: Date = new Date()): string {
  // en-CA formatea las fechas como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: QUOTA_RESET_TIMEZONE,
  }).format(now);
}
