# Imagen Docker de producción y entorno

Fecha: 2026-11-02
Issue: #48 — Preparar imagen Docker de producción y entorno

## Contexto

El `Dockerfile` anterior arrancaba `pnpm dev` (`tsx watch`), usaba `pnpm ci` (comando
inexistente), no compilaba y corría como root. Tampoco existía `.env.example` y el
arranque no validaba la configuración.

## Decisión

- Imagen multi-stage sobre `node:24-slim`:
  - `deps`: instala dependencias con `pnpm install --frozen-lockfile` y las herramientas
    de compilación de `bcrypt`.
  - `build`: typecheck (`pnpm build`) y bundle de `src/index.ts` con esbuild a
    `dist/index.js` (`pnpm build:prod`), con las dependencias externas.
  - `prod-deps`: poda a dependencias de producción.
  - `runtime`: copia `node_modules` de producción, `dist`, las plantillas de email y
    `package.json`; ejecuta `node dist/index.js` como usuario `node`.
- `HEALTHCHECK` contra `GET /health`, que ya responde sin tocar MongoDB.
- `HOST=0.0.0.0` por defecto en la imagen y `PORT=3000`.
- `.env.example` documenta todas las variables: runtime, Mongo, claves JWT, owner,
  URLs/mail, códigos, bloqueo, enlaces compartidos, rate limiting y proxy/CORS.
- Validación de arranque: `requireEnvVariable('MONGO_URI')` lanza
  `InvalidArgumentError` antes de crear la composición si falta. Las claves JWT ya
  fallaban con un mensaje claro, y `NODE_ENV=production` sigue prohibiendo claves
  efímeras.

## Build local

```sh
pnpm build:prod        # typecheck + dist/index.js
node dist/index.js     # requiere MONGO_URI y JWT_PRIVATE_KEY (o claves efímeras en dev)
```

## Docker

```sh
docker build -t auth-service .
docker run --rm -p 3000:3000 --env-file .env auth-service
```

## Seguridad y despliegue

- El proceso no corre como root.
- La imagen de runtime no incluye TypeScript, esbuild ni tests.
- `dist/` y `node_modules/` están en `.dockerignore`, igual que `.env*` (salvo
  `.env.example`).
- Rollback: desplegar la imagen anterior; no hay cambios de datos ni de esquema.

## Fuera de alcance

- CI/CD y despliegue en un orquestador concreto.
- Rotación automática de claves JWT en el contenedor.
- Imágenes multi-arquitectura.

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm build:prod`.
- `pnpm test:unit` (incluye fallo rápido sin `MONGO_URI`), `pnpm test:integration`,
  `pnpm test:e2e`.
- Manual: `node dist/index.js` sin `MONGO_URI` y sin `JWT_PRIVATE_KEY` termina con
  `InvalidArgumentError` claro.
