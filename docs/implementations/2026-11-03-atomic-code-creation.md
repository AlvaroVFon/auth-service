---
date: '2026-11-03'
requested_by: 'AlvaroVFon'
slug: 'atomic-code-creation'
status: 'implemented'
---

# Implementation — Creación atómica de códigos por subject y tipo

## Goal & Problem

`CodesService.create` comprobaba con `findValidCode` y después insertaba, sin
restricción única. Dos solicitudes concurrentes (signup o reset) pasaban la
comprobación y dejaban dos códigos válidos; al consumir uno, el otro seguía
vigente hasta `CODE_EXPIRATION_MS`.

Issue: #79.

## Decisión

- `CodesSchema` declara un índice único parcial sobre `{ subjectId, type }`
  limitado a `used: false`. El índice es la garantía a nivel de base: solo puede
  existir un código vigente por subject y tipo, y al marcarlo `used: true` el
  documento sale del índice.
- `CodesService.create` mantiene la comprobación previa (camino rápido) y
  traduce el `E11000` del índice a `AlreadyGeneratedCodeError`, de modo que el
  perdedor de la carrera recibe el mismo error de dominio que en el camino
  secuencial.
- Antes del insert, `create` borra las ranuras expiradas (`used: false`,
  `expiresAt <= now`) que el monitor TTL todavía no ha eliminado: el índice
  parcial también las cubre y, sin esta limpieza, un alta legítima chocaría con
  ellas y respondería `AlreadyGeneratedCodeError`.
- `validateCode` no cambia: su `findOneAndUpdate` atómico ya consumía una sola
  vez y ahora además libera la ranura del índice.

## Acceptance Criteria

- [x] Dos `create` concurrentes del mismo subject y tipo: solo una resuelve y
      queda exactamente un código no usado y no expirado.
- [x] Tras consumir el código no queda ningún duplicado vigente.
- [x] La reemisión secuencial sigue lanzando `AlreadyGeneratedCodeError`.

## Test Plan

| Case                    | Type        | Input / state                                  | Expected result                                                          | Test file                                               |
| ----------------------- | ----------- | ---------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| Índice único parcial    | integration | `CodesModel.schema.indexes()`                  | índice `{subjectId,type}` unique y `used:false`                          | `test/integration/src/auth/codes/codes.service.test.ts` |
| Creación concurrente    | integration | dos `create` simultáneos, mismo subject y tipo | una resuelve; la otra lanza `AlreadyGeneratedCodeError`; 1 código válido | `test/integration/src/auth/codes/codes.service.test.ts` |
| Reemisión tras consumo  | integration | crear, validar y volver a crear                | segundo código distinto y válido                                         | `test/integration/src/auth/codes/codes.service.test.ts` |
| Ranura expirada sin TTL | integration | código `used: false` expirado + `create`       | nuevo código válido; la ranura se libera                                 | `test/integration/src/auth/codes/codes.service.test.ts` |

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test`: 226 unit, 310 integration, 178 e2e.

## Despliegue

El índice único parcial falla al construirse si la base ya contiene dos o más
códigos válidos (`used: false`, no expirados) para el mismo `subjectId` y tipo.
Antes de desplegar hay que detectar y resolver esos duplicados (por ejemplo,
marcando como usados todos salvo el más reciente). No se incluye script de
limpieza en este cambio.

## Fuera de alcance

Formato, longitud o TTL de los códigos, `validateCode`, el envío de email y la
limpieza de códigos históricos.
