---
date: '2026-11-03'
requested_by: 'AlvaroVFon'
slug: 'database-error-cause'
status: 'implemented'
---

# Implementation — Causa original en fallos de conexión a MongoDB

## Goal & Problem

`Database.connect` capturaba cualquier error de `mongoose.connect` y lanzaba
`InfraError('Database connection failed')` sin causa y sin registrar el error
del driver. Un ECONNREFUSED, un fallo de DNS, credenciales inválidas y una URI
mal formada eran indistinguibles. `drop()` tenía el mismo patrón.

Issue: #82.

## Decisión

- `BaseError` e `InfraError` aceptan las opciones estándar de `Error` y propagan
  `cause`, de modo que el error de dominio conserva el fallo original.
- `Database.connect` registra una descripción saneada del error del driver
  (`name: message` con las credenciales de la URI redactadas) y lanza el
  `InfraError` con `cause`. El mensaje público sigue siendo
  "Database connection failed" y el arranque sigue saliendo con código 1.
- `Database.drop` registra la causa saneada en lugar de un mensaje sin detalle.

## Acceptance Criteria

- [x] Un `MONGO_URI` inalcanzable deja la causa original disponible en el error.
- [x] El mensaje público no cambia y el proceso termina con código distinto de 0.
- [x] Las credenciales de la URI no aparecen en el log.

## Test Plan

| Case                      | Type | Input / state                                  | Expected result                          | Test file                                      |
| ------------------------- | ---- | ---------------------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| Causa preservada          | unit | conexión a `mongodb://127.0.0.1:1` con timeout | `InfraError` con `cause` de tipo `Error` | `test/unit/src/config/database.config.test.ts` |
| Redacción de credenciales | unit | mensaje con `mongodb://user:secret@host`       | `mongodb://***@host`                     | `test/unit/src/config/database.config.test.ts` |

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test`: 232 unit, 312 integration, 178 e2e.

## Fuera de alcance

Cambiar el flujo de arranque, añadir reintentos, modificar `/ready` o exponer
detalles de conexión al cliente.
