# Prompt para Claude Code — Proyecto Base NestJS

## Contexto

Tengo un proyecto backend recién generado con Nest CLI (`nest new`), completamente vacío (sin módulos personalizados aún). Tu tarea es tomar este proyecto y construir sobre él una **base de aplicación reutilizable**, es decir, un esqueleto sólido, genérico y desacoplado de cualquier lógica de negocio particular, que sirva como punto de partida ("fork base") para futuros proyectos. La idea es no tener que reimplementar cada vez lo que **todo** backend Nest necesita (autenticación, roles, permisos, manejo de errores, documentación, etc.), sino partir siempre de esta base y construir encima la lógica específica de cada proyecto.

**No agregues lógica de negocio específica de ningún dominio particular.** Todo lo que implementes debe ser genérico y transversal a cualquier proyecto.

## Antes de empezar

Antes de escribir código, si detectas que falta algo típico de un proyecto base backend que no esté mencionado en este documento, o si algún punto es ambiguo (por ejemplo: estructura de carpetas por módulos vs. por capas, nombres de convenciones, librerías específicas a usar para alguna funcionalidad, etc.), **pregúntame primero**. No asumas ni implementes funcionalidades adicionales sin confirmarlas conmigo.

También, antes de implementar, plantéame un plan general (arquitectura de carpetas, módulos, y orden de implementación) para que lo revise y apruebe antes de que generes el código.

## Principios que deben regir todo el desarrollo

- **La documentación oficial de NestJS es la referencia principal y tiene prioridad sobre cualquier otra fuente o costumbre.** Ante cualquier duda de "cómo se hace X en Nest", consulta y sigue el enfoque recomendado oficialmente (módulos, providers, guards, interceptors, pipes, exception filters, configuración, etc.).
- Aplica buenas prácticas y principios de desarrollo de software: **YAGNI, DRY, KISS, Clean Code**, principios SOLID donde aplique, y las convenciones idiomáticas de NestJS (inyección de dependencias, separación de responsabilidades por capas, uso correcto de DTOs, etc.).
- No sobre-diseñes ni agregues abstracciones innecesarias "por si acaso". Cada pieza debe justificarse por una necesidad real de la base.
- Todo el código (nombres de variables, funciones, clases, archivos, carpetas) debe estar **en inglés**.
- Los **comentarios deben estar en español**: comentarios breves de línea para explicar decisiones puntuales o lógica no obvia, y comentarios de bloque (más explicativos) para funciones o clases grandes/complejas. No comentes obviedades; comenta lo que aporte entendimiento real del funcionamiento.

## Stack tecnológico

- **NestJS** (el proyecto ya está inicializado con Nest CLI)
- **TypeORM** como ORM
- **PostgreSQL** como motor de base de datos
- **Docker / Docker Compose** para levantar la base de datos (y cualquier otro servicio de infraestructura que aplique, como un servicio de correo de pruebas)
- **Swagger** (`@nestjs/swagger`) para documentación de API
- **JWT** (`@nestjs/jwt` + `passport-jwt`) para autenticación
- Librería de envío de correos que consideres más adecuada y estándar en el ecosistema Nest (justifica brevemente la elección si no es obvia)

## Funcionalidades a implementar

### 1. Gestión de usuarios
- CRUD de usuarios (crear, listar con paginación, obtener por id, actualizar, eliminar o desactivar).
- Contraseñas hasheadas (usa `bcrypt` o similar, con salt rounds configurables por variable de entorno).
- Un usuario puede tener uno o varios roles (relación muchos a muchos entre usuarios y roles).

### 2. Gestión de roles y permisos
- Un rol agrupa uno o varios permisos (relación muchos a muchos entre roles y permisos).
- Los **permisos se crean únicamente mediante seeders** (no deben poder crearse permisos nuevos desde la API/interfaz; los permisos representan las acciones que el sistema es capaz de controlar y deben nacer del código).
- Los **roles sí se gestionan desde la API**: se pueden crear roles, y se puede editar qué permisos tiene asignado cada rol.
- Diseña el sistema de autorización basado en permisos (no solo en roles) de forma que un guard/decorator pueda proteger un endpoint indicando qué permiso(s) se requieren, y el sistema resuelva si el usuario (a través de sus roles) posee ese permiso.

### 3. Autenticación y autorización
- Login con **email y contraseña**.
- La respuesta del login debe incluir, además del **JWT**, los **roles y permisos del usuario autenticado** (para que el frontend pueda renderizar condicionalmente sin tener que hacer una segunda petición).
- Guards de autenticación (verificación de JWT) y de autorización (verificación de permisos), aplicables mediante decoradores personalizados (ej. `@RequirePermissions('users.create')`).
- Restablecimiento de contraseña ("forgot password" / "reset password") vía correo, con token de un solo uso y expiración configurable.

### 4. Seeders
- Seeder de permisos base del sistema (los que tengan sentido para esta base: gestión de usuarios, roles, etc.).
- Seeder de un rol "super-admin" con todos los permisos.
- Seeder de un **primer usuario super-admin**, con credenciales configurables por variable de entorno (nunca hardcodeadas en el código).

### 5. Documentación de API
- Swagger configurado en una ruta clara (ej. `/api/docs`), con:
  - Agrupación por tags/módulos.
  - DTOs documentados con ejemplos y descripciones.
  - Soporte para autenticación Bearer JWT desde la interfaz de Swagger.

### 6. Validación y manejo de errores
- Validación de DTOs con `class-validator` / `class-transformer`, con `ValidationPipe` global (whitelist, forbidNonWhitelisted, transform, etc.).
- Validación de variables de entorno al arrancar la aplicación (ej. con `@nestjs/config` + Joi o `class-validator`), de forma que la app falle rápido y con un mensaje claro si falta o está mal una variable requerida.
- Manejo global de errores con un `ExceptionFilter` centralizado, que capture tanto excepciones controladas (HttpException y sus derivadas) como errores inesperados, y los transforme en una respuesta HTTP consistente.

### 7. Respuestas HTTP consistentes
- Define una estructura estándar de respuesta (éxito y error) que se use en toda la API, ya sea mediante un `Interceptor` global, un wrapper de respuesta, o el mecanismo que consideres más idiomático en Nest.
- Aplica el mismo estándar a las respuestas paginadas.

### 8. Paginación
- Implementa un mecanismo reutilizable de paginación para los CRUDs (query params estándar como `page` y `limit`, respuesta con metadata: total, página actual, total de páginas, etc.), de forma que cualquier módulo nuevo pueda reutilizarlo sin duplicar lógica.

### 9. CORS
- Configuración de CORS pensada para facilitar la comunicación con un frontend (orígenes permitidos configurables por variable de entorno).

### 10. Envío de correos
- Módulo de correo desacoplado (interfaz/servicio genérico) que se use tanto para restablecimiento de contraseña como para cualquier otro correo transaccional futuro.
- Configuración del proveedor SMTP (u otro) vía variables de entorno.

### 11. Docker
- `Dockerfile` para la aplicación (si aplica, pensando en que esta base pueda eventualmente correr en un contenedor).
- `docker-compose.yml` para levantar PostgreSQL (y cualquier servicio auxiliar necesario para pruebas de correo, como Mailhog/Maildev, si lo consideras apropiado) fácilmente en desarrollo.

### 12. Pruebas
- Pruebas unitarias de servicios clave (auth, users, roles, permissions, paginación, etc.).
- Pruebas e2e de los flujos principales: registro/login, protección de rutas por JWT, protección de rutas por permisos, reset de contraseña, CRUD de usuarios y roles.

### 13. README
- README claro y completo: descripción del proyecto como base reutilizable, requisitos previos, cómo levantar el proyecto (incluyendo Docker), variables de entorno necesarias (con ejemplo `.env.example`), cómo correr seeders, cómo correr pruebas, estructura general de carpetas, y cómo extender la base para un nuevo proyecto.

## Entregable esperado

Al finalizar, el proyecto debe poder clonarse/usarse como plantilla, levantarse con Docker Compose para la base de datos, correr las migraciones y seeders, y quedar listo para que sobre él se empiece a construir la lógica de negocio específica de un nuevo proyecto, sin tener que tocar nada de lo ya implementado en esta base.
