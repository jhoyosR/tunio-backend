import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

// Una linea estructurada por peticion al terminar la respuesta.
// Solo se registra la ruta sin query string, y nunca cabeceras ni cuerpo:
// por ahi viaja el UUID de instalacion del dispositivo, que no puede
// aparecer en claro en ningun registro del servidor.
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();

    response.on('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.logger.log({
        method: request.method,
        path: request.originalUrl.split('?')[0],
        statusCode: response.statusCode,
        durationMs: Math.round(durationMs),
      });
    });

    next();
  }
}
