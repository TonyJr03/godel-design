# SH — Roadmap de transición a Supabase Self-Hosted

## Gobernanza

`PPO_ROADMAP.md` es el roadmap maestro de Preproducción y Puesta en Operación.
Este documento describe el workstream técnico subordinado que completa el pivot:

```text
Supabase managed
→ Supabase self-hosted Docker
```

SH no es un roadmap de producto paralelo, una sustitución de PPO, una segunda
puesta en producción ni una duplicación de PPO-04, PPO-06, PPO-07 o PPO-10.
Tiene un alcance técnico acotado y un final explícito: al cerrar SH-05,
`SH = CLOSED`; toda evolución posterior continúa exclusivamente mediante PPO.

## Propósito

SH proporciona a PPO un backend Supabase self-hosted que sea reproducible,
integrado, validado, operable, recuperable y portable. No introduce nuevas
funcionalidades de producto.

La arquitectura vigente es:

```text
DESARROLLO / E2E
npm run dev
→ Supabase CLI local

PRODUCTION-LIKE / CONTRATO OPERATIVO
App Docker + Nginx
→ Supabase self-hosted Docker

DESTINO OPERATIVO FUTURO
VPS seleccionada, bajo el contrato provider-neutral
COMPATIBLE CLEAN LINUX DOCKER HOST
```

Supabase administrado pertenece únicamente a evidencia histórica previa; no es
el backend objetivo actual.

## Estado del workstream

| Bloque | Nombre | Estado |
| --- | --- | --- |
| SH-01 | Baseline oficial Supabase self-hosted | Cerrada / aprobada |
| SH-02 | Integración Godel ↔ Supabase self-hosted | Cerrada / aprobada |
| SH-03 | QA funcional production-like | Cerrada / aprobada |
| SH-04 | Fundamentos operativos self-hosted | CLOSED / APPROVED |
| SH-05 | Portabilidad reproducible | ACTIVE |
| SH-05.0 | Discovery and target realignment | CLOSED / APPROVED / PASS_PORTABILITY_DISCOVERY |

### SH-01 — cerrada / aprobada

| Subbloque | Estado |
| --- | --- |
| SH-01A — distribución oficial fijada | CLOSED |
| SH-01B — secretos y standalone | CLOSED |
| SH-01C — baseline Godel / DB, Auth y Storage | CLOSED |

SH-01C dejó una baseline final de seis migraciones consolidadas
(`20260811131824` a `20260811131829`), con fresh rebuild aprobado y
PostgreSQL, Auth y Storage validados. La evidencia detallada no se reescribe en
este roadmap: véase [Auditoría de baseline self-hosted SH-01C](SH_01C_DATABASE_BASELINE_AUDIT.md).

## Bloques pendientes

### SH-02 — Integración Godel ↔ Supabase self-hosted

Integra el runtime contenerizado de PPO-02 con el backend construido en SH-01.
La topología objetivo es:

```text
Browser
   │
   ▼
Nginx
   ├── Next.js
   └── Supabase public API
            │
            ▼
          api-gw
        /   |   \
      Auth REST Storage
             ...
```

Las URLs se separan por actor:

```text
Browser
→ NEXT_PUBLIC_SUPABASE_URL
→ endpoint público servido o proxyado por Nginx

Next container
→ SUPABASE_SERVER_URL
→ http://api-gw:8000
```

Sus objetivos son redes Docker, integración entre ambos stacks, proxy público
de Supabase, distinción URL pública/server-side, Auth, Storage, healthchecks,
readiness, orden de inicio y dependencias, y aislamiento de PostgreSQL y
Supavisor. El diseño y evidencia de SH-02 se mantienen en sus documentos
focales; el roadmap conserva la secuencia y los gates.

| Subbloque | Estado |
| --- | --- |
| SH-02.0 — Diseño de integración y naming | CLOSED / APPROVED |
| SH-02.1 — Compose, networking y naming neutral | CLOSED / APPROVED |
| SH-02.2 — Nginx proxy, URL split y routing TUS | CLOSED / APPROVED |
| SH-02.3 — Readiness, startup, secretos/config | CLOSED / APPROVED |
| SH-02.4 — Smoke técnico, documentación y cierre | CLOSED / APPROVED |

El diseño vigente está en
[SH_02_INTEGRATION_DESIGN.md](SH_02_INTEGRATION_DESIGN.md), la evidencia de
SH-02.1 en [SH_02_COMPOSE_NETWORK_REPORT.md](SH_02_COMPOSE_NETWORK_REPORT.md)
y la de SH-02.2 en [SH_02_NGINX_PROXY_REPORT.md](SH_02_NGINX_PROXY_REPORT.md),
y la de SH-02.3 en
[SH_02_RUNTIME_OPERATIONS_REPORT.md](SH_02_RUNTIME_OPERATIONS_REPORT.md), y el
cierre agregado en [SH_02_CLOSURE_REPORT.md](SH_02_CLOSURE_REPORT.md).
SH-02 está cerrado/aprobado y entrega la topología técnica a SH-03.

### SH-03 — QA funcional production-like

Demuestra que Godel funciona sobre `App Docker + Nginx + Supabase self-hosted`,
y no solo sobre `npm run dev + Supabase CLI local`. Es un gate focal sobre las
fronteras que cambian por la topología, no una duplicación completa de la suite
E2E local.

El mínimo conceptual cubre health/readiness, login, roles, Auth Admin,
dashboard, clientes, solicitudes, pedidos, tareas, pagos, tracking público, TUS
interno, TUS público presigned, resume, finalize, listados y descargas.

| Subbloque | Estado |
| --- | --- |
| SH-03.0 — Diseño QA production-like y estrategia de fixtures | CLOSED / APPROVED |
| SH-03.1 — Provisioning QA self-hosted, Auth/session/roles/Auth Admin | CLOSED / APPROVED |
| SH-03.2 — Flujos core de negocio y tracking | CLOSED / APPROVED |
| SH-03.3 — Storage, TUS, finalize, listados y descargas | CLOSED / APPROVED |
| SH-03.4 — Regresión agregada y cierre | CLOSED / APPROVED |

| Descomposición SH-03.2 | Estado |
| --- | --- |
| SH-03.2A — Inventario core y baseline read-only | CLOSED / APPROVED |
| SH-03.2B — Clientes + Configuración | CLOSED / APPROVED |
| SH-03.2C — Solicitudes | CLOSED / APPROVED |
| SH-03.2D — Pedidos | CLOSED / APPROVED |
| SH-03.2E — Regresión core y handoff | CLOSED / APPROVED |

| Descomposición SH-03.3 | Estado |
| --- | --- |
| SH-03.3A — Inventario Storage y baseline production-like | CLOSED / APPROVED |
| SH-03.3B — Pedido authenticated TUS y diferencial finalize | CLOSED / APPROVED |
| SH-03.3C — Solicitud pública signed TUS | CLOSED / APPROVED |
| SH-03.3D — Committed/list/download/RLS isolation | CLOSED / APPROVED |
| SH-03.3E — Cleanup, resilience y cierre agregado Storage | CLOSED / APPROVED |

El diseño y la auditoría de partida están en
[SH_03_QA_PLAN.md](SH_03_QA_PLAN.md), la evidencia de Auth/roles en
[SH_03_AUTH_QA_REPORT.md](SH_03_AUTH_QA_REPORT.md) y el inventario/baseline
de Storage en [SH_03_STORAGE_QA_REPORT.md](SH_03_STORAGE_QA_REPORT.md).
SH-03 está cerrada/aprobada; SH-03.1, SH-03.2, SH-03.3 y SH-03.4 también están
cerradas/aprobadas, incluidas SH-03.3A–E. PPO-03G y PPO-03 quedan
`CLOSED / APPROVED`; SH-04 y sus subbloques quedan `CLOSED / APPROVED`.
SH-05 está `ACTIVE`; SH-05.0 cerró `CLOSED / APPROVED /
PASS_PORTABILITY_DISCOVERY`.
El handoff conserva las acciones que aún
combinan mutación, revalidación y `ActionState`/`useActionState`: son `TEST IN
SH-03.2`, no fallos asumidos ni flujos a los que deba aplicarse preventivamente
el fallback documental.

### SH-04 — Fundamentos operativos self-hosted

**Estado:** `CLOSED / APPROVED`. SH-04.0–SH-04.3 están `CLOSED / APPROVED`; SH-04.4A–C están cerrados/aprobados, SH-04.4D está `CLOSED / APPROVED / PASS_R2_RUNTIME_COMPATIBLE_ROLLBACK` y SH-04.4E está `CLOSED / APPROVED / PASS_FINAL_ACCEPTANCE`. SH-04.4 queda `CLOSED / APPROVED / PASS_UPDATE_ROLLBACK_CAPABILITY`; SH-04.5 queda `CLOSED / APPROVED / PASS_TECHNICAL_RUNBOOK`.

| Subbloque | Estado |
| --- | --- |
| SH-04.0 | CLOSED / APPROVED |
| SH-04.1 | CLOSED / APPROVED |
| SH-04.2 | CLOSED / APPROVED |
| SH-04.3 | CLOSED / APPROVED |
| SH-04.4 | CLOSED / APPROVED / PASS_UPDATE_ROLLBACK_CAPABILITY |
| SH-04.4A | CLOSED / APPROVED |
| SH-04.4B | CLOSED / APPROVED |
| SH-04.4C | CLOSED / APPROVED / PASS_UPDATE_CAPABILITY (C.0 CLOSED / BLOCKED_ACTIONABLE; C.1 CLOSED / APPROVED / PASS_TOOLING; C.1-R3 CLOSED / APPROVED / PASS_JQ_PREFLIGHT_FIX; C.2-P0 CLOSED / APPROVED / PASS_READINESS; C.2-A CLOSED / APPROVED / PASS_IMPLEMENTATION; C.2-B base fixture probe CLOSED / APPROVED / PASS_BASE_FIXTURE_PROBE; C.2-B attempt #4 CLOSED / APPROVED / PASS_RUNTIME_UPDATE; C.2 CLOSED / APPROVED / PASS_RUNTIME_UPDATE_CAPABILITY) |
| SH-04.4D | CLOSED / APPROVED / PASS_R2_RUNTIME_COMPATIBLE_ROLLBACK |
| SH-04.4E | CLOSED / APPROVED / PASS_FINAL_ACCEPTANCE |
| SH-04.5A | CLOSED / APPROVED / PASS_RUNBOOK_DISCOVERY |
| SH-04.5B | CLOSED / APPROVED / PASS_RUNBOOK_IMPLEMENTATION |
| SH-04.5 | CLOSED / APPROVED / PASS_TECHNICAL_RUNBOOK |

El runbook técnico permanente de SH-04 está en
[SUPABASE_SELF_HOSTED_OPERATIONS_RUNBOOK.md](SUPABASE_SELF_HOSTED_OPERATIONS_RUNBOOK.md).
SH-04 queda `CLOSED / APPROVED`; el handoff es SH-05 — Portabilidad reproducible,
que está `ACTIVE`. SH-05.0 queda `CLOSED / APPROVED /
PASS_PORTABILITY_DISCOVERY`; SH-05.1 queda `CLOSED / APPROVED`; SH-05.2 está
`ACTIVE`; SH-05.2A queda `CLOSED / APPROVED /
PASS_CANONICAL_SECURITY_AUDIT_REALIGNMENT`; SH-05.2B queda `CLOSED / APPROVED /
PASS_PULL_ONLY_IMAGE_AUTHORITY`; SH-05.2C queda `CLOSED / APPROVED /
PASS_RECONSTRUCTION_MANIFEST_BINDING`; SH-05.2D queda `CLOSED / APPROVED /
PASS_PROTECTED_EXACT_GENERATION_TRANSPORT`; SH-05.2E queda `CLOSED / APPROVED /
PASS_CLEAN_HOST_IDENTITY_EMPTY_STATE_GATE` y SH-05.2F queda `IMPLEMENTED /
PENDING ARCHITECTURAL REVIEW`.

#### Cierre SH-04.3 — Secretos, Auth y compatibilidad recovery

SH-04.3D queda `CLOSED / APPROVED`. D.6 — aceptación final de
rotación/recovery — cerró `PASS` y su R1A forensics confirmó el backup set
pre-cutover `20260830T135345Z-a1b3d14d` como copia exacta recuperable, con
asociación GEN7 resoluble. El falso negativo inicial fue de lookup/resolución,
no una pérdida; el basename físico es `backup-<backupId>`.

SH-04.3E — Compatibilidad recovery tras rotación — cerró `CLOSED / APPROVED /
PASS`. La baseline D5 `20260830T201300Z-aefc033f` fue verificada y restaurada
destructivamente una vez con el checkpoint defensivo distinto
`20260831T004014Z-e69d3fca`; D5 TARGET permaneció `CURRENT / MATCH` y la
aceptación post-restore pasó. El checkpoint histórico GEN7 sigue retenido y no
es fuente de restore same-host ordinario con D5 activa. SH-04.3F — Aceptación
operativa final — cerró `CLOSED / APPROVED / PASS` con
`SH043_FINAL_OPERATIONAL_ACCEPTANCE_PASS`: regresión no mutante aprobada y
ventana de estabilidad de 300 segundos con 13/13 identidades y reinicios sin
cambios. SH-04.3 queda `CLOSED / APPROVED`; el siguiente bloque es SH-04.4.

Construye y demuestra capacidades técnicas: persistencia e inventario de
volúmenes/datos; backup de PostgreSQL, objetos Storage y configuración necesaria
para reconstrucción; restore demostrado; estrategia de secretos; hardening de
Auth; actualización del bundle upstream; rollback; y un runbook técnico mínimo.
SMTP queda deferred by product decision y no es una capacidad obligatoria del
producto Godel actual.

SH-04 no sustituye PPO-06 ni PPO-07:

```text
SH-04
→ demuestra técnicamente backup, restore, update y rollback

PPO-06
→ operacionaliza backup/recovery en el host productivo seleccionado: periodicidad,
  retención, ubicación y procedimiento de desastre

PPO-07
→ operacionaliza monitoreo, logs, métricas, alertas y soporte
```

No define todavía retenciones ni cron productivo.

### SH-05 — Portabilidad reproducible

SH-05 demuestra que la instalación puede reconstruirse desde repositorio,
configuración externa, secretos y backups en un **compatible clean Linux Docker
host**. Hosting DC es el proveedor actualmente seleccionado para PPO, no una
dependencia codificada de SH. La primera prueba deberá usar Linux amd64; la
compatibilidad incluye arquitectura.

```text
host A
→ backup/export
→ host limpio B
→ restore/rebuild
→ Godel operativo
```

No ejecuta despliegue productivo ni sobre una VPS real ni sobre un host de
empresa. PPO-04 usará el contrato cerrado de SH para el despliegue autorizado al
VPS seleccionado; PPO-10 queda reservado para una migración futura que llegue a
ser necesaria.

| Subbloque | Estado |
| --- | --- |
| SH-05.0 — Discovery and target realignment | CLOSED / APPROVED / PASS_PORTABILITY_DISCOVERY |
| SH-05.1 — Clean-host portability contract and tooling design | CLOSED / APPROVED |
| SH-05.2 — Minimal clean-host portability tooling | ACTIVE |
| SH-05.2A — Canonical security audit realignment | CLOSED / APPROVED / PASS_CANONICAL_SECURITY_AUDIT_REALIGNMENT |
| SH-05.2B — Pull-only image authority lock | CLOSED / APPROVED / PASS_PULL_ONLY_IMAGE_AUTHORITY |
| SH-05.2C — Reconstruction manifest and input binding | CLOSED / APPROVED / PASS_RECONSTRUCTION_MANIFEST_BINDING |
| SH-05.2D — Protected exact generation export / import | CLOSED / APPROVED / PASS_PROTECTED_EXACT_GENERATION_TRANSPORT |
| SH-05.2E — Clean-host identity and empty-state gate | CLOSED / APPROVED / PASS_CLEAN_HOST_IDENTITY_EMPTY_STATE_GATE |
| SH-05.2F — Immutable pull-only image acquisition | IMPLEMENTED / PENDING ARCHITECTURAL REVIEW |
| SH-05.3 — Disposable clean-host reconstruction rehearsal | NOT STARTED |
| SH-05.4 — Functional acceptance, cleanup, documentation and SH closure | NOT STARTED |

La evidencia canónica de SH-05.0 está en
[SH-05.0 — Descubrimiento de portabilidad](SH_05_PORTABILITY_DISCOVERY.md).
El contrato de SH-05.1 está en
[SH-05.1 — Contrato de portabilidad clean-host](SH_05_CLEAN_HOST_PORTABILITY_DESIGN.md).

## Secuencia integrada y gates

La ruta activa aprobada es:

```text
PPO-03E ✅
    │
    ▼
PPO-03F ✅
    │
    ▼
SH-02 ✅
    │
    ▼
SH-03 ✅
    │
    ▼
PPO-03G ✅
    │
    ▼
PPO-03 ✅
    │
    ▼
SH-04
    │
    ▼
SH-05
    │
    ▼
SH ✅
```

PPO-03F cerró/aprobó el lifecycle de Storage: `reserved → upload → finalize →
committed`, además de abandono, expiración, reconciliación y cleanup, con
idempotencia, autoridad de eliminación y trazabilidad mínima. SH-02 y SH-03
ya están cerrados/aprobados; este roadmap conserva esos internals como historia
y entrega el siguiente bloque técnico a SH-05.

SH-03 precedió PPO-03G porque este fue el gate final de Storage. PPO-03G se
apoyó en evidencia de `Browser → Nginx → Supabase self-hosted Storage` y
`Next Docker → api-gw`, no únicamente en desarrollo local. Validó bytes y
control plane, retiró los límites transitorios de 110 MB en Next/Nginx, cerró
TD-UPLOAD-001 y completó la documentación de PPO-03. SH-04 queda
`CLOSED / APPROVED`: SH-04.0, SH-04.1, SH-04.2 y SH-04.3 quedan
`CLOSED / APPROVED`; el handoff cerrado es SH-04.4A–C
`CLOSED / APPROVED` → SH-04.4D
`CLOSED / APPROVED / PASS_R2_RUNTIME_COMPATIBLE_ROLLBACK` → SH-04.4E
`CLOSED / APPROVED / PASS_FINAL_ACCEPTANCE` → SH-04.4
`CLOSED / APPROVED / PASS_UPDATE_ROLLBACK_CAPABILITY` → SH-04.5A
`CLOSED / APPROVED / PASS_RUNBOOK_DISCOVERY` → SH-04.5B
`CLOSED / APPROVED / PASS_RUNBOOK_IMPLEMENTATION` → SH-04.5
`CLOSED / APPROVED / PASS_TECHNICAL_RUNBOOK`. El siguiente bloque es SH-05
`ACTIVE`; SH-05.0 queda `CLOSED / APPROVED / PASS_PORTABILITY_DISCOVERY`
y SH-05.1 queda `CLOSED / APPROVED`; SH-05.2 está `ACTIVE`; SH-05.2A queda
`CLOSED / APPROVED / PASS_CANONICAL_SECURITY_AUDIT_REALIGNMENT`; SH-05.2B
queda `CLOSED / APPROVED / PASS_PULL_ONLY_IMAGE_AUTHORITY`; SH-05.2C queda
`CLOSED / APPROVED / PASS_RECONSTRUCTION_MANIFEST_BINDING`; SH-05.2D queda
`CLOSED / APPROVED / PASS_PROTECTED_EXACT_GENERATION_TRANSPORT`; SH-05.2E queda
`CLOSED / APPROVED / PASS_CLEAN_HOST_IDENTITY_EMPTY_STATE_GATE` y SH-05.2F
queda `IMPLEMENTED / PENDING ARCHITECTURAL REVIEW`.

## Gobernanza de la baseline DB

PPO-03F fue la última oportunidad para evaluar si el lifecycle de Storage exigía
un amendment excepcional de la baseline consolidada 01–06:

```text
PPO-03F.0
→ analizar necesidad DB

si NO:
  baseline permanece intacta

si SÍ:
  amendment explícitamente aprobado
  + fresh rebuild 01–06
  + QA
```

PPO-03F cerró/aprobó y `BASELINE 01–06 = FROZEN`. Todo cambio de base de datos
posterior deberá ser una migración nueva `07+`; no se reescribirán 01–06.

## Relación con PPO posterior

Una vez cerrados PPO-03 y SH, la secuencia de PPO continúa así:

```text
PPO-01E / PPO-01F
        │
        ▼
PPO-04
        │
        ▼
PPO-05
        │
        ▼
PPO-06
        │
        ▼
PPO-07
        │
        ▼
PPO-08
        │
        ▼
PPO-09
        │
        ▼
PPO-10
```

PPO-01C/D son evidencia histórica de un camino company-host que fue superseded
antes de ejecutarse. PPO-01E (auditoría provider-neutral de readiness VPS/Linux
Docker host) y PPO-01F (veredicto final) sustituyen ese gate; PPO-01F aprobado
es obligatorio antes de PPO-04.

PPO-04 será el despliegue operativo privado al VPS seleccionado. No declara
exposición pública automática: PPO-05 conserva el gate de rate limiting,
antiabuso, protección de `/solicitud` y `/estado`, política de requests
públicas, hardening y revisión de uploads. Las decisiones de dominio, TLS,
firewall o túnel se toman sólo detrás del gate aplicable.

PPO-06 operacionaliza en el host productivo seleccionado las capacidades
probadas en SH-04: frecuencia, retención, ubicación, copia secundaria,
responsabilidades, restore drills y recuperación ante desastre. PPO-07 conserva
observabilidad, logs, métricas, alertas, runbooks y operación cotidiana. PPO-08
conserva UAT; PPO-09, estabilización; y PPO-10 queda como migración futura
opcional de proveedor/infraestructura si llega a requerirse.
