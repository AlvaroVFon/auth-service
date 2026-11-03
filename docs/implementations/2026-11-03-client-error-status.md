---
date: '2026-11-03'
requested_by: 'AlvaroVFon'
slug: 'client-error-status'
status: 'implemented'
---

# Implementation — Errores 4xx del parser como respuesta de cliente

## Goal & Problem

`express.json()` reenvía un `SyntaxError` con `status = 400` y un
`PayloadTooLargeError` con `status = 413`. `HttpInterceptor` solo respetaba
`BaseError`, así que cualquier otro `Error` se respondía como 500 Internal Server
Error: un body malformado o demasiado grande parecía un fallo del servidor.

Issue: #81.

## Decisión

- `HttpInterceptor` lee `status`/`statusCode` del error y, si es un entero entre
  400 y 499, responde con ese código y el texto estándar de `STATUS_CODES`
  ("Bad Request", "Payload Too Large", etc.).
- Los errores sin un 4xx válido siguen siendo 500 Internal Server Error; los
  `BaseError` conservan su `statusCode`/`code`/mensaje.
- No se expone el mensaje crudo del parser ni el fragmento de body.

## Acceptance Criteria

- [x] JSON malformado en `/auth/login` → 400 con mensaje genérico.
- [x] Body que excede el límite de `express.json()` → 413.
- [x] Un error inesperado sin status 4xx sigue devolviendo 500.

## Test Plan

| Case                  | Type | Input / state                        | Expected result           | Test file                                            |
| --------------------- | ---- | ------------------------------------ | ------------------------- | ---------------------------------------------------- |
| Parser 400            | unit | `SyntaxError` con `status = 400`     | 400 "Bad Request"         | `test/unit/src/common/exception.interceptor.test.ts` |
| Parser 413            | unit | `Error` con `status = 413`           | 413 "Payload Too Large"   | `test/unit/src/common/exception.interceptor.test.ts` |
| Error sin 4xx         | unit | `Error` sin status                   | 500 Internal Server Error | `test/unit/src/common/exception.interceptor.test.ts` |
| BaseError             | unit | `InvalidArgumentError`               | 400 con `code`            | `test/unit/src/common/exception.interceptor.test.ts` |
| JSON malformado real  | e2e  | `POST /auth/login` con body truncado | 400                       | `test/e2e/auth/client-errors.test.ts`                |
| Payload excesivo real | e2e  | `POST /auth/login` con body > 100 kb | 413                       | `test/e2e/auth/client-errors.test.ts`                |

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test`: 238 unit, 312 integration, 180 e2e.

## Fuera de alcance

Cambiar el límite de tamaño de `express.json()`, el formato de error de los
errores de dominio o exponer el mensaje del parser al cliente.
