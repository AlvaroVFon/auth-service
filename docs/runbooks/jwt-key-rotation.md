---
title: 'Runbook — Rotación de claves JWT'
issue: '#106'
applies_to: 'auth-service (RS256 + JWKS)'
status: 'active'
---

# Runbook — Rotación de claves JWT

Procedimiento operativo para cambiar la clave con la que el servicio firma los
tokens sin invalidar sesiones vivas ni dejar consumidores sin poder verificar.
Cubre la preparación, la publicación, la verificación, el periodo de gracia, la
retirada de la clave antigua y el rollback.

Este runbook no edita secretos desde el panel ni automatiza la rotación: los
cambios se hacen en el gestor de secretos y el entorno de despliegue.

## Modelo de claves

- **Clave activa:** firma todos los tokens nuevos. Se configura con
  `JWT_PRIVATE_KEY` (PEM PKCS#8), `JWT_PUBLIC_KEY` (PEM SPKI, se deriva de la
  privada si falta) y `JWT_KEY_ID` (el `kid`). Solo puede haber una activa.
- **Claves retiradas:** siguen verificando tokens ya emitidos. Se declaran en
  `JWT_RETIRED_PUBLIC_KEYS` como array JSON de `{ kid, publicKey, publishedAt }`.
  Nunca llevan clave privada. No firman.
- **JWKS:** `GET /.well-known/jwks.json` publica las claves públicas (activa y
  retiradas) con `Cache-Control: public, max-age=300`. Es público por diseño.
- **Estado de rotación:** `GET /jwks/status` (owner-only, `Cache-Control:
  no-store`) devuelve qué `kid` firma y cuáles se aceptan, con su fecha de
  publicación. No incluye material de clave.
- **Periodo de gracia:** mientras existan tokens firmados con la clave anterior,
  su clave pública debe seguir publicada. Se calcula con el TTL más largo de los
  tokens que el servicio firma: `JWT_REFRESH_EXPIRATION` (24 h por defecto)
  domina a `JWT_EXPIRATION` (1 h) y `MFA_CHALLENGE_EXPIRATION` (300 s).

## Requisitos previos

- Acceso al gestor de secretos y al despliegue de **todas** las instancias.
- Un token de owner válido para consultar `/jwks/status` y `/audit-events`.
- `openssl` (o equivalente) en una máquina de confianza, nunca en un issue.
- Capacidad de hacer un despliegue progresivo y de revertirlo.
- Anotar el `kid` vigente y las claves retiradas actuales antes de empezar.

## Fase 0 — Registrar el estado inicial

```sh
curl -sS "$PUBLIC_APP_URL/.well-known/jwks.json" | jq '{kids: [.keys[].kid]}'

curl -sS -H "Authorization: Bearer $OWNER_TOKEN" \
  "$PUBLIC_APP_URL/jwks/status" | jq
```

Respuesta esperada del estado (ejemplo con una clave retirada):

```json
{
  "activeKid": "2026-11",
  "keys": [
    {
      "kid": "2026-11",
      "status": "active",
      "publishedAt": "2026-11-04T09:00:00.000Z"
    },
    {
      "kid": "2026-10",
      "status": "retired",
      "publishedAt": "2026-10-01T09:00:00.000Z"
    }
  ]
}
```

`publishedAt` es la fecha declarada en `JWT_KEY_PUBLISHED_AT` (clave activa) o en
la entrada `publishedAt` de `JWT_RETIRED_PUBLIC_KEYS`; si no se declara, es el
instante en que la instancia cargó la clave. El endpoint exige rol `owner`: sin
token responde `401` y con un token de usuario global o de aplicación `403`/`401`.

## Fase 1 — Generar el par nuevo

```sh
# Clave privada PKCS#8 y pública SPKI, RSA de 3072 bits.
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out jwt.key
openssl pkey -in jwt.key -pubout -out jwt.pub

# Solo para operar: el kid debe ser único y estable.
echo "kid sugerido: $(date -u +%Y-%m)"
```

Reglas que valida el arranque:

- RSA de 2048 bits o más; cualquier otra familia se rechaza.
- Par privada/pública coincidente; `JWT_PUBLIC_KEY` sin `JWT_PRIVATE_KEY` es
  siempre un error.
- `kid` único entre la activa y las retiradas; si se omite, se deriva del
  thumbprint RFC 7638 de la clave pública (estable entre arranques, pero pierde
  la legibilidad del identificador).
- `JWT_KEY_PUBLISHED_AT` y `publishedAt` deben ser timestamps ISO 8601 con zona
  explícita (`Z` u offset), para que `/jwks/status` no dependa del `TZ` del
  proceso.

Guarda la privada en el gestor de secretos. El par antiguo **no se borra** hasta
que termine el periodo de gracia.

## Fase 2 — Publicar la clave nueva como activa

En el gestor de secretos de cada entorno:

1. `JWT_PRIVATE_KEY` = nueva privada (PEM; en `.env` con `\n` escapados).
2. `JWT_PUBLIC_KEY` = nueva pública (o se omite y se deriva).
3. `JWT_KEY_ID` = `kid` nuevo (por ejemplo `2026-11`).
4. `JWT_KEY_PUBLISHED_AT` = fecha de publicación en ISO 8601.
5. `JWT_RETIRED_PUBLIC_KEYS` incluye la clave antigua **con su `kid` original** y
   su fecha:

```sh
JWT_RETIRED_PUBLIC_KEYS='[{"kid":"2026-10","publicKey":"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----","publishedAt":"2026-10-01T09:00:00.000Z"}]'
```

Todas las instancias deben recibir la misma configuración. Si conviven réplicas
con claves distintas, los tokens y el JWKS divergen y la verificación falla de
forma intermitente. Despliega de forma progresiva y no retires la configuración
anterior del gestor: es el rollback.

## Fase 3 — Verificar la rotación

Con la primera instancia desplegada y, de nuevo, al terminar el despliegue:

```sh
# 1. El JWKS publica la clave nueva y la anterior.
curl -sS "$PUBLIC_APP_URL/.well-known/jwks.json" | jq '{kids: [.keys[].kid]}'

# 2. El estado confirma la activa y la retirada, sin material privado.
curl -sS -H "Authorization: Bearer $OWNER_TOKEN" \
  "$PUBLIC_APP_URL/jwks/status" | jq

# 3. Los tokens nuevos llevan el kid nuevo y verifican con el JWKS.
curl -sS "$PUBLIC_APP_URL/auth/login" -H 'content-type: application/json' \
  -d '{"email":"...","password":"..."}' \
  | jq -r '.accessToken' \
  | cut -d. -f1 | base64 -d 2>/dev/null | jq '{kid, alg}'

# 4. Un token emitido antes de la rotación sigue verificando.
#    Repite login/refresh con una sesión abierta durante el despliegue.
```

Criterios de aceptación de la fase:

- El `kid` de `/jwks/status` coincide con el `activeKid` y con el `kid` de los
  tokens recién emitidos.
- El JWKS contiene la clave nueva y todas las retiradas, sin campos `d`, `p`,
  `q`, `dp`, `dq` ni `qi`.
- Los access y refresh tokens anteriores a la rotación responden `200` en
  `/auth/refresh` y `/auth/me`.
- Los consumidores que cachean el JWKS (máximo 300 s) ya ven la clave nueva.

## Fase 4 — Periodo de gracia

Mantén la clave anterior en `JWT_RETIRED_PUBLIC_KEYS` durante, al menos:

| Token            | Variable                   | Por defecto |
| ---------------- | -------------------------- | ----------- |
| Access token     | `JWT_EXPIRATION`           | 3600 s      |
| Refresh token    | `JWT_REFRESH_EXPIRATION`   | 86400 s     |
| Challenge de MFA | `MFA_CHALLENGE_EXPIRATION` | 300 s       |

El máximo manda: con los valores por defecto son 24 h. Añade margen para
desfases de reloj y despliegues lentos (por ejemplo, 25 h) y no acortes la
ventana porque "ya casi nadie tiene sesión": un refresh token vivo firmado con la
clave vieja se rompe en cuanto retiras su clave pública.

## Fase 5 — Retirar la clave antigua

Cuando el periodo de gracia haya vencido:

1. Elimina la entrada antigua de `JWT_RETIRED_PUBLIC_KEYS` (o deja `[]`).
2. Despliega en todas las instancias con la misma configuración.
3. Verifica:

```sh
curl -sS "$PUBLIC_APP_URL/.well-known/jwks.json" | jq '[.keys[].kid]'
curl -sS -H "Authorization: Bearer $OWNER_TOKEN" \
  "$PUBLIC_APP_URL/jwks/status" | jq
```

El JWKS y el estado deben mostrar solo el `kid` nuevo (`"keys"` con un único
elemento `active`). Con tokens de la ventana anterior caducados, cualquier
petición con un token viejo responde `401`, que es el resultado esperado.

4. Archiva la clave privada antigua según la política de retención de secretos.
   No la reutilices: un `kid` retirado con una clave nueva vuelve a habilitar
   tokens antiguos solo si su firma coincide, y complica la auditoría.

## Rollback

Se aplica cuando el JWKS queda incorrecto (clave nueva ausente, `kid` duplicado,
clave pública que no coincide con la privada) o cuando la clave nueva no verifica
tokens. No requiere downtime: el rollback es un despliegue progresivo con la
configuración anterior.

1. **No retires nada todavía.** La clave nueva puede haber emitido tokens.
2. Restaura en el gestor de secretos la configuración anterior:
   `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`/`JWT_KEY_ID`/`JWT_KEY_PUBLISHED_AT` de la
   clave que funcionaba.
3. Añade la clave **pública** de la rotación fallida a
   `JWT_RETIRED_PUBLIC_KEYS`, con su `kid` y su `publishedAt`, para que los
   tokens emitidos durante el intento sigan verificando.
4. Despliega progresivamente y verifica en cada instancia:

```sh
curl -sS "$PUBLIC_APP_URL/.well-known/jwks.json" | jq '[.keys[].kid]'
curl -sS -H "Authorization: Bearer $OWNER_TOKEN" \
  "$PUBLIC_APP_URL/jwks/status" | jq
# Login nuevo y refresh de una sesión anterior: ambos deben responder 200.
```

5. Cuando el servicio vuelva a verificar con la clave anterior, espera el
   periodo de gracia y retira la clave fallida con la Fase 5.

Si el problema es que una instancia arranca con configuración distinta, no
cambies la clave: iguala la configuración de esa instancia y reiníciala. Un
arranque fallido no modifica los tokens ya emitidos.

## Producción y claves efímeras

`NODE_ENV=production` exige `JWT_PRIVATE_KEY`. `JWT_ALLOW_EPHEMERAL_KEYS=true`
solo funciona en local y test: en producción el proceso termina con
`Ephemeral JWT keys cannot be used when NODE_ENV=production`, aunque el flag esté
activo. Los pares efímeros se generan por proceso, así que tokens y JWKS no
coinciden entre réplicas ni entre reinicios. Este runbook asume claves reales.

Otros fallos de arranque y su causa:

| Mensaje                                                | Causa                                                  |
| ------------------------------------------------------ | ------------------------------------------------------ |
| `JWT_PRIVATE_KEY is required; ...`                     | Faltan claves y el modo efímero está desactivado.      |
| `JWT_PUBLIC_KEY requires JWT_PRIVATE_KEY ...`          | Se publicó una pública sin la privada correspondiente. |
| `The JWT private key does not match the public key`    | Par mezclado de dos rotaciones.                        |
| `Duplicated JWT key id: <kid>`                         | La activa repite el `kid` de una retirada.             |
| `JWT RSA keys must be at least 2048 bits`              | Clave demasiado corta.                                 |
| `JWT_RETIRED_PUBLIC_KEYS must be a JSON array`         | Comillas o `\n` mal escapados en el entorno.           |
| `JWT_RETIRED_PUBLIC_KEYS entries publishedAt must ...` | Falta la zona o no es ISO 8601.                        |
| `JWT_KEY_PUBLISHED_AT must be an ISO 8601 ...`         | Falta la zona o no es ISO 8601 en la clave activa.     |

## Higiene de secretos

- La clave privada nunca se pega en issues, PRs, logs, capturas ni en el panel.
  El panel no edita ni muestra claves.
- Los ejemplos de este documento son marcadores; no son claves utilizables.
- Rota también el par si sospechas que la privada se ha filtrado: publica la
  nueva como activa, mantén la comprometida en retirados el periodo de gracia
  (para no romper sesiones) y retírala después. Si el compromiso es activo,
  revoca las sesiones con `DELETE /auth/sessions` de cada usuario afectado o
  fuerza el reset de contraseña.
- `/jwks/status` y `/audit-events` son solo para owners y no devuelven material
  de clave; no añadas ahí el par privado ni rutas de escritura.

## Checklist

- [ ] Estado inicial anotado (`kid` activo y retirados).
- [ ] Par nuevo generado fuera del repositorio y guardado en el gestor.
- [ ] Configuración idéntica en todas las instancias.
- [ ] JWKS y `/jwks/status` muestran la clave nueva y la anterior.
- [ ] Tokens nuevos usan el `kid` nuevo; los antiguos siguen verificando.
- [ ] Periodo de gracia ≥ TTL máximo de token cumplido.
- [ ] Clave antigua retirada y verificada la ausencia de su `kid`.
- [ ] Clave privada antigua archivada según la política de retención.

## Referencias

- `README.md#jwt-signing-keys` — configuración y endpoint público.
- `docs/implementations/2026-11-02-rs256-jwks.md` — diseño del keyring y JWKS.
- `.memory-bank/decisions.md` (ADR-005 y ADR-011) — decisiones de rotación y estado.
