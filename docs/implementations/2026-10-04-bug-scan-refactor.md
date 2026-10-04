---
date: '2026-10-04'
requested_by: 'AlvaroVFon'
slug: 'bug-scan-refactor'
status: 'implemented'
---

# Refactor — Bug scan fix cleanup

## Goal & Problem

Consolidar las correcciones del bug scan sin alterar sus contratos públicos,
manteniendo las operaciones atómicas aisladas en sus servicios y evitando
duplicación accidental en las rutas de autenticación.

## Acceptance Criteria

Invariants that MUST hold after the refactor:

- [x] Las pruebas de concurrencia y seguridad continúan pasando.
- [x] Las interfaces públicas de los servicios permanecen compatibles.
- [x] No se reintroducen lecturas seguidas de escrituras para estados críticos.

## Test Plan

| Case                 | Type             | Input / state                         | Expected result       | Test file                                                 |
| -------------------- | ---------------- | ------------------------------------- | --------------------- | --------------------------------------------------------- |
| Servicios corregidos | characterization | Suite de auth, codes, users y holders | Todos los casos pasan | `test/integration/src/auth/services/auth.service.test.ts` |
