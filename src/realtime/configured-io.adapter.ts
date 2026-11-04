import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

// Los decoradores del gateway se evaluan antes de cargar la configuracion,
// asi que los origenes permitidos se inyectan aqui: los mismos que el HTTP.
export class ConfiguredIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigins: string[] | undefined,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigins },
    });
  }
}
