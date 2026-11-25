import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfiguredIoAdapter } from './realtime/configured-io.adapter';

async function bootstrap() {
  // Registro en JSON (una linea por evento) para poder filtrarlo y medirlo.
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: true }),
  });
  const configService = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigins = configService.get<string[]>('corsOrigins');
  app.enableCors({ origin: corsOrigins });
  app.useWebSocketAdapter(new ConfiguredIoAdapter(app, corsOrigins));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Tunio API')
    .setDescription(
      'Servidor principal de Tunio: solicitud musical colaborativa para bares',
    )
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(configService.get<number>('port')!);
}
void bootstrap();
