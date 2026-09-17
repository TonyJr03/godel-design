# PPO-04M.3 — Vercel Hobby Deployment Report

**Fecha del checkpoint:** 2026-09-17

**Estado de PPO-04M.3:** `ACTIVE / PREVIEW TARGET BLOCKER`

**Promotion checkpoint:** `NOT REACHED`

**Promoción ejecutada por este pase:** `NO`

## 1. Alcance y resultado

Este pase validó la autoridad Git, el enlace del proyecto Vercel, la conexión
Git, la configuración principal, el contrato de variables y Deployment
Protection. La ejecución se detuvo antes de los probes de runtime porque Vercel
no presentó un deployment `preview` aceptable.

El único deployment localizado para la rama y el SHA autorizados está `READY`,
pero Vercel lo clasifica como target `production`. Esta evidencia contradice el
prerrequisito del checkpoint y también impide reafirmar el estado de entrada
`PRODUCTION DEPLOYMENT = NOT EXECUTED` sin una reconciliación previa.

No se documentan URL, IDs de proyecto/deployment, tokens, referencias o URLs de
Supabase, valores de variables, claves, contraseñas, JWT, bypass secrets ni
identidades.

## 2. Git authority

```text
branch = ops/managed-free-production-pilot
initial HEAD = d29a0f44fd9dd7abddbeb6c440e4b71fcc852d3d
initial worktree = clean
```

No se creó ni cambió de rama. No se ejecutó commit, push, merge, rebase ni
promoción.

## 3. Vercel project linkage

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

## 4. Environment contract

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

## 5. Deployment Protection

```text
Vercel Authentication scope = All Deployments
configuration result = PASS
protection changed or disabled = false
```

El alcance remoto `all` confirma que Preview y Production permanecen bajo el
contrato de protección configurado. No se obtuvo ni usó un bypass secret.

## 6. Preview Git SHA gate

La consulta explícita de deployments `preview` devolvió cero resultados. La
consulta general devolvió un solo deployment con esta metadata sanitizada:

```text
git branch exact = true
git SHA exact = true
status READY = true
target preview = false
target production = true
```

`inspect`, ejecutado con el scope linked y sin registrar la referencia del
deployment, confirmó nuevamente:

```text
status = READY
target = production
```

Por tanto:

```text
VERCEL_PREVIEW_READY = false
EXACT_GIT_SHA_CONFIRMED = true
PREVIEW_TARGET_CONFIRMED = false
```

Este resultado es un blocker. No se reinterpretó un deployment Production como
Preview y no se continuó contra él.

## 7. Build acceptance

```text
preview build logs inspected = false
Next.js build acceptance = NOT RUN
build error gate = NOT RUN
```

Los logs de build del deployment encontrado no se usaron como evidencia porque
su target no es Preview. No se modificó `output: "standalone"` ni ningún archivo
de runtime.

## 8. Runtime health y QA protegida

No se ejecutaron requests contra el target Production encontrado.

| Probe | Resultado |
| --- | --- |
| `/api/health/live` | NOT RUN — no Preview válido |
| `/api/health/ready` | NOT RUN — no Preview válido |
| `/login` | NOT RUN — no Preview válido |
| `/` | NOT RUN — no Preview válido |

No se inició servidor local, no se usó navegador, no se autenticó ningún rol,
no se ejecutaron viewports desktop/mobile y no se capturaron screenshots. No se
crearon datos de negocio ni se repitió PPO-04M.2B. Las credenciales no fueron
leídas, mostradas ni persistidas.

## 9. Runtime logs

```text
preview runtime logs inspected = false
unhandled runtime exception gate = NOT RUN
Supabase configuration gate = NOT RUN
server-only environment gate = NOT RUN
authentication bootstrap gate = NOT RUN
```

La inspección de logs se pospone hasta disponer del Preview exacto y ejecutar
los probes autorizados sobre ese deployment.

## 10. Secret boundary

El contrato remoto confirma que `SUPABASE_SECRET_KEY` es Sensitive y no usa el
prefijo público. La revisión estática confirma además que su consumo de runtime
permanece en el adaptador Auth Admin marcado `server-only`.

```text
npm run audit:security = PASS
blocking violations = 0
client HTML prefix smoke = NOT RUN — no Preview válido
```

No se buscó ni imprimió el valor de la clave. La ausencia de `sb_secret_` en
HTML cliente todavía no puede aprobarse porque hacer el probe contra el target
Production excedería el gate de esta ejecución.

## 11. Promotion checkpoint

No se alcanzan ni se emiten las señales de readiness para promoción:

```text
VERCEL_PREVIEW_READY = NOT SATISFIED
PREVIEW_HEALTH_PASS = NOT RUN
DEPLOYMENT_PROTECTION_PASS = SATISFIED
READY_FOR_PRODUCTION_PROMOTION = false
```

Estado preservado:

```text
PPO-04M.3 = ACTIVE / PREVIEW TARGET BLOCKER
PROMOTION CHECKPOINT = NOT REACHED
vercel promote executed = false
```

Antes de reanudar debe existir un deployment realmente clasificado como
`preview` para la rama y el SHA autorizados. También debe reconciliarse por qué
el deployment exacto ya figura con target `production` y actualizarse la
gobernanza sobre el estado productivo antes de cualquier probe o promoción.

## 12. Archivos y restricciones

Archivo creado:

- `docs/production/PPO_04M3_VERCEL_HOBBY_DEPLOYMENT_REPORT.md`

No se modificaron aplicación, configuración Next.js, dependencias, tests,
migraciones, tipos, Supabase, variables remotas ni Deployment Protection. No se
creó `vercel.json` y no se promovió ningún deployment.
