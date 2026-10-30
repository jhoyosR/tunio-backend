# Nest Base

Base de aplicacion backend reutilizable, construida con [NestJS](https://docs.nestjs.com/). No contiene logica de negocio de ningun dominio particular: es un punto de partida ("fork base") con lo que la mayoria de proyectos backend necesita desde el dia uno.

## Que incluye

- Gestion de usuarios (CRUD, paginacion, activar/desactivar, eliminar).
- Roles y permisos (many-to-many), con permisos que solo se crean via seeders y roles gestionables desde la API.
- Autenticacion JWT (login con email/password) y autorizacion basada en permisos (`@RequirePermissions(...)`).
- Restablecimiento de contrasena por correo, con token de un solo uso y expiracion configurable.
- Documentacion Swagger en `/api/docs`, con soporte de Bearer JWT.
- Validacion de DTOs (`class-validator`) y de variables de entorno al arrancar (Joi).
- Manejo global de errores y formato de respuesta HTTP consistente (`{ success, data }` / `{ success, error }`).
- Paginacion reutilizable (`page`/`limit`) para cualquier listado.
- CORS configurable por variable de entorno.
- Modulo de correo desacoplado (Nodemailer sobre SMTP).
- Docker Compose para levantar PostgreSQL en desarrollo, y `Dockerfile` para la app.
- Seeders de permisos base, rol `super-admin` y el primer usuario super-admin.
- Pruebas unitarias y e2e.

## Stack

NestJS 11 · TypeORM 0.3 (Postgres) · `@nestjs/config` + Joi · `@nestjs/jwt` + Passport · `class-validator` · `@nestjs/swagger` · `bcrypt` · Nodemailer.

> Nota de versiones: algunos paquetes `@nestjs/*` publicaron majors recientes que pasaron a distribuirse como ESM puro (incompatibles con el `ts-jest`/CommonJS de este proyecto). Este repo fija deliberadamente `@nestjs/config`, `@nestjs/jwt`, `@nestjs/passport`, `@nestjs/typeorm` y `@nestjs/swagger` a la ultima version compatible con CommonJS y con Nest 11. Si en el futuro actualizas alguno de estos paquetes, verifica su campo `"type"` en `package.json` antes de subir de major.

## Requisitos previos

- Node.js 22+
- Docker y Docker Compose (para PostgreSQL)

## Puesta en marcha

```bash
npm install
cp .env.example .env   # ajusta los valores segun tu entorno
docker compose up -d   # levanta PostgreSQL
npm run migration:run  # aplica el esquema
npm run seed            # crea permisos base, rol super-admin y el usuario super-admin
npm run start:dev
```

La API queda en `http://localhost:3000` y la documentacion Swagger en `http://localhost:3000/api/docs`.

## Variables de entorno

Ver `.env.example` para la lista completa con valores de ejemplo. Todas se validan al arrancar (la app falla con un mensaje claro si falta alguna requerida):

| Variable | Descripcion |
|---|---|
| `PORT` | Puerto HTTP de la app |
| `CORS_ORIGINS` | Origenes permitidos, separados por coma |
| `DATABASE_*` | Conexion a PostgreSQL |
| `JWT_SECRET`, `JWT_EXPIRATION` | Firma y expiracion del access token |
| `BCRYPT_SALT_ROUNDS` | Costo del hash de contrasenas |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Credenciales del super-admin sembrado por `npm run seed` |
| `PASSWORD_RESET_EXPIRATION_MINUTES` | Vigencia del token de reset password |
| `SMTP_*`, `MAIL_FROM` | Proveedor SMTP para correo transaccional |

## Migraciones

El esquema se gestiona con migraciones de TypeORM (`synchronize` esta deshabilitado):

```bash
npm run migration:generate -- src/database/migrations/NombreDescriptivo   # genera una migracion comparando entidades vs. DB
npm run migration:run                                                     # aplica migraciones pendientes
npm run migration:revert                                                  # revierte la ultima migracion
```

## Seeders

`npm run seed` corre, en orden:

1. **Permisos base** (`src/database/seeders/permissions.seeder.ts`): catalogo fijo de permisos del sistema. Los permisos **no** se pueden crear desde la API, solo desde este seeder.
2. **Rol `super-admin`**: se crea/actualiza con todos los permisos existentes.
3. **Usuario super-admin**: usa `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` del entorno.

El seeder es idempotente: se puede correr varias veces sin duplicar datos.

## Autorizacion basada en permisos

Cualquier endpoint puede exigir uno o mas permisos:

```ts
@Post()
@RequirePermissions('users.create')
create(@Body() dto: CreateUserDto) { ... }
```

`JwtAuthGuard` y `PermissionsGuard` estan registrados globalmente (`APP_GUARD`): por defecto toda ruta exige un JWT valido. Para exponer un endpoint publico, usa `@Public()`.

## Pruebas

```bash
npm run test        # unitarias (mocks, sin DB)
npm run test:e2e    # end-to-end contra una base de datos de pruebas desechable
```

Los tests e2e usan `nest_base_test` (ver `.env.test`): `test/global-setup.ts` la recrea desde cero y corre las migraciones antes de cada corrida, para que los tests sean deterministas.

## Docker

```bash
docker compose up -d   # solo PostgreSQL, pensado para desarrollo local
docker build -t nest-base .   # imagen de la app para produccion/CI
```

## Estructura de carpetas

```
src/
  config/          # carga y validacion (Joi) de variables de entorno
  database/
    data-source.ts   # DataSource de TypeORM para el CLI de migraciones
    migrations/
    seeders/
  common/          # decorators, DTOs, filtros e interceptores transversales
  auth/            # login, JWT, guards, reset password
  users/ roles/ permissions/   # un modulo por dominio (controller/service/entity/dto)
  mail/            # servicio generico de correo (Nodemailer)
```

## Como extender esta base para un proyecto nuevo

- Agrega tus modulos de negocio como carpetas nuevas bajo `src/`, siguiendo el mismo patron (`*.module.ts`, `*.controller.ts`, `*.service.ts`, `entities/`, `dto/`).
- Si un modulo nuevo necesita endpoints paginados, reutiliza `PaginationQueryDto` y `paginate()` de `src/common`.
- Si un endpoint necesita protegerse por permisos, agrega el permiso a `BASE_PERMISSIONS` en `src/database/seeders/permissions.seeder.ts` y decora el endpoint con `@RequirePermissions('tu.permiso')`. Vuelve a correr `npm run seed` (el rol `super-admin` toma automaticamente los permisos nuevos).
- No modifiques `users`, `roles`, `permissions`, `auth`, `mail` ni `common`: son la parte transversal de la base. La logica especifica del nuevo proyecto va en modulos propios que consumen estos servicios (por ejemplo, inyectando `MailService` o protegiendo rutas con `@RequirePermissions`).
