import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

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

  app.enableCors({
    origin: configService.get<string[]>('corsOrigins'),
  });

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
