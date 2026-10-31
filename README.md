# Tunio — Servidor principal

Servidor de Tunio, prototipo de solicitud musical colaborativa para bares y discotecas: el cliente escanea un QR desde la app Android, busca canciones, las pide y vota; la cola se ordena por popularidad y suena en la pantalla del local. Este servicio concentra las reglas de negocio, la cola, las sesiones, el motor de reproduccion, la integracion con YouTube, el canal WebSocket y la API que consumen la app y la web.

Construido con [NestJS](https://docs.nestjs.com/) a partir de una base propia.

## Estado

Esqueleto (`BE-01`): arranca, valida su configuracion, expone un extremo de salud con el estado de la base y registra cada peticion en JSON. Las entidades, la autenticacion del personal y el resto de modulos llegan en las tareas siguientes.

## Que incluye por ahora

- Validacion de variables de entorno al arrancar (Joi): la app no arranca si falta una requerida.
- `GET /health`: `200` si el servidor y la base responden, `503` si la base no responde.
- Registro estructurado en JSON, una linea por peticion (metodo, ruta, codigo, duracion). Nunca registra query string, cabeceras ni cuerpo: por ahi viaja el UUID de instalacion del dispositivo, que no puede quedar en claro en los registros.
- Formato de respuesta HTTP consistente (`{ success, data }` / `{ success, error }`) y manejo global de errores.
- Validacion de DTOs (`class-validator`) y paginacion reutilizable (`page`/`limit`).
- Documentacion Swagger en `/api/docs`.
- CORS configurable por variable de entorno.
- Docker Compose para PostgreSQL en desarrollo y `Dockerfile` para la app.

## Stack

NestJS 11 · TypeORM 0.3 (PostgreSQL) · `@nestjs/config` + Joi · `class-validator` · `@nestjs/swagger`.

> Nota de versiones: algunos paquetes `@nestjs/*` publicaron majors recientes que pasaron a distribuirse como ESM puro (incompatibles con el `ts-jest`/CommonJS de este proyecto). Este repo fija deliberadamente `@nestjs/config`, `@nestjs/jwt`, `@nestjs/passport`, `@nestjs/typeorm` y `@nestjs/swagger` a la ultima version compatible con CommonJS y con Nest 11. Si en el futuro actualizas alguno de estos paquetes, verifica su campo `"type"` en `package.json` antes de subir de major.

## Requisitos previos

- Node.js 22+
- Docker y Docker Compose (para PostgreSQL)

## Puesta en marcha

```bash
npm install
cp .env.example .env   # ajusta los valores segun tu entorno
docker compose up -d   # levanta PostgreSQL
npm run migration:run  # aplica el esquema (aun no hay migraciones)
npm run start:dev
```

La API queda en `http://localhost:3000`, la salud en `http://localhost:3000/health` y Swagger en `http://localhost:3000/api/docs`.

## Variables de entorno

Ver `.env.example`. Todas se validan al arrancar. El archivo `.env` no se versiona: ningun secreto va al repositorio.

| Variable | Descripcion |
|---|---|
| `PORT` | Puerto HTTP de la app |
| `CORS_ORIGINS` | Origenes permitidos, separados por coma (la web Angular) |
| `DATABASE_*` | Conexion a PostgreSQL |
| `TUNIO_TIMEZONE` | Zona horaria fija del sistema (`America/Bogota`) |
| `TUNIO_MAX_REQUESTS_PER_HOUR` | Solicitudes por dispositivo y hora |
| `TUNIO_BLOCK_DURATION_HOURS` | Caducidad de un bloqueo de cancion |
| `TUNIO_SEARCH_CACHE_TTL_HOURS` | Vigencia de la cache de busquedas |
| `TUNIO_YOUTUBE_DAILY_QUOTA` | Cuota diaria de la API de YouTube, en unidades |
| `TUNIO_YOUTUBE_QUOTA_RESERVE_PCT` | Porcentaje de la cuota que se reserva |
| `TUNIO_EVENT_RETENTION_DAYS` | Retencion de los eventos de actividad |

Las `TUNIO_*` son constantes del servicio, comunes a todos los establecimientos (no son ajustes editables) y tienen como valor por defecto el indicado en el esquema de referencia.

## Migraciones

El esquema se gestiona con migraciones de TypeORM (`synchronize` esta deshabilitado):

```bash
npm run migration:generate -- src/database/migrations/NombreDescriptivo   # genera una migracion comparando entidades vs. DB
npm run migration:run                                                     # aplica migraciones pendientes
npm run migration:revert                                                  # revierte la ultima migracion
```

Las vistas y los indices unicos parciales del esquema de referencia no los genera el ORM: se anaden a mano en las migraciones.

## Pruebas

```bash
npm run test        # unitarias (mocks, sin DB)
npm run test:e2e    # end-to-end contra una base de datos de pruebas desechable
```

Los tests e2e usan `tunio_test` (ver `.env.test`): `test/global-setup.ts` la recrea desde cero y corre las migraciones antes de cada corrida.

## Docker

```bash
docker compose up -d                 # solo PostgreSQL, pensado para desarrollo local
docker build -t tunio-backend .      # imagen de la app
```

## Estructura de carpetas

```
src/
  config/          # carga y validacion (Joi) de variables de entorno
  database/
    data-source.ts   # DataSource de TypeORM para el CLI de migraciones
    migrations/
  common/          # DTOs, filtros, interceptores y middleware transversales
```

Los modulos de negocio se agregan como carpetas bajo `src/`, cada uno con su `*.module.ts`, `*.controller.ts`, `*.service.ts`, `entities/` y `dto/`. La logica de negocio vive en los servicios, no en los controladores.
