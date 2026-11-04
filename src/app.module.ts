import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware';
import { ENTITIES } from './database/entities';
import { AuthModule } from './auth/auth.module';
import { VenuesModule } from './venues/venues.module';
import { SessionsModule } from './sessions/sessions.module';
import { DevicesModule } from './devices/devices.module';
import { CatalogModule } from './catalog/catalog.module';
import { QueueModule } from './queue/queue.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.name'),
        entities: ENTITIES,
        // Los UUID por defecto usan gen_random_uuid(), igual que el esquema de referencia.
        uuidExtension: 'pgcrypto' as const,
        // Nunca en produccion: el esquema se gestiona con migraciones explicitas.
        synchronize: false,
      }),
    }),
    AuthModule,
    VenuesModule,
    SessionsModule,
    DevicesModule,
    CatalogModule,
    QueueModule,
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
