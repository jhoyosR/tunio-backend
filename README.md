# Tunio — Servidor principal

Tunio es un prototipo de solicitud musical colaborativa para bares y discotecas. El cliente escanea un QR desde la app Android, busca canciones en YouTube, las pide y vota; la cola se ordena por popularidad y suena en una pantalla del local, con relevo a una lista por defecto cuando se vacia. Hay ademas un panel para el DJ, uno de administracion y un tablero analitico.

Este repositorio es el servidor: concentra las reglas de negocio, la cola, las sesiones, la reproduccion, la integracion con YouTube, el canal en tiempo real y la API que consumen la app y la web.

Stack: NestJS · TypeORM · PostgreSQL.

## Requisitos previos

- Node.js 22+
- Docker y Docker Compose (para PostgreSQL)

## Puesta en marcha en local

```bash
npm install
cp .env.example .env   # ajusta los valores segun tu entorno
docker compose up -d   # levanta PostgreSQL
npm run migration:run  # crea el esquema de la base
npm run seed           # opcional: dos locales de prueba con personal, QR, lista y catalogo
npm run simulate       # opcional, tras el seed: 8 noches pasadas de El Faro para el tablero
npm run start:dev
```

La API queda en `http://localhost:3000` y su documentacion Swagger en `http://localhost:3000/api/docs`.

Las variables de entorno estan descritas en `.env.example` y se validan al arrancar. El archivo `.env` no se versiona.

## Pruebas

```bash
npm run test        # unitarias
npm run test:e2e    # end-to-end, contra una base de pruebas desechable (ver .env.test)
```
