# PPO-04M.3 — Vercel Hobby Deployment Report

**Fecha del checkpoint:** 2026-09-18

**Estado de PPO-04M.3:** `CLOSED / APPROVED`

**Production acceptance:** `PASS`

**Production promotion:** `EXECUTED`

**Supabase Site URL:** `ALIGNED`

**Production pilot rollout:** `NOT EXECUTED`

## 1. Alcance y resultado

La ejecución acumulada reconcilió el comportamiento especial del primer
deployment de un proyecto nuevo en Vercel, aceptó el Preview creado por Git
Integration y, con autorización explícita de Dirección Técnica, promovió ese
Preview exacto. El nuevo Production completó los gates mínimos de build,
runtime, logs, protección y exposición cliente autorizados para PPO-04M.3.

```text
INITIAL PRODUCTION DEPLOYMENT = CREATED
PRODUCTION PROMOTION = EXECUTED
PRODUCTION DEPLOYMENT = READY
PRODUCTION ACCEPTANCE = PASS
PRODUCTION EXPOSURE = PROTECTED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

Dirección Técnica confirmó después que el Site URL de Supabase quedó alineado
manualmente con el dominio Production estable, sin redirects innecesarios ni
otros cambios de configuración Auth. La verificación posterior pasó y permite
cerrar PPO-04M.3.

No se documentan URL, IDs de proyecto/deployment, tokens, referencias o URLs de
Supabase, valores de variables, claves, contraseñas, JWT, bypass secrets ni
identidades.

## 2. Git authority

```text
branch = ops/managed-free-production-pilot
initial HEAD = 313b2076258c6d7a8c7bd9c1bf205213174a91ec
direct parent = d29a0f44fd9dd7abddbeb6c440e4b71fcc852d3d
initial worktree = clean
```

El único cambio entre el padre y la nueva autoridad es este informe:

```text
docs/production/PPO_04M3_VERCEL_HOBBY_DEPLOYMENT_REPORT.md
```

No cambió runtime, aplicación, configuración, dependencias ni Supabase. No se
creó ni cambió de rama y no se ejecutó commit, push, merge o rebase.

## 3. Reconciliación del Production inicial

El deployment del SHA padre fue clasificado por Vercel como Production porque
era el primer deployment del proyecto nuevo. Esta clasificación se acepta como
comportamiento de first deployment y deja de interpretarse como un Preview
fallido.

Metadata sanitizada reconfirmada:

```text
source SHA exact = true
target = production
status = READY
Vercel Authentication = All Deployments
```

Durante la promoción autorizada ese deployment histórico:

- no fue eliminado;
- no fue redeployado;
- no fue usado como origen de la promoción;
- no recibió probes;
- permaneció protegido.

La aceptación productiva posterior corresponde a un deployment nuevo creado
desde el Preview exacto; no reinterpreta ni elimina esta evidencia histórica.

## 4. Vercel project linkage

| Control | Resultado |
| --- | --- |
| Proyecto localmente linked | PASS |
| Estado `.vercel/` ignorado | PASS |
| Archivos `.vercel/` tracked | 0 |
| Repositorio Git conectado | PASS |
| Production Branch | `main` |
| Framework | `Next.js` |
| Root Directory | raíz del repositorio |
| Function Region | `iad1` |
| `vercel.json` | ausente |
| `next.config.ts` | sin cambios |
| `output: "standalone"` | conservado |

La conexión remota corresponde al repositorio gobernante. Los identificadores
internos del proyecto y de la cuenta no se registraron.

## 5. Environment contract

La verificación se limitó a nombre, target, branch scope y tipo. No se
descargaron archivos de entorno ni se imprimieron valores.

### Production

| Variable | Presencia | Boundary |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | presente | pública por contrato |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | presente | pública por contrato |
| `SUPABASE_SECRET_KEY` | presente | server-only / Sensitive |
| `SUPABASE_SERVER_URL` | ausente | requerido ausente |
| `SUPABASE_SERVICE_ROLE_KEY` | ausente | requerido ausente |

### Preview — `ops/managed-free-production-pilot`

| Variable | Presencia | Boundary |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | presente | pública por contrato |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | presente | pública por contrato |
| `SUPABASE_SECRET_KEY` | presente | server-only / Sensitive |
| `SUPABASE_SERVER_URL` | ausente | requerido ausente |
| `SUPABASE_SERVICE_ROLE_KEY` | ausente | requerido ausente |

Ambos targets contienen exactamente las tres variables requeridas dentro del
contrato evaluado. No se ejecutó `vercel env pull`.

## 6. Deployment Protection

```text
Vercel Authentication scope = All Deployments
configuration result = PASS
protection changed or disabled = false
```

Preview y Production permanecen protegidos. Los probes se realizaron con la
capacidad autorizada de Vercel CLI para deployments protegidos. No se obtuvo,
imprimió ni usó un bypass secret manual.

## 7. Preview Git-triggered

`vercel list --environment preview` localizó un único Preview y su metadata Git
coincide exactamente con la nueva autoridad:

```text
environment/target = preview
status = READY
git branch exact = true
git SHA exact = true
git SHA = 313b2076258c6d7a8c7bd9c1bf205213174a91ec
```

`vercel inspect`, ejecutado con el scope linked y sin registrar la referencia o
URL del deployment, confirmó nuevamente `preview / READY`.

## 8. Build acceptance

Los build logs del Preview exacto fueron inspeccionados en memoria y reducidos
a marcadores sanitizados:

```text
build logs available = true
Next.js detected = true
build success marker = true
build error marker = false
standalone error marker = false
build acceptance = PASS
```

No se modificó `output: "standalone"`, `next.config.ts`, dependencias ni código
de aplicación.

## 9. Preview runtime smoke

Todos los probes apuntaron exclusivamente al Preview exacto y atravesaron
Deployment Protection mediante Vercel CLI.

| Probe | Resultado |
| --- | --- |
| `GET /api/health/live` | HTTP 200 / `{ status: ok }` |
| `GET /api/health/ready` | HTTP 200 / `{ status: ready }` |
| `GET /login` | HTTP 200 / reachable |
| `GET /` | HTTP 200 / reachable |

`/api/health/ready` ejecuta el probe server-side real contra el health endpoint
de Supabase Managed; su respuesta `ready` acepta la conectividad configurada.

No se inició servidor local, no se ejecutó full E2E, no se autenticó ningún rol,
no se crearon datos y no se repitió PPO-04M.2B. El método fue HTTP-only mediante
Vercel CLI; no hubo viewports, browser visual ni screenshots porque esta fase
solo autorizó smoke de rutas.

## 10. Runtime logs

Los logs recientes del mismo deployment fueron revisados después de los probes:

```text
runtime events reviewed = 15
error or fatal events = 0
HTTP 5xx events = 0
unhandled runtime exception = absent
Supabase configuration incomplete = absent
server-only env missing = absent
authentication bootstrap failure = absent
runtime logs gate = PASS
```

No se registraron headers, payloads ni mensajes completos.

## 11. Secret boundary

El contrato remoto confirma que `SUPABASE_SECRET_KEY` es Sensitive y no usa el
prefijo público. La revisión estática confirma además que su consumo de runtime
permanece en el adaptador Auth Admin marcado `server-only`.

Las respuestas de `/api/health/live`, `/api/health/ready`, `/login` y `/` fueron
inspeccionadas en memoria:

```text
client response contains sb_secret_ prefix = false
secret exposure smoke = PASS
```

No se buscó, leyó ni imprimió el valor de la clave. Las credenciales no fueron
expuestas ni persistidas.

## 12. Promoción autorizada

Antes de la mutación se revalidó inmediatamente un único Preview con toda la
autoridad requerida:

```text
environment/target = preview
status = READY
source branch = ops/managed-free-production-pilot
source SHA = 313b2076258c6d7a8c7bd9c1bf205213174a91ec
```

Ese deployment exacto fue el único argumento de `vercel promote --yes`. El
comando terminó con código 0 y marcador de éxito. `vercel promote status` fue
consultado y el seguimiento se contrastó con `list` e `inspect` hasta confirmar
un estado terminal.

```text
promotion authorized = true
promotion executed = true
promotion source exact = true
```

No se seleccionó otro Preview, no se tocó `main` y la promoción no se
reinterpretó como merge Git.

## 13. Production source authority

El nuevo Production conserva la autoridad del Preview validado:

```text
environment/target = production
status = READY
source branch exact = true
source SHA exact = true
source SHA = 313b2076258c6d7a8c7bd9c1bf205213174a91ec
```

La metadata también confirma:

```text
Production deployment distinct from Preview = true
Production build distinct from Preview = true
Production created after Preview = true
Preview preserved READY = true
```

El Production inicial del SHA padre permanece como evidencia histórica y no fue
eliminado, redeployado ni probado.

## 14. Production build y environment acceptance

Los logs del build Production nuevo se inspeccionaron en memoria:

```text
Next.js detected = true
build completed = true
build errors = 0
standalone blocker = false
Production build acceptance = PASS
```

El contrato de variables Production se reconfirmó solo por nombre, presencia y
tipo:

| Variable | Resultado |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | presente |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | presente |
| `SUPABASE_SECRET_KEY` | presente / Sensitive / server-only |
| `SUPABASE_SERVER_URL` | ausente |
| `SUPABASE_SERVICE_ROLE_KEY` | ausente |

No se leyó ni imprimió ningún valor. No se ejecutó `vercel env pull`.

## 15. Production protection y runtime smoke

Deployment Protection permaneció sin cambios:

```text
Vercel Authentication = All Deployments
Production exposure = protected
```

Los probes apuntaron exclusivamente al nuevo Production exacto y usaron la
capacidad autorizada de Vercel CLI para atravesar la protección:

| Probe | Resultado |
| --- | --- |
| `GET /api/health/live` | HTTP 200 / `{ status: ok }` |
| `GET /api/health/ready` | HTTP 200 / `{ status: ready }` |
| `GET /login` | HTTP 200 / reachable |
| `GET /` | HTTP 200 / reachable |

La readiness acepta conectividad real server-side con Supabase Managed. No se
ejecutó full E2E, no se autenticaron roles y no se crearon datos de negocio.
El método fue HTTP-only; no hubo viewports, browser visual ni screenshots.

## 16. Production logs y secret boundary

Los logs del mismo Production fueron revisados después de los probes:

```text
runtime events reviewed = 4
error or fatal events = 0
HTTP 5xx events = 0
unhandled runtime exception = absent
Supabase configuration incomplete = absent
missing server-only env = absent
Auth bootstrap failure = absent
```

Las cuatro respuestas se inspeccionaron en memoria sin imprimir sus cuerpos:

```text
sb_secret_ absent = true
Production secret exposure smoke = PASS
```

No se registraron headers, payloads, keys, tokens ni valores de entorno.

## 17. Site URL alignment y verificación posterior

Dirección Técnica confirmó manualmente:

```text
SUPABASE_SITE_URL_ALIGNED
stable Production origin = configured
unnecessary redirects added = false
other Auth configuration changed = false
```

El flujo actual de Godel no depende de callbacks, OAuth, magic links, recovery
email ni SMTP. Por ello no se generaron enlaces o sesiones Auth artificiales
para verificar un ajuste de higiene de plataforma ya confirmado por la
autoridad operativa.

La verificación posterior comprobó nuevamente el Production exacto:

```text
environment/target = production
status = READY
source branch exact = true
source SHA exact = true
Vercel Authentication = All Deployments
```

Los cuatro probes post-alignment pasaron:

| Probe | Resultado |
| --- | --- |
| `GET /api/health/live` | HTTP 200 / contrato correcto |
| `GET /api/health/ready` | HTTP 200 / Supabase Managed reachable |
| `GET /login` | HTTP 200 / reachable |
| `GET /` | HTTP 200 / reachable |

Los logs posteriores registraron 37 eventos, 0 errores/fatal y 0 respuestas
5xx. No aparecieron excepciones no controladas, configuración Supabase
incompleta, variables server-only ausentes ni fallos de bootstrap Auth. El
prefijo `sb_secret_` permaneció ausente en las cuatro respuestas.

Estado final:

```text
PRODUCTION PROMOTION = EXECUTED
PRODUCTION DEPLOYMENT = READY
PRODUCTION ACCEPTANCE = PASS
PRODUCTION EXPOSURE = PROTECTED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
SUPABASE SITE URL = ALIGNED

PPO-04M.3 = CLOSED / APPROVED
PPO-04M.4 = ACTIVE / NEXT
```

## 18. Archivos y restricciones

Archivo actualizado:

- `docs/production/PPO_04M3_VERCEL_HOBBY_DEPLOYMENT_REPORT.md`

No se modificaron aplicación, configuración Next.js, dependencias, tests,
migraciones, tipos, Supabase, variables remotas ni Deployment Protection. No se
creó `vercel.json` y no se tocó el Production inicial. El único cambio local es
este informe de cierre; la configuración Auth fue realizada manualmente fuera
del repositorio por Dirección Técnica.
