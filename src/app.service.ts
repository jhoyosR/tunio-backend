import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface HealthStatus {
  status: 'ok';
  database: 'up';
}

@Injectable()
export class AppService {
  constructor(private readonly dataSource: DataSource) {}

  // Consulta trivial contra la base: isInitialized no basta, porque sigue en
  // true aunque la conexion se haya caido despues del arranque.
  async getHealth(): Promise<HealthStatus> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return { status: 'ok', database: 'up' };
  }
}
