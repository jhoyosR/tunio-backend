import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppService, HealthStatus } from './app.service';

// Responde 200 si el servidor y la base estan disponibles, y 503 si la base
// no responde, para que monitoreo o balanceadores distingan ambos casos.
@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth(): Promise<HealthStatus> {
    return this.appService.getHealth();
  }
}
