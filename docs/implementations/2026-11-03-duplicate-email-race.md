---
date: '2026-11-03'
requested_by: 'AlvaroVFon'
slug: 'duplicate-email-race'
status: 'implemented'
---

# Implementation — Duplicado de email concurrente como error de dominio

## Goal & Problem

`HoldersService.create` y `UsersService.createVerifiedUser` comprueban la
existencia con `findOne` y después insertan. Dos solicitudes concurrentes con el
mismo email pasan la comprobación y el índice único rechaza una con
`MongoServerError` E11000. Ese error no extiende `BaseError`, así que
`HttpInterceptor` respondía 500 Internal Server Error en lugar del 400 del camino
secuencial.

Issue: #80.

## Decisión

- `HoldersService.create` captura el duplicado con `isDuplicateKeyError` y lanza
  `InvalidArgumentError('Invalid email or password')`, el mismo mensaje genérico
  del camino secuencial (anti-enumeración).
- `UsersService.createVerifiedUser` captura el duplicado y lanza
  `EntityAlreadyExistsError('Email already exists')`, igual que su comprobación
  previa.
- No se añaden índices ni transacciones: la unicidad ya la garantiza el índice
  `email` existente en ambos esquemas.

## Acceptance Criteria

- [x] Dos signups concurrentes del mismo email: una respuesta 2xx y la otra 4xx
      con el mensaje genérico, nunca 500.
- [x] No quedan artefactos parciales: como máximo un holder o usuario por email.
- [x] El camino secuencial conserva su error de dominio actual.

## Test Plan

| Case                          | Type        | Input / state                         | Expected result                                                           | Test file                                              |
| ----------------------------- | ----------- | ------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| Duplicado concurrente holder  | integration | dos `create` simultáneos, mismo email | uno resuelve; el otro `InvalidArgumentError('Invalid email or password')` | `test/integration/src/holders/holders.service.test.ts` |
| Duplicado concurrente usuario | integration | dos `createVerifiedUser` simultáneos  | uno resuelve; el otro `EntityAlreadyExistsError('Email already exists')`  | `test/integration/src/users/users.service.test.ts`     |

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test`: 226 unit, 308 integration, 178 e2e.

## Fuera de alcance

`UsersService.create` (alta administrativa owner-only) mantiene su
comportamiento actual; no se piden transacciones distribuidas ni cambios en los
índices únicos.
