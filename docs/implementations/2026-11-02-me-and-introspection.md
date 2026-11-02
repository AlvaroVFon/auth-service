# Perfil de sesión e introspección de tokens

Fecha: 2026-11-02
Issue: #42 — Exponer /auth/me e introspección de tokens

## Contexto

Las aplicaciones ya pueden validar la firma de los tokens con JWKS y, desde #40, iniciar
sesión contra una app concreta. Faltaba una forma de obtener el perfil del token y de
comprobar si un token sigue activo después de un logout.

## Decisión

- `GET /auth/me` requiere un access token válido (con o sin audiencia) y devuelve
  `id`, `email`, `application` (audience o `null`), `role` y `expiresAt`. El email se lee
  de la base de datos; el resto sale de los claims del token.
- `POST /auth/introspect` requiere un access token de llamante y un `token` en el
  cuerpo. Responde siempre `200` con `{ active: false }` o con `id`, `application`,
  `role` y `expiresAt` cuando el token es válido.
- Un llamante solo puede introspeccionar tokens de su mismo usuario y de su misma
  audiencia. Tokens de otro usuario, de otra app, revocados, expirados, malformados, de
  refresh o de un usuario borrado se responden como `active: false` sin datos
  adicionales.
- `/auth/me` usa el middleware de autenticación, que ya rechaza tokens revocados con
  `401`, por lo que AC-2 se cumple sin lógica extra.
- No se añaden credenciales de aplicación ni un endpoint público de introspección: el
  llamante siempre es un usuario autenticado, lo que evita filtrar tokens ajenos.

## API

| Método | Ruta               | Autenticación | Respuesta                             |
| ------ | ------------------ | ------------- | ------------------------------------- |
| `GET`  | `/auth/me`         | access token  | `200` perfil / `401` / `404`          |
| `POST` | `/auth/introspect` | access token  | `200` activo/inactivo / `400` / `401` |

## Fuera de alcance

- Emisión de tokens y JWKS.
- Introspección sin autenticación o para tokens de otros usuarios.
- Revocación de access tokens al margen del logout.

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test:unit`: `ProfileService` (perfil, tokens ajenos, otra app, revocado,
  inválido, refresh y usuario borrado).
- `pnpm test:e2e`: AC-1 a AC-4, owner global, token ausente y autenticación requerida.
