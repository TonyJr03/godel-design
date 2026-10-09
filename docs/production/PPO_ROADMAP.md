# PPO — Preproducción y Puesta en Operación

## Metadatos

- Actualización de estado: 2026-10-09

- Proyecto: Godel Diseño
- Estado: Activo
- Fecha de creación: 2026-07-21
- Última revisión: 2026-10-09
- Responsable técnico: Dirección Técnica de Godel Diseño
- Arquitectura y supervisión: Arquitectura Senior / Orquestación Técnica
- Implementación: Agente Codex en VS Code

## Propósito

PPO lleva el sistema desde el MVP interno funcional hasta una operación real
controlada, segura, reproducible, recuperable, observable y validada por
usuarios.

La iniciativa diferencia ahora tres momentos operativos:

1. Preparación y validación en desarrollo/preproducción.
2. Managed Free Production Pilot sobre Vercel Hobby y Supabase Managed Free.
3. Investigación Lightweight Self-Hosted posterior, alimentada por medidas
   reales del piloto.

## 2026-09-16 — Architectural / Economic Hosting Pivot

La ruta anterior era:

```text
VPS + full Supabase Self-Hosted
```

Su estado es:

```text
SUPERSEDED FOR CURRENT PRODUCTION PILOT
NOT EXECUTED
```

El pivot responde a viabilidad económica y al presupuesto actual de un proyecto
personal/no comercial. No declara un fallo técnico de Supabase Self-Hosted ni
reescribe las aprobaciones SH-01–SH-04. El cierre/handoff vive en
[PPO-04 — Cierre del camino Self-Hosted VPS](PPO_04_SELF_HOSTED_VPS_PATH_CLOSURE.md).

La ruta actual es:

```text
Vercel Hobby
+
Supabase Managed Free
```

La ruta futura aprobada es:

```text
Managed measurements
→ LSH
→ Supabase Slim
→ decision gate
→ lightweight Supabase OR PostgreSQL/PostgREST/Auth/Storage
```

El deployment técnico de Vercel Production está `READY`, su aceptación es
`PASS` y su exposición permanece `PROTECTED`. El pilot rollout todavía no se ha
ejecutado.

## Decisiones arquitectónicas confirmadas

- La iniciativa se denomina PPO y sigue siendo el roadmap maestro.
- El primer destino real es Vercel Hobby + Supabase Managed Free.
- Godel Diseño se considera actualmente personal/no comercial. Si su uso cambia
  materialmente, deberá reevaluarse la elegibilidad del plan de hosting.
- No hay Nginx, Docker, VPS ni Supabase Self-Hosted en el runtime productivo del
  Managed Free Pilot.
- Desarrollo/E2E conserva Next.js development + Supabase CLI/local workflow.
- Los archivos siguen siendo privados y sus bytes no atraviesan Server Actions.
- PPO-05 conserva seguridad pública/antiabuso; PPO-06 backup/recovery managed;
  PPO-07 observabilidad y operación managed.
- La baseline 01–06 permanece congelada; cualquier cambio posterior usa 07+.
- Full Supabase Self-Hosted queda congelado como referencia técnica.
- LSH queda planificado, no iniciado, y empieza después de medir uso real.
- PPO-10 solo gobernará una eventual migración productiva posterior a la
  decisión de LSH; no duplica su investigación ni su prototipo.

Las referencias a Windows/WSL2, company-host, LAN provisional, Cloudflare Tunnel
u OVHcloud pertenecen a contexto histórico cuando aparezcan en evidencia cerrada;
no son arquitectura operativa vigente. Las decisiones de fases posteriores no se
declaran implementadas en este roadmap.

## Arquitectura backend vigente

```text
DEVELOPMENT / E2E
Next.js development + Supabase CLI/local workflow

CURRENT PRODUCTION TARGET
Vercel Hobby / Next.js + Supabase Managed Free

FUTURE SELF-HOSTED R&D
LSH → Supabase Slim → decision gate
```

PPO-02/PPO-03 contienen evidencia histórica de compatibilidad managed que vuelve
a ser relevante, pero no constituye aceptación del nuevo entorno productivo.
PPO-04M debe ejecutar su propia validación.

## Integración de los workstreams Self-Hosted

Este documento sigue siendo el roadmap maestro de Preproducción y Puesta en
Operación. [SH — Roadmap de transición a Supabase Self-Hosted](SH_ROADMAP.md)
conserva el workstream full-stack como referencia técnica subordinada. No es el
target productivo actual. [LSH — Lightweight Self-Hosted](LSH_ROADMAP.md) es el
nuevo workstream futuro, también subordinado a PPO y todavía no iniciado.

La secuencia originalmente prevista fue la siguiente; su cierre final no se
alcanzó porque SH-05 quedó pausado:

```text
SH-02
→ SH-03
→ PPO-03G
→ PPO-03 CLOSED
→ SH-04
→ SH-05
→ SH CLOSED
```

PPO-03F cerró/aprobó expiración, abandono, reconciliación, cleanup, idempotencia,
autoridad de eliminación y trazabilidad del lifecycle de Storage. SH-02 es el
siguiente bloque e integra PPO-02 con el backend self-hosted; SH-03 prueba esas
fronteras antes del gate final PPO-03G.
Por tanto, PPO-03G no puede cerrar Storage solo con evidencia de desarrollo/E2E
local.

Estado histórico preservado: SH-02 = CLOSED / APPROVED; SH-03 = CLOSED / APPROVED;
PPO-03G = CLOSED / APPROVED; PPO-03 = CLOSED / APPROVED; SH-04 = CLOSED / APPROVED;
SH-05 = PAUSED / INCOMPLETE. SH-05.0, SH-05.1 y SH-05.2 conservan
sus cierres aprobados; SH-05.3 = PARTIALLY PROVEN / DEFERRED y SH-05.4 =
DEFERRED. La evidencia y las brechas se consolidan en
[SH-05 — Handoff del rehearsal clean-host](SH_05_REHEARSAL_HANDOFF.md).

PPO-03F.0 aprobó el último amendment excepcional de la baseline consolidada
01–06. PPO-03F.1 lo implementó y exigió fresh rebuild 01–06 y QA. PPO-03F
cerró/aprobó y `BASELINE 01–06 = FROZEN`; todo cambio DB posterior deberá usar
una migración `07+`.

PPO-01C/D fueron superseded y no ejecutados porque company-host dejó de ser el
target. El trabajo residual PPO-01E/F de readiness VPS/Linux Docker se difiere a
LSH o a un futuro self-host autorizado y deja de ser gate del piloto actual.
PPO-04 queda `ACTIVE / NEXT` mediante PPO-04M. El backup externo mínimo pertenece
al piloto managed; PPO-06 lo operacionalizará en profundidad y PPO-07 conserva
observabilidad, logs, métricas, alertas y soporte adaptados a los proveedores.
PPO-04M.0 queda `CLOSED / APPROVED` mediante
[PPO_04M0_MANAGED_ARCHITECTURE_AUDIT.md](PPO_04M0_MANAGED_ARCHITECTURE_AUDIT.md);
PPO-04M.1 queda `CLOSED / APPROVED` mediante
[PPO_04M1_SUPABASE_FREE_PROJECT_REPORT.md](PPO_04M1_SUPABASE_FREE_PROJECT_REPORT.md);
PPO-04M.2 queda `CLOSED / APPROVED`: M.2A y M.2B están `CLOSED / APPROVED`,
con evidencia estructural y funcional en
[PPO_04M2_MANAGED_PROVISIONING_REPORT.md](PPO_04M2_MANAGED_PROVISIONING_REPORT.md).
PPO-04M.3 queda `CLOSED / APPROVED`; PPO-04M.4 queda `CLOSED / QUALIFIED
PRODUCTION QA ACCEPTANCE`. Los cierres y la evidencia histórica de M.5.0–M.5.2
se conservan, incluido el primer backup Productivo y su custodia externa.
PPO-04M.5.3 queda `SUSPENDED / SUPERSEDED`: el harness complejo se congela como
tooling experimental y deja de ser la ruta activa.

PPO-04M.6 queda `ACTIVE` con M.6.0 `REVIEWED / CLOSED` y M.6.1
`REVIEWED / CLOSED`. Simple Backup V1 queda `REVIEWED / APPROVED / REAL
PRODUCTION BACKUP VERIFIED`; Real Production Backup #3 quedó `PASS / ARTIFACT
VERIFIED LOCALLY`.
M.6.2 queda `REVIEWED / CODE COMPLETE`; Simple Restore V1 queda `REAL MANAGED
RECOVERY VERIFIED INCLUDING NON-EMPTY STORAGE`. M.6.3 queda `REVIEWED / CLOSED`.
Se conserva el historial de hallazgos de Drills #1–#4. Drill #5 terminó `PASS /
STRUCTURAL + FUNCTIONAL RECOVERY VERIFIED` sobre un target Managed nuevo y
desechable: restore estructural, login Auth, perfil admin restaurado y smoke de
aplicación `6 OF 6` pasaron sin actividad Productiva. M.6.4 queda `ACTIVE` y
M.6.4A queda `REVIEWED / CLOSED`. Un source Managed desechable con un objeto de
68 bytes produjo el
backup real `GDBK-20261009T024741Z`, `PASS / REAL MANAGED VERIFIED`. Real
Restores #1 y #2 fallaron en `DATABASE COUNTS` con `storage.objects` `EXPECTED 1
/ ACTUAL 2`: Supabase CLI 2.109.1 conservó el basename local tanto con source
`godel-files` como con source `.`. La estrategia directory-root queda rechazada
y la corrección per-file exact-path terminó Real Restore #3 `PASS / REAL MANAGED
VERIFIED`, con paths exactos y round-trip byte-exact. TD-BACKUP-004 queda
`CLOSED`. M.6.4B queda `REVIEWED / CLOSED`: backup semanal durante actividad
operativa real, backup obligatorio antes de operaciones deliberadas de alto
riesgo, mínimo de cuatro backups exitosos retenidos y cleanup manual. M.6.4C
queda `REVIEWED / CLOSED`; el
[Backup Operations Runbook](PPO_04M6_BACKUP_OPERATIONS_RUNBOOK.md) es el entry
point operativo gobernante. M.6.4D queda `NEXT / OPTIONAL OFF-SITE DECISION`.
Production restore no está autorizado. El restore
automático aplica migrations, datos
y Storage, pero no ejecuta
`supabase config push` porque la configuración versionada contiene URLs
localhost de desarrollo.
El contrato vigente está en
[PPO-04M.6 — Simple Backup / Restore V1](PPO_04M6_SIMPLE_BACKUP_RESTORE_V1.md).

```text
PPO-04M.6.4C = REVIEWED / CLOSED
BACKUP OPERATIONS RUNBOOK = AVAILABLE / GOVERNING OPERATOR ENTRY POINT
CANONICAL BACKUP INTERFACE = scripts/backup-recovery/backup.ps1 -BackupRoot <path>
ROUTINE CADENCE = WEEKLY
HIGH-RISK PRE-BACKUP = REQUIRED
RETENTION = MINIMUM 4 SUCCESSFUL PRODUCTION BACKUPS
CLEANUP = MANUAL
PRODUCTION RESTORE = NOT AUTHORIZED
PPO-04M.6.4D = NEXT / OPTIONAL OFF-SITE DECISION
```

PPO-04 global continúa `ACTIVE / NEXT`; el Production pilot rollout permanece
`NOT EXECUTED`.

El gate de consistencia del harness Productivo exige inventarios Storage inicial
y final estructuralmente idénticos y una proyección local `path/size` exactamente
igual antes de bundle o publicación externa.

## Estado de fases

| Fase      | Nombre                                      | Estado    |
| --------- | ------------------------------------------- | --------- |
| PPO-00    | Baseline local y formalización inicial      | Cerrada   |
| PPO-01    | Auditoría de infraestructura y conectividad | Residual host-readiness deferred a LSH/self-host futuro |
| PPO-02    | Base reproducible / evidencia managed       | Cerrada; evidencia managed relevante otra vez |
| PPO-03    | Rediseño de cargas y almacenamiento         | Cerrada / aprobada |
| PPO-04    | Managed Free Production Pilot              | ACTIVE / NEXT — deployment ready/protected; rollout pendiente |
| PPO-05    | Seguridad pública                           | Pendiente |
| PPO-06    | Backups y recuperación                      | Pendiente |
| PPO-07    | Observabilidad y operación                  | Pendiente |
| PPO-08    | UAT y puesta en operación                   | Pendiente |
| PPO-09    | Estabilización                              | Pendiente |
| PPO-10    | Gobernanza de eventual migración productiva post-LSH | Deferred / optional; no duplica LSH |
| PPO-QA-01 | Consolidación y aislamiento de la suite E2E | Diferida  |

PPO-QA-01 no bloquea PPO-01, conserva el trabajo archivado y deberá resolverse
antes del cierre definitivo de la puesta en producción.

El plan operativo gobernante de la fase activa es
[PPO-04 — Managed Free Production Pilot](PPO_04_MANAGED_FREE_PILOT_PLAN.md).
El contrato de backup/recovery mínimo y el core local de tooling están en
[PPO-04M.5 — Managed Backup & Recovery Architecture](PPO_04M5_BACKUP_RECOVERY_DESIGN.md),
con transporte secreto de base de datos y orden de restore metadata/bytes
localmente probados. `M.5.2 = First Production Backup + External Custody` y
`M.5.3 = Restore Drill + Baseline Closure`. M.5.2 está cerrado con el primer
backup Production y custodia externa verificados. M.5.3A cerró aprobados los
contratos locales de source verification. M.5.3B implementó autoridad Git del
runtime, target aislado, planes de restore, sanitización Auth, gates DB/Storage y
cleanup mediante fixtures/adapters. Las correcciones separan el catálogo real
del conjunto mutable, admiten status Supabase y metadata Docker mediante
boundaries confidenciales, convierten outputs SQL read-only en agregados
sanitizados, incluyen el UUID de `auth.identities` en la continuidad y definen
transfer/inventario S3 exclusivamente contra Storage local. El Attempt #1 real
alcanzó el start del target y falló en discovery por una suposición sintética
de service label; el contrato fue corregido y espera revisión arquitectónica.
El Attempt #2 se detuvo antes de iniciar el target: el entorno Git mínimo no
transportó la autoridad protegida efectiva de `safe.directory` requerida por
el host. El tooling ahora construye una autoridad Git command-scoped
determinista para el repo gobernado. El Attempt #4 alcanzó aislamiento y las seis
queries read-only, y reveló que el query de extensiones inventariaba el set
global mientras su parser aplicaba un contrato más estrecho. El query queda
reducido a la extensión requerida y Attempt #5 no está autorizado.
No se ejecutaron lectura R2, decrypt age, SQL de restore ni restore.

```text
PPO-04M.5.3A = CLOSED / SOURCE VERIFICATION TOOLING APPROVED
PPO-04M.5.3B = CLOSED / ISOLATED TARGET + RESTORE TOOLING APPROVED
PPO-04M.5.3B.2 = CLOSED / REAL LOCAL TARGET COMPATIBILITY VERIFIED
PPO-04M.5.3C.0 = CLOSED / REAL RESTORE EXECUTION CONTRACT APPROVED
PPO-04M.5.3C.1.1 = CLOSED / RESTORE MUTATION + BOUNDARY HARDENING APPROVED
PPO-04M.5.3C.1 = CLOSED / REAL RESTORE ORCHESTRATOR TOOLING APPROVED
PPO-04M.5.3C.1 APPROVED TOOLING SHA = 5e257838cdf73df1a3f07d3473b6d65bf5f4595c
PPO-04M.5.3D.0 = CLOSED / VALIDATION + BASELINE CLOSURE CONTRACT APPROVED
PPO-04M.5.3D.1 = CLOSED / RECOVERY APPLICATION VALIDATION TOOLING APPROVED
PPO-04M.5.3D.1 APPROVED TOOLING SHA = 0b8ab995221c7fedde28f5567831810e13085eaf
PPO-04M.5.3D.1.1 = CLOSED / APPLICATION RUNTIME AUTHORITY CORRECTION APPROVED
PPO-04M.5.3D.2 = CLOSED / REAL LOCAL RECOVERY APPLICATION COMPATIBILITY VERIFIED
PPO-04M.5.3D.2.1 = REAL-ENVIRONMENT CORRECTION VERIFIED BY ATTEMPT #2
PPO-04M.5.3D.2.2 = CLOSED / HEALTH DIAGNOSTIC + COLD-START HARDENING APPROVED
PPO-04M.5.3D.2.3 = REAL-ENVIRONMENT DIAGNOSTIC VERIFIED BY ATTEMPT #4
PPO-04M.5.3D.2.4 = REAL-ENVIRONMENT MOUNT + TOPOLOGY PATH VERIFIED / LIVE 5XX PERSISTS
PPO-04M.5.3D.2.5 = REAL-ENVIRONMENT REQUEST-SCOPED DIAGNOSTIC VERIFIED BY ATTEMPT #6
PPO-04M.5.3D.2.6 = REAL-ENVIRONMENT SAFE TAXONOMY VERIFIED BY ATTEMPT #7
PPO-04M.5.3D.2.7 = CLOSED / REAL-ENVIRONMENT PRODUCT DEFAULT DISTDIR VERIFIED / NOT CAUSAL FOR THE LIVE FAILURE / ARCHITECTURAL FIDELITY IMPROVEMENT RETAINED
PPO-04M.5.3D.2.8 = CLOSED / WINDOWS SAME-VOLUME APPLICATION RUNTIME TOPOLOGY / REAL-ENVIRONMENT VERIFIED BY ATTEMPT #9
BYTE-EXACT APP RUNTIME AUTHORITY = RETAINED FOR APPLICATION SOURCE / CONFIG / PACKAGE LOCK
PACKAGE.JSON SCRIPTS-ONLY OPERATIONAL DRIFT = SEMANTICALLY EXCLUDED
PACKAGE.JSON NON-SCRIPT FIELDS = EXACT AUTHORITY
TEMPORARY APP PACKAGE.JSON = PRODUCTION RUNTIME AUTHORITY
REAL_SHA_APP_RUNTIME_AUTHORITY = PASS
PPO-04M.5.3 = ACTIVE / ICEBERG FK CLOSURE DIAGNOSTIC
REAL LOCAL TARGET = VERIFIED
APPLICATION CLEANUP FAILURE DETECTED IN D.2 ATTEMPT #1 = YES / RECOVERY_APP_CLEANUP_INCOMPLETE
TARGET CLEANUP FAILURE DETECTED IN D.2 ATTEMPT #1 = NO
SESSION CLEANUP FAILURE DETECTED IN D.2 ATTEMPT #1 = NO
REAL RESTORE ATTEMPTS #1-#2 = EXECUTED / FAIL-CLOSED
REAL LOCAL RESTORE TARGET = NOT REACHED BY ATTEMPTS #1-#2
PRODUCTION RESTORE = NOT AUTHORIZED
REAL R2 RECOVERY READ = EXECUTED READ-ONLY IN ATTEMPT #2 / 3 OPERATIONS
REAL AGE DECRYPT = EXECUTED IN ATTEMPT #2 / 1 OPERATION
PRODUCTION MUTATIONS = 0
PPO-04M.5.3B.2 ATTEMPT #5 = PASS / REAL LOCAL TARGET COMPATIBILITY VERIFIED
REAL RESTORE ATTEMPT #1 = FAIL / PREFLIGHT OPERATOR CONFIGURATION
REAL RESTORE ATTEMPT #2 = FAIL / SOURCE_VERIFY REAL BACKUP SQL DIALECT ADMISSION FINDING
REAL RESTORE ATTEMPT #3 = NOT AUTHORIZED / PENDING FINAL DOCUMENTARY REVIEW
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #1 = FAIL / APPLICATION PROCESS SHUTDOWN LIFECYCLE FINDING
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #2 = FAIL / APPLICATION HEALTH GATE DIAGNOSTIC FINDING
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #3 = FAIL / LIVE ROUTE RESPONSE DIAGNOSTIC FINDING
ATTEMPT #3 FAILURE CODE = RECOVERY_APP_LIVE_RESPONSE_INVALID
ATTEMPT #3 PUBLIC PHASE = APP_LIVE
ATTEMPT #3 REAL TARGET STARTS = 1
ATTEMPT #3 TARGET BASELINE = PASS BY PHASE PROGRESSION
ATTEMPT #3 TARGET AUTH HEALTH = PASS BY PHASE PROGRESSION
ATTEMPT #3 APPLICATION RUNTIME AUTHORITY = PASS BY PHASE PROGRESSION
ATTEMPT #3 APPLICATION START = PASS BY PHASE PROGRESSION
ATTEMPT #3 LIVE REQUEST = COMPLETED
ATTEMPT #3 LIVE RESPONSE = INVALID / CLASS NOT AVAILABLE IN ATTEMPT #3
ATTEMPT #3 READY = NOT REACHED
ATTEMPT #3 BROWSER = NOT REACHED
ATTEMPT #3 CLEANUP CLASSIFICATION = NO CLEANUP FAILURE DETECTED BY PRECEDENCE
ATTEMPT #3 RESTORE SQL EXECUTIONS = 0
ATTEMPT #3 R2 READS = 0
ATTEMPT #3 AGE DECRYPTS = 0
ATTEMPT #3 PRODUCTION MUTATIONS = 0
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #4 = FAIL / TEMPORARY RUNTIME DEPENDENCY RESOLUTION FINDING
ATTEMPT #4 FAILURE CODE = RECOVERY_APP_LIVE_MODULE_RESOLUTION_FAILED
ATTEMPT #4 PUBLIC PHASE = APP_LIVE
ATTEMPT #4 REAL TARGET STARTS = 1
ATTEMPT #4 TARGET AUTH HEALTH = PASS BY PHASE PROGRESSION
ATTEMPT #4 APPLICATION START = PASS BY PHASE PROGRESSION
ATTEMPT #4 LIVE REQUEST = COMPLETED
ATTEMPT #4 LIVE RESPONSE = 5XX / MODULE_RESOLUTION_FAILURE
ATTEMPT #4 READY = NOT REACHED
ATTEMPT #4 BROWSER = NOT REACHED
ATTEMPT #4 CLEANUP = NO CLEANUP FAILURE DETECTED BY PRECEDENCE
ATTEMPT #4 RESTORE SQL EXECUTIONS = 0
ATTEMPT #4 R2 READS = 0
ATTEMPT #4 AGE DECRYPTS = 0
ATTEMPT #4 PRODUCTION MUTATIONS = 0
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #5 = FAIL / LIVE 5XX WITH ACCUMULATED MODULE-RESOLUTION DIAGNOSTIC
ATTEMPT #5 FAILURE CODE = RECOVERY_APP_LIVE_MODULE_RESOLUTION_FAILED
ATTEMPT #5 PUBLIC PHASE = APP_LIVE
ATTEMPT #5 REAL TARGET STARTS = 1
ATTEMPT #5 TARGET AUTH HEALTH = PASS BY PHASE PROGRESSION
ATTEMPT #5 DEPENDENCY MOUNT = PASS BY PHASE PROGRESSION
ATTEMPT #5 WORKER DEPENDENCY TOPOLOGY = PASS BY PHASE PROGRESSION
ATTEMPT #5 APPLICATION START = PASS BY PHASE PROGRESSION
ATTEMPT #5 LIVE REQUEST = COMPLETED
ATTEMPT #5 LIVE RESPONSE = 5XX
ATTEMPT #5 REQUEST-SCOPED ROOT DIAGNOSTIC = NOT AVAILABLE IN ATTEMPT #5
ATTEMPT #5 READY = NOT REACHED
ATTEMPT #5 BROWSER = NOT REACHED
ATTEMPT #5 CLEANUP = NO CLEANUP FAILURE DETECTED BY PRECEDENCE
ATTEMPT #5 RESTORE SQL EXECUTIONS = 0
ATTEMPT #5 R2 READS = 0
ATTEMPT #5 AGE DECRYPTS = 0
ATTEMPT #5 PRODUCTION MUTATIONS = 0
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #6 = FAIL / REQUEST-SCOPED MODULE RESOLUTION / SAFE TAXONOMY INSUFFICIENT
ATTEMPT #6 FAILURE CODE = RECOVERY_APP_LIVE_MODULE_UNKNOWN_FAILED
ATTEMPT #6 PUBLIC PHASE = APP_LIVE
ATTEMPT #6 REAL TARGET STARTS = 1
ATTEMPT #6 RESTORE SQL EXECUTIONS = 0
ATTEMPT #6 R2 READS = 0
ATTEMPT #6 AGE DECRYPTS = 0
ATTEMPT #6 PRODUCTION MUTATIONS = 0
ATTEMPT #6 CONCRETE ROOT CAUSE = NOT DEMONSTRATED
PPO-04M.5.3D.2 ATTEMPT #7 = FAIL / REQUEST-SCOPED RELATIVE IMPORT RESOLUTION FINDING
ATTEMPT #7 FAILURE CODE = RECOVERY_APP_LIVE_MODULE_RELATIVE_IMPORT_FAILED
ATTEMPT #7 PUBLIC PHASE = APP_LIVE
ATTEMPT #7 REAL TARGET STARTS = 1
ATTEMPT #7 RESTORE SQL EXECUTIONS = 0
ATTEMPT #7 R2 READS = 0
ATTEMPT #7 AGE DECRYPTS = 0
ATTEMPT #7 PRODUCTION MUTATIONS = 0
ATTEMPT #7 CONCRETE RELATIVE SPECIFIER = NOT EXPOSED
ATTEMPT #7 CONCRETE ROOT CAUSE = NOT PROVEN
PRODUCT DISTDIR = .next / DEFAULT
RECOVERY DISTDIR BEFORE D.2.7 = .next-recovery / PROGRAMMATIC OVERRIDE
PRODUCT TSCONFIG GENERATED TYPE PATHS = .next/types / .next/dev/types
PPO-04M.5.3D.2 ATTEMPT #8 = FAIL / RELATIVE IMPORT PERSISTS AFTER PRODUCT DISTDIR CORRECTION
ATTEMPT #8 FAILURE CODE = RECOVERY_APP_LIVE_MODULE_RELATIVE_IMPORT_FAILED
ATTEMPT #8 PUBLIC PHASE = APP_LIVE
ATTEMPT #8 REAL TARGET STARTS = 1
ATTEMPT #8 RESTORE SQL EXECUTIONS = 0
ATTEMPT #8 R2 READS = 0
ATTEMPT #8 AGE DECRYPTS = 0
ATTEMPT #8 PRODUCTION MUTATIONS = 0
ATTEMPT #8 PRODUCT DEFAULT DISTDIR = PASSED BY PHASE PROGRESSION
ATTEMPT #8 CONCRETE RELATIVE SPECIFIER = NOT EXPOSED
D.2.7 ROOT-CAUSE STATUS = NOT CAUSAL / ARCHITECTURAL FIDELITY IMPROVEMENT RETAINED
ROOT CAUSE = WINDOWS CROSS-VOLUME NEXT APP-ROUTER ENTRY CONSTRUCTION
ROOT CAUSE STATUS = CONFIRMED BY REAL-ENVIRONMENT ATTEMPT #9
PPO-04M.5.3D.2 ATTEMPT #9 = PASS / REAL LOCAL RECOVERY APPLICATION COMPATIBILITY VERIFIED
status = PASS
operation = real-local-recovery-application-compatibility
runtimeAuthority = VERIFIED
targetIsolation = VERIFIED
baselineMigrationCount = 6
targetAuthHealth = PASS
applicationRuntimeAuthority = VERIFIED
applicationStart = PASS
applicationLive = PASS
applicationReady = PASS
applicationLocalSupabaseReadiness = VERIFIED
loginSurface = PASS
anonymousInternalAccess = REJECTED
browserRemoteIsolation = VERIFIED
browserCleanup = PASS
applicationCleanup = PASS
targetCleanup = PASS
sessionCleanup = PASS
realTargetStarts = 1
restoreSqlExecutions = 0
realR2Reads = 0
realAgeDecrypts = 0
productionMutations = 0
ATTEMPT EXIT CODE = 0
D.2 FINAL REAL ATTEMPT = #9 / PASS
D.2 FINAL VERIFIED CAPABILITIES = runtime authority / local target isolation / baseline 01-06 / direct local Auth health / Product application startup / live health / ready health / local Supabase readiness / login surface / anonymous internal rejection / browser remote isolation / browser cleanup / application cleanup / target cleanup / session cleanup
D.2 RESTORE ACTIVITY = NONE
D.2 R2 ACTIVITY = NONE
D.2 AGE DECRYPT ACTIVITY = NONE
D.2 PRODUCTION MUTATIONS = NONE
REAL TARGET STARTS DURING D.2.8 CORRECTION = 0
REAL APP STARTS DURING D.2.8 CORRECTION = 0
REAL CHROMIUM STARTS DURING D.2.8 CORRECTION = 0
RESTORE SQL EXECUTIONS DURING D.2.8 CORRECTION = 0
R2 READS DURING D.2.8 CORRECTION = 0
AGE DECRYPTS DURING D.2.8 CORRECTION = 0
PRODUCTION ACTIVITY DURING D.2.8 CORRECTION = 0
REAL TARGET STARTS DURING D.2.7 CORRECTION = 0
REAL APP STARTS DURING D.2.7 CORRECTION = 0
REAL CHROMIUM STARTS DURING D.2.7 CORRECTION = 0
RESTORE SQL EXECUTIONS DURING D.2.7 CORRECTION = 0
R2 READS DURING D.2.7 CORRECTION = 0
AGE DECRYPTS DURING D.2.7 CORRECTION = 0
PRODUCTION ACTIVITY DURING D.2.7 CORRECTION = 0
REAL TARGET STARTS DURING D.2.5 CORRECTION = 0
REAL APP STARTS DURING D.2.5 CORRECTION = 0
REAL CHROMIUM STARTS DURING D.2.5 CORRECTION = 0
RESTORE SQL EXECUTIONS DURING D.2.5 CORRECTION = 0
R2 READS DURING D.2.5 CORRECTION = 0
AGE DECRYPTS DURING D.2.5 CORRECTION = 0
PRODUCTION ACTIVITY DURING D.2.5 CORRECTION = 0
REAL TARGET STARTS DURING D.2.4 CORRECTION = 0
REAL APP STARTS DURING D.2.4 CORRECTION = 0
REAL CHROMIUM STARTS DURING D.2.4 CORRECTION = 0
RESTORE SQL EXECUTIONS DURING D.2.4 CORRECTION = 0
R2 READS DURING D.2.4 CORRECTION = 0
AGE DECRYPTS DURING D.2.4 CORRECTION = 0
PRODUCTION ACTIVITY DURING D.2.4 CORRECTION = 0
REAL TARGET STARTS DURING D.2.3 CORRECTION = 0
REAL APP STARTS DURING D.2.3 CORRECTION = 0
REAL CHROMIUM STARTS DURING D.2.3 CORRECTION = 0
RESTORE SQL EXECUTIONS DURING D.2.3 CORRECTION = 0
R2 READS DURING D.2.3 CORRECTION = 0
AGE DECRYPTS DURING D.2.3 CORRECTION = 0
PRODUCTION ACTIVITY DURING D.2.3 CORRECTION = 0
ATTEMPT #2 CLEANUP CLASSIFICATION = NO CLEANUP FAILURE DETECTED BY PRECEDENCE
ATTEMPT #2 BROWSER REACHED = NO
REAL TARGET STARTS DURING D.2.2 CORRECTION = 0
REAL APP STARTS DURING D.2.2 CORRECTION = 0
REAL CHROMIUM STARTS DURING D.2.2 CORRECTION = 0
RESTORE SQL EXECUTIONS DURING D.2.2 CORRECTION = 0
R2 READS DURING D.2.2 CORRECTION = 0
AGE DECRYPTS DURING D.2.2 CORRECTION = 0
PRODUCTION ACTIVITY DURING D.2.2 CORRECTION = 0
REAL TARGET STARTS DURING D.2.1 CORRECTION = 0
REAL APP STARTS DURING D.2.1 CORRECTION = 0
REAL CHROMIUM STARTS DURING D.2.1 CORRECTION = 0
RESTORE SQL EXECUTIONS DURING D.2.1 CORRECTION = 0
R2 READS DURING D.2.1 CORRECTION = 0
AGE DECRYPTS DURING D.2.1 CORRECTION = 0
PRODUCTION ACTIVITY DURING D.2.1 CORRECTION = 0
REAL BACKUP RESTORE EXECUTION = ATTEMPTS #1-#2 EXECUTED / ATTEMPT #3 NOT AUTHORIZED
TD-BACKUP-004 = OPEN
PRIVATE DOWNLOAD = NOT EXERCISED IN EMPTY-STORAGE DRILL / IMPORTANT AFTER PILOT
REMOTE ACTIVITY = 3 READ-ONLY R2 OPERATIONS IN ATTEMPT #2
REAL TARGET STARTS DURING C.1 = 0
TARGET MUTATIONS = 0
RESTORE SQL EXECUTION = 0
REAL APP STARTS DURING D.1 = 0
REAL LOGIN ATTEMPTS DURING D.1 = 0
RETRIES = 0
```
+




### PPO-04M.5.3 — Local source diagnostic #1

El diagnóstico local confirmó que el wrapper data-only exacto de Supabase CLI
2.109.1 no estaba modelado por el dialecto managed. El backup no se declara
corrupto. La remediación clasifica el wrapper como transporte no ejecutable y
mantiene Attempt #3 bloqueado hasta revisión y autorización separadas.

```text
LOCAL MANAGED RECOVERY SOURCE DIAGNOSTIC #1 = FINDING / SQL_ADMISSION
TOOLING SHA = 5f1f4ddb2f7dfe1b7d15d1c14ec8fccd9195737f
statementClass = SET_PARAMETER
setParameter = session_replication_role
localAgeDecrypts = 1
realR2Reads = 0
realTargetStarts = 0
sqlExecutions = 0
productionMutations = 0
cleanup = PASS
SQL DIALECT ROOT CAUSE = SUPABASE CLI V2.109.1 DATA-ONLY WRAPPER NOT YET MODELED
OBSERVED WRAPPER PREFIX = SET session_replication_role = replica;
EXPECTED UPSTREAM WRAPPER SUFFIX = RESET ALL;
PPO-04M.5.3 = ACTIVE / PG_DUMP SEQUENCE SET REMEDIATION
REAL RESTORE ATTEMPT #3 = NOT AUTHORIZED
LOCAL SOURCE DIAGNOSTIC #2 = CLOSED / FINDING CONFIRMED
LOCAL SOURCE DIAGNOSTIC #3 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
```

### PPO-04M.5.3 — Local source diagnostic #2

Diagnostic #2 confirmó que la forma canonical Productiva de `pg_dump` para
`SEQUENCE SET` no estaba representada por el parser legacy. La remediación queda
acotada a identifiers citados gobernados, `int64` y boolean exactos; no se
declara corrupción del backup ni se autoriza Diagnostic #3 o Attempt #3.

```text
LOCAL MANAGED RECOVERY SOURCE DIAGNOSTIC #2 = FINDING / SQL_ADMISSION
TOOLING SHA = 86a3b15073f924031116675e22dce056323d3fc7
statementClass = SELECT_PG_CATALOG_SETVAL_VARIANT
setParameter = NOT_APPLICABLE
localAgeDecrypts = 1
realR2Reads = 0
realTargetStarts = 0
sqlExecutions = 0
productionMutations = 0
cleanup = PASS
DIAGNOSTIC #2 ROOT CAUSE = PG_DUMP SEQUENCE SET FORMAT NOT REPRESENTED BY CURRENT SETVAL ADMISSION
CURRENT PARSER EXPECTATION = LEGACY ::regclass FORM
UPSTREAM PG_DUMP CONTRACT = QUALIFIED SEQUENCE NAME STRING + INT64 + BOOLEAN / NO ::regclass
SUPABASE CLI 2.109.1 = DATA-ONLY + QUOTE-ALL-IDENTIFIER
PPO-04M.5.3 = ACTIVE / PG_DUMP SEQUENCE SET REMEDIATION
LOCAL SOURCE DIAGNOSTIC #2 = CLOSED / FINDING CONFIRMED
LOCAL SOURCE DIAGNOSTIC #3 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #3 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
```

### PPO-04M.5.3 — Local source diagnostic #3 closure

Diagnostic #3 comprobó la admisión completa del managed-data SQL real desde la
fuente local preservada. Los findings de Attempt #2 quedaron diagnosticados y
remediados por Diagnostics #1/#2; este PASS no reinterpreta los Attempts #1/#2
como fallos del backup ni acredita un restore completo.

```text
LOCAL MANAGED RECOVERY SOURCE DIAGNOSTIC #3 = PASS / SQL_ADMISSION VERIFIED
TOOLING SHA = 32e88ac50e540593b3ec464909797605764028d5
localAgeDecrypts = 1
realR2Reads = 0
realTargetStarts = 0
sqlExecutions = 0
productionMutations = 0
cleanup = PASS

LOCAL SOURCE DIAGNOSTIC #1 = CLOSED / SUPABASE DATA WRAPPER FINDING REMEDIATED
LOCAL SOURCE DIAGNOSTIC #2 = CLOSED / PG_DUMP SEQUENCE SET FINDING REMEDIATED
LOCAL SOURCE DIAGNOSTIC #3 = PASS / COMPLETE MANAGED-DATA SQL ADMISSION VERIFIED
SUPABASE DATA WRAPPER REMEDIATION = REAL BACKUP VERIFIED
PG_DUMP SEQUENCE SET REMEDIATION = REAL BACKUP VERIFIED
REAL BACKUP MANAGED-DATA SQL ADMISSION = VERIFIED

LOCAL PRESERVED CIPHERTEXT = VERIFIED
LOCAL AGE DECRYPT = PASS
SAFE TAR = PASS
EXACT BUNDLE TREE = PASS
MANAGED SQL ARTIFACT READ = PASS
MANAGED-DATA SQL ADMISSION = PASS
SOURCE CLEANUP = PASS

R2 SOURCE RE-VERIFICATION = PENDING REAL RESTORE ATTEMPT #3
FRESH DISPOSABLE TARGET CREATION = PENDING REAL RESTORE ATTEMPT #3
BASELINE VALIDATION = PENDING REAL RESTORE ATTEMPT #3
ROLES/SCHEMA/HISTORY AUDITS AGAINST TARGET = PENDING REAL RESTORE ATTEMPT #3
RESTORE-PLAN CONSTRUCTION = PENDING REAL RESTORE ATTEMPT #3
SINGLE SQL MUTATION = PENDING REAL RESTORE ATTEMPT #3
POST-RESTORE DB VALIDATION = PENDING REAL RESTORE ATTEMPT #3
FK/CONSTRAINT VALIDATION = PENDING REAL RESTORE ATTEMPT #3
AUTH CONTINUITY = PENDING REAL RESTORE ATTEMPT #3
REAL INTERNAL LOGIN = PENDING REAL RESTORE ATTEMPT #3
EMPTY STORAGE VALIDATION = PENDING REAL RESTORE ATTEMPT #3
APPLICATION LIVE/READY/LOGIN = PENDING REAL RESTORE ATTEMPT #3
ANONYMOUS REJECTION = PENDING REAL RESTORE ATTEMPT #3
RLS/GRANT BASELINE = PENDING REAL RESTORE ATTEMPT #3
CLEANUP = PENDING REAL RESTORE ATTEMPT #3

LOCAL DIAGNOSTIC R2 READ = NOT EXECUTED
LOCAL DIAGNOSTIC TARGET CREATION = NOT EXECUTED
LOCAL DIAGNOSTIC SQL EXECUTION = NOT EXECUTED
LOCAL DIAGNOSTIC AUTH START = NOT EXECUTED
LOCAL DIAGNOSTIC APPLICATION START = NOT EXECUTED
LOCAL DIAGNOSTIC CHROMIUM START = NOT EXECUTED
LOCAL DIAGNOSTIC PRODUCTION MUTATION = NOT EXECUTED

LOCAL SOURCE DIAGNOSTIC #3 = CLOSED / PASS / SQL_ADMISSION VERIFIED
SOURCE DIAGNOSTIC WORKSTREAM = CLOSED / REAL BACKUP SOURCE SQL ADMISSION VERIFIED
PPO-04M.5.3 = ACTIVE / SOURCE VERIFIED / REAL RESTORE ATTEMPT #3 PENDING AUTHORIZATION
REAL RESTORE ATTEMPT #1 = FAIL / PREFLIGHT OPERATOR CONFIGURATION
REAL RESTORE ATTEMPT #2 = FAIL / SOURCE_VERIFY REAL BACKUP SQL DIALECT ADMISSION FINDING
REAL RESTORE ATTEMPT #3 = NOT AUTHORIZED / PENDING FINAL DOCUMENTARY REVIEW
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
PRODUCTION RESTORE = NOT AUTHORIZED
PRODUCTION MUTATIONS = 0
TD-BACKUP-004 REQUIREMENT = REQUIRED BEFORE FIRST NON-EMPTY STORAGE RECOVERY

REAL R2 READS DURING DOCUMENTARY CLOSURE = 0
REAL AGE DECRYPTS DURING DOCUMENTARY CLOSURE = 0
REAL TARGET STARTS = 0
REAL APP STARTS = 0
REAL CHROMIUM STARTS = 0
SQL EXECUTIONS = 0
PRODUCTION ACTIVITY = 0
```


### PPO-04M.5.3 — Real Restore Attempt #4 — diagnóstico del dialecto de roles

Real Restore Attempt #4 alcanzó la fuente R2 en modo read-only, verificó y
descifró el bundle, inició un target desechable y se detuvo de forma segura al
construir el restore plan porque el dialecto de `database/roles.sql` excede la
gramática gobernada actual. No se ejecutó SQL ni se mutó el target o Production;
esta evidencia no declara corrupción del backup.

La autoridad upstream confirmada es Supabase CLI 2.109.1, release commit
`6d4c19870ed213ba7f682f117d0345c8a40bfa94`, archivo
`apps/cli-go/pkg/migration/scripts/dump_role.sh`. Ese flujo usa
`pg_dumpall --roles-only --role postgres --quote-all-identifier --no-role-passwords --no-comments`,
aplica filtros Supabase y añade `RESET ALL;`. Que upstream emita ese suffix y
que el auditor actual no lo admita no demuestra que esa haya sido la sentencia
concreta del finding Productivo.

El tooling local incorpora una clasificación sanitizada y bounded del artifact
de roles después de la admisión completa de managed-data. No amplía
`auditRolesSql()`, no publica SQL, identities, parámetros ni valores, y conserva
el material credencial como hard failure. Local Source Diagnostic #4 no fue
ejecutado durante esta implementación y continúa sujeto a revisión y autorización.

```text
REAL RESTORE ATTEMPT #4 = FAIL / RESTORE_PLAN / ROLES DIALECT AUDIT
TOOLING SHA = 80d27aa9518a928557b8a4e98370d46433c45ee3
code = RECOVERY_ROLES_DIALECT_UNEXPECTED
phase = RESTORE_PLAN
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 3
realAgeDecrypts = 1
productionMutations = 0

R2 SOURCE = REACHED / READ-ONLY
DECRYPT = REACHED
SOURCE VERIFY = REACHED
DISPOSABLE TARGET = STARTED
RESTORE SQL = NOT EXECUTED
TARGET DATA MUTATION = 0
PRODUCTION MUTATION = 0

KNOWN UPSTREAM ROLE-DUMP DIALECT GAP = CONFIRMED
SUPABASE CLI 2.109.1 ROLE DUMP = pg_dumpall --roles-only + Supabase filters + RESET ALL suffix
ACTUAL PRODUCT BACKUP ROLE DIALECT = PENDING LOCAL SANITIZED CLASSIFICATION

PPO-04M.5.3 = ACTIVE / REAL BACKUP ROLES DIALECT DIAGNOSTIC
REAL RESTORE ATTEMPT #4 = CLOSED / SAFE FAIL / NO SQL MUTATION
LOCAL SOURCE DIAGNOSTIC #4 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #5 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```

## Real Restore Attempt #6 — safe fail y diagnóstico execute preflight

Attempt #6 alcanzó `RESTORE_EXECUTE` con plan `READY` y revalidación
pre-mutación aprobada. El comando `psql` de restore fue intentado una vez y
falló. La evidencia no establece todavía una causa SQL exacta ni registra una
mutación target exitosa.

```text
REAL RESTORE ATTEMPT #6 =
CLOSED / SAFE FAIL / RESTORE_EXECUTE

REAL RESTORE ATTEMPT #6 EXECUTION EVIDENCE =
FAIL / RESTORE_EXECUTE

TOOLING SHA =
23f8efe9902ed0d1c638c1cd3e657ea9f643664d

code =
COMMAND_FAILED

realTargetStarts = 1
sqlExecutions = 1
targetMutations = 0
realR2Reads = 3
realAgeDecrypts = 1
productionMutations = 0
REAL_RESTORE_ATTEMPT_6_EXIT_CODE = 1
```

```text
SOURCE R2 VERIFY = PASS BY PHASE PROGRESSION
TARGET START = PASS
TARGET BASELINE = PASS
RESTORE PLAN = READY
PRE-MUTATION REVALIDATION = PASS
PSQL RESTORE COMMAND = ATTEMPTED ONCE / FAILED
SUCCESSFUL TARGET MUTATION = NOT RECORDED
POST-RESTORE VALIDATION = NOT REACHED
AUTH LOGIN = NOT REACHED
APPLICATION = NOT REACHED

RESTORE PLAN = PASS / READY BY PHASE PROGRESSION
PRE-MUTATION REVALIDATION = PASS BY PHASE PROGRESSION
RESTORE EXECUTE = FAIL / COMMAND_FAILED
POST-RESTORE VALIDATION = NOT REACHED
RESTORE EXECUTE EXACT SQL ROOT CAUSE = NOT YET ESTABLISHED
```

`LOCAL RESTORE EXECUTE PREFLIGHT DIAGNOSTIC #1` queda implementado como
entrypoint independiente y no autorizado. Usa el backup local preservado, un
target Supabase local desechable y el restore plan real `READY` con Storage
vacío. No accede ni ejecuta `restorePlan.restoreSql`.

Sus cinco consultas gobernadas son exclusivamente `SELECT`: autoridad para
`session_replication_role`, catálogo target de columnas, catálogo FK para el
cierre de TRUNCATE, catálogo/privilegio UPDATE de sequences admitidas y
privilegios TRUNCATE/INSERT de tablas. El admission target-compatible se obtiene
exclusivamente desde el handle del restore plan. La admisión privada conserva
sólo identities de sequence y nunca valores.

El evaluator detecta columnas COPY ausentes, columnas target requeridas no
provistas, conflictos con generated columns, FK abiertas, sequences
ausentes/sin UPDATE y privilegios de tabla insuficientes. Shapes inválidos,
duplicados, schemas externos, handles fabricados y más de 32 identities fallan
cerrados. La salida pública se limita a códigos, identities gobernadas y
conteos/privilegios cerrados: nunca SQL, filas, nombres de columnas, paths,
credenciales ni output crudo. El cleanup target/source conserva su precedencia
gobernada.

```text
PPO-04M.5.3 = ACTIVE / RESTORE_EXECUTE DIAGNOSTIC
REAL RESTORE ATTEMPT #6 = CLOSED / SAFE FAIL / RESTORE_EXECUTE
RESTORE EXECUTE ROOT CAUSE = UNKNOWN / PENDING READ-ONLY PREFLIGHT DIAGNOSTIC
LOCAL RESTORE EXECUTE PREFLIGHT DIAGNOSTIC #1 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #7 = NOT AUTHORIZED
PRODUCTION RESTORE = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
RESTORE SQL EXECUTIONS DURING IMPLEMENTATION = 0
TARGET DATA MUTATIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```


## Local Restore Plan Diagnostic #6 — restore plan real verificado

Diagnostic #6 confirmó `RESTORE_PLAN READY` para el backup Productivo real y el
target local desechable. Es un PASS de construcción y autoridad, no un restore
ejecutado ni una autorización de Attempt #6.

```text
LOCAL RESTORE PLAN DIAGNOSTIC #6 =
PASS / RESTORE_PLAN

TOOLING SHA =
810a2c6d8c5bb4c7c4de6510dbff8ad70c7e90e3

restorePlan =
READY

storageScope =
EMPTY_ONLY

localAgeDecrypts =
1

realTargetStarts =
1

sqlExecutions =
0

targetMutations =
0

realR2Reads =
0

remoteActivity =
0

productionMutations =
0

targetCleanup =
PASS

sourceCleanup =
PASS

PLAN_DIAGNOSTIC_6_EXIT_CODE =
0
```

```text
LOCAL RESTORE PLAN = REAL BACKUP VERIFIED / PASS
RESTORE PLAN CONSTRUCTION = READY
EMPTY AUTH SCHEMA DRIFT COMPATIBILITY = REAL BACKUP VERIFIED / PASS
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
```

```text
SOURCE LOCAL VERIFY = PASS
AGE DECRYPT = PASS
SQL ADMISSION = PASS
TARGET START = PASS
TARGET ISOLATION = PASS
TARGET BASELINE = PASS
ROLES AUDIT = PASS
MANAGED SCHEMA AUDIT = PASS
MIGRATION HISTORY AUDIT = PASS
DATABASE COUNTS RECONCILIATION = PASS
EMPTY AUTH SCHEMA DRIFT COMPATIBILITY = PASS
MUTABLE TABLE PLAN = PASS
AUTH EPHEMERAL SANITIZATION = PASS
RESTORE SQL CONSTRUCTION = PASS
STORAGE INVENTORY = PASS
STORAGE BYTE RESTORE PLAN = VALIDATED_NO_OP / EMPTY
AUTH EXPECTATION CONSTRUCTION = PASS
LOGIN EXPECTATION CONSTRUCTION = PASS
POST-RESTORE VALIDATION PLAN = PASS
RESTORE PLAN = READY
```

```text
RESTORE SQL EXECUTED = NO
TARGET DATA MUTATED = NO
PRODUCTION MUTATED = NO
R2 ACCESSED = NO
ACTUAL DB RESTORE = NOT EXECUTED
POST-RESTORE DATABASE VALIDATION = NOT EXECUTED
FOREIGN KEY INTEGRITY = NOT EXECUTED
AUTH CONTINUITY AFTER RESTORE = NOT EXECUTED
REAL INTERNAL LOGIN = NOT EXECUTED
APPLICATION START = NOT EXECUTED
APPLICATION READY = NOT EXECUTED
APPLICATION LOGIN = NOT EXECUTED
INTERNAL SCREEN = NOT EXECUTED
APPLICATION READ = NOT EXECUTED
ANONYMOUS INTERNAL ACCESS = NOT EXECUTED
R2 ROUNDTRIP FOR THIS RESTORE = NOT EXECUTED
```

```text
LOCAL RESTORE PLAN DIAGNOSTICS = CLOSED / PASS
#1 migration-history data dialect
#2 databaseCounts domain reconciliation
#3 mutable catalog divergence
#4 exact Auth schema drift identities
#5 missing Auth tables verified EMPTY
#6 complete restore plan READY
```

```text
MANAGED VS LOCAL AUTH SCHEMA DRIFT = CONFIRMED
MISSING AUTH TABLE DATA OCCUPANCY = VERIFIED EMPTY / 4 OF 4
EMPTY AUTH SCHEMA DRIFT COMPATIBILITY = APPROVED / REAL BACKUP VERIFIED

AUTH DRIFT COMPATIBILITY TABLES =
auth.mfa_recovery_code_sets
auth.mfa_recovery_codes
auth.scim_tokens
auth.scim_users

AUTH DRIFT COMPATIBILITY CONDITION =
all four absent from target
AND
all four source COPY blocks EMPTY
```

Esta excepción sigue siendo exacta y no equivale a compatibilidad general entre
versiones de Supabase Auth.

```text
PPO-04M.5.3 = ACTIVE / RESTORE PLAN VERIFIED / PENDING REAL RESTORE EXECUTION
LOCAL RESTORE PLAN DIAGNOSTIC #6 = CLOSED / PASS
LOCAL RESTORE PLAN = REAL BACKUP VERIFIED / READY
EMPTY AUTH SCHEMA DRIFT COMPATIBILITY = APPROVED / REAL BACKUP VERIFIED
REAL RESTORE ATTEMPT #6 = NOT AUTHORIZED / PENDING POST-DIAGNOSTIC REVIEW
TD-BACKUP-004 = OPEN
TD-BACKUP-004 = REQUIRED BEFORE FIRST NON-EMPTY STORAGE RECOVERY
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
PRODUCTION RESTORE = NOT AUTHORIZED
NEXT POSSIBLE RESTORE TARGET = DISPOSABLE LOCAL SUPABASE TARGET

REAL R2 READS DURING DOCUMENTATION UPDATE = 0
REAL AGE DECRYPTS DURING DOCUMENTATION UPDATE = 0
REAL TARGET STARTS DURING DOCUMENTATION UPDATE = 0
REAL APP STARTS DURING DOCUMENTATION UPDATE = 0
REAL CHROMIUM STARTS DURING DOCUMENTATION UPDATE = 0
SQL EXECUTIONS DURING DOCUMENTATION UPDATE = 0
PRODUCTION ACTIVITY DURING DOCUMENTATION UPDATE = 0
```


### PPO-04M.5.3 — Local Source Diagnostic #4 — finding de dialecto de roles

Local Source Diagnostic #4 usó exclusivamente el ciphertext local preservado y
confirmó cinco statements inesperados, todos dentro de tres familias upstream
conocidas de Supabase CLI 2.109.1 y PostgreSQL 17. No observó ninguna de las
otras seis clases bounded ni material credencial. La evidencia permanece
sanitizada: no se registran roles, grantees, parámetros concretos, valores ni
SQL Productivo.

La remediación mantiene `database/roles.sql` como `AUDIT_ONLY` y fuera de
`restoreSql`. `auditRolesSql()` admite únicamente `RESET ALL;`, los `ALTER ROLE
... SET ... TO ...` estrictos del allowlist Supabase y los ACL `PARAMETER`
exactos que `buildACLCommands()` puede generar. Las demás variantes continúan
fallando cerrado. Diagnostic #5 no fue ejecutado y su resultado no se presume.

```text
LOCAL SOURCE DIAGNOSTIC #4 = FINDING / ROLES_AUDIT
TOOLING SHA = dcc396107144a763c4757cd522798b30c4de00e8
status = FINDING
phase = ROLES_AUDIT
code = RECOVERY_ROLES_DIALECT_DIAGNOSTIC_FINDING
unexpectedStatementCount = 5
ALTER_ROLE_SET_SUPABASE_ALLOWED_CONFIG = 3
RESET_ALL = 1
ROLE_PARAMETER_PRIVILEGE_VARIANT = 1
ALTER_ROLE_SET_OTHER_CONFIG = 0
GRANT_ROLE_MEMBERSHIP_VARIANT = 0
CREATE_ROLE_VARIANT = 0
ALTER_ROLE_WITH_VARIANT = 0
SET_STATEMENT_VARIANT = 0
OTHER_ROLE_SQL = 0
localAgeDecrypts = 1
realR2Reads = 0
realTargetStarts = 0
sqlExecutions = 0
productionMutations = 0
cleanup = PASS

UNEXPECTED ROLE SQL OUTSIDE KNOWN UPSTREAM FAMILIES = NOT OBSERVED
CREDENTIAL MATERIAL = NOT OBSERVED

PPO-04M.5.3 = ACTIVE / ROLES DIALECT REMEDIATION
LOCAL SOURCE DIAGNOSTIC #4 = CLOSED / FINDING CONFIRMED
LOCAL SOURCE DIAGNOSTIC #5 = NOT AUTHORIZED / PENDING REMEDIATION REVIEW
REAL RESTORE ATTEMPT #5 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```

### PPO-04M.5.3 — Local Source Diagnostic #5 — cierre / roles audit verified

El tooling inmutable `6424609827a9e5d24ad56c991ecb27f331bb7788`
se ejecutó sobre el mismo backup real preservado usado por Diagnostic #4.
Diagnostic #5 cerró en `PASS` y verificó que la remediación estricta cubre las
tres familias observadas sin findings adicionales. La evidencia sigue
sanitizada: no publica identidades, nombres concretos de parámetros, valores,
SQL Productivo raw ni paths absolutos.

```text
LOCAL SOURCE DIAGNOSTIC #5 = PASS / ROLES_AUDIT VERIFIED
TOOLING SHA = 6424609827a9e5d24ad56c991ecb27f331bb7788
status = PASS
operation = local-managed-recovery-source-diagnostic
phase = ROLES_AUDIT
localAgeDecrypts = 1
realR2Reads = 0
realTargetStarts = 0
sqlExecutions = 0
productionMutations = 0
cleanup = PASS
DIAGNOSTIC EXIT CODE = 0

LOCAL PRESERVED CIPHERTEXT = VERIFIED
LOCAL AGE DECRYPT = PASS
SAFE TAR = PASS
EXACT BUNDLE TREE = PASS
MANAGED-DATA SQL ADMISSION = PASS
ROLES.SQL DIALECT AUDIT = PASS
SOURCE CLEANUP = PASS

SUPABASE DATA WRAPPER REMEDIATION = REAL BACKUP VERIFIED
PG_DUMP SEQUENCE SET REMEDIATION = REAL BACKUP VERIFIED
ROLES DIALECT REMEDIATION = REAL BACKUP VERIFIED
```

`database/roles.sql` permanece `AUDIT_ONLY` y fuera de `restoreSql`.
Diagnostic #5 demuestra únicamente que el artifact pertenece al dialecto
gobernado; no demuestra ni autoriza su ejecución. El hard-fail
`RECOVERY_ROLES_CREDENTIAL_MATERIAL` permanece vigente.

```text
ROLE CREDENTIAL MATERIAL = NOT OBSERVED
UNEXPECTED ROLE SQL OUTSIDE GOVERNED DIALECT = NOT OBSERVED
```

Diagnostic #4 se conserva como evidencia histórica del finding previo, sin
reinterpretarlo como corrupción del backup:

```text
LOCAL SOURCE DIAGNOSTIC #4 = FINDING / ROLES_AUDIT
TOOLING SHA = dcc396107144a763c4757cd522798b30c4de00e8
unexpectedStatementCount = 5
ALTER_ROLE_SET_SUPABASE_ALLOWED_CONFIG = 3
RESET_ALL = 1
ROLE_PARAMETER_PRIVILEGE_VARIANT = 1
```

El historial de intentos reales también permanece inalterado:

```text
REAL RESTORE ATTEMPT #1 = FAIL / PREFLIGHT OPERATOR CONFIGURATION
REAL RESTORE ATTEMPT #2 = FAIL / SOURCE_VERIFY SQL DIALECT ADMISSION
REAL RESTORE ATTEMPT #3 = FAIL / PREFLIGHT R2 LOCAL ENV ADMISSION
REAL RESTORE ATTEMPT #4 = FAIL / RESTORE_PLAN / ROLES DIALECT AUDIT
REAL RESTORE ATTEMPT #4 TOOLING SHA = 80d27aa9518a928557b8a4e98370d46433c45ee3
ATTEMPT #4 realTargetStarts = 1
ATTEMPT #4 sqlExecutions = 0
ATTEMPT #4 targetMutations = 0
ATTEMPT #4 realR2Reads = 3
ATTEMPT #4 realAgeDecrypts = 1
ATTEMPT #4 productionMutations = 0
```

Diagnostic #5 no verifica el restore completo. Para Real Restore Attempt #5
siguen pendientes:

```text
R2 source re-verification
fresh disposable target creation
target baseline validation
managed-schema audit
migration-history audit
restore-plan complete construction
single SQL mutation
post-restore DB validation
referential integrity
Auth continuity
real internal login
empty Storage validation
application live
application ready
application login
anonymous rejection
RLS/grant baseline
cleanup
```

El estado vigente queda:

```text
LOCAL SOURCE DIAGNOSTIC #5 = CLOSED / PASS / ROLES_AUDIT VERIFIED
SOURCE DIAGNOSTIC WORKSTREAM = CLOSED / REAL BACKUP SOURCE + ROLES VERIFIED
ROLES DIALECT REMEDIATION = APPROVED / REAL BACKUP VERIFIED
PPO-04M.5.3 = ACTIVE / SOURCE + ROLES VERIFIED / REAL RESTORE ATTEMPT #5 PENDING AUTHORIZATION
REAL RESTORE ATTEMPT #5 = NOT AUTHORIZED / PENDING FINAL DOCUMENTARY REVIEW
TD-BACKUP-004 = OPEN
TD-BACKUP-004 = REQUIRED BEFORE FIRST NON-EMPTY STORAGE RECOVERY
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
```

Este cierre fue exclusivamente documental:

```text
REAL R2 READS = 0
REAL AGE DECRYPTS = 0
REAL TARGET STARTS = 0
REAL APP STARTS = 0
REAL CHROMIUM STARTS = 0
SQL EXECUTIONS = 0
PRODUCTION ACTIVITY = 0
```

### PPO-04M.5.3 — Real Restore Attempt #5 — restore plan diagnostic

Real Restore Attempt #5 ejecutó el tooling inmutable
`dbe9c940511ae2b989995da5fb0e831d635e84ec` y se detuvo de forma segura en
`RESTORE_PLAN`. La fuente R2 fue verificada en modo read-only, el decrypt y la
verificación de fuente completaron, y el target local desechable alcanzó su
baseline. No se ejecutó SQL de restore ni hubo mutación del target o Production.
El resultado no demuestra corrupción del backup.

```text
REAL RESTORE ATTEMPT #5 = FAIL / RESTORE_PLAN
TOOLING SHA = dbe9c940511ae2b989995da5fb0e831d635e84ec
code = RECOVERY_DRILL_FAILED
phase = RESTORE_PLAN
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 3
realAgeDecrypts = 1
productionMutations = 0

SOURCE R2 = VERIFIED / READ-ONLY
AGE DECRYPT = REACHED
SOURCE VERIFY = PASS
DISPOSABLE TARGET = STARTED
TARGET BASELINE = REACHED
RESTORE SQL = NOT EXECUTED
TARGET MUTATION = 0
PRODUCTION MUTATION = 0
```

La observabilidad genérica de `sanitizeRealRestoreDrillFailure()` convierte en
`RECOVERY_DRILL_FAILED` cualquier error interno que no pertenezca a su enum
público cerrado. No se amplió indiscriminadamente ese enum. En su lugar se
implementó un diagnóstico separado, bounded y no mutante que reproduce el
mismo punto mediante `buildManagedRestorePlan()` real.

El backup fue creado con Supabase CLI 2.109.1. El dialecto upstream de
`dump_data.sh` envuelve los dumps data-only con un `SET` inicial y
`RESET ALL;` final, incluido el dump de migration history. El auditor actual
admite el `SET` pero no ese `RESET ALL;`; por ello
`RECOVERY_MIGRATION_HISTORY_DATA_INVALID` es una hipótesis fuerte, no un
finding confirmado. No se afirma que fuera el primer error de Attempt #5 porque
`managed-schema` se audita antes.

```text
LOCAL MANAGED RECOVERY PLAN DIAGNOSTIC =
IMPLEMENTED / NOT EXECUTED

SOURCE =
LOCAL PRESERVED BACKUP ONLY

SOURCE ADAPTER =
createLocalRecoverySourceAdapter

R2 READS =
FORBIDDEN / 0

PLAN AUTHORITY =
buildManagedRestorePlan REAL

STOP BOUNDARY =
IMMEDIATELY AFTER RESTORE_PLAN

RESTORE SQL EXECUTION =
FORBIDDEN

STORAGE TRANSFER =
FORBIDDEN

CREDENTIAL PROMPT =
FORBIDDEN

APPLICATION START =
FORBIDDEN

CHROMIUM START =
FORBIDDEN
```

El diagnóstico exige la confirmación exacta
`GODEL_MANAGED_RECOVERY_PLAN_DIAGNOSTIC_CONFIRM=ALLOW_LOCAL_MANAGED_RECOVERY_PLAN_DIAGNOSTIC`,
rechaza confirmaciones incompatibles y mantiene un enum cerrado limitado a
fallos alcanzables durante la construcción del plan. Un código no admitido se
publica únicamente como `RECOVERY_RESTORE_PLAN_DIAGNOSTIC_UNCLASSIFIED`.

```text
PPO-04M.5.3 = ACTIVE / REAL RESTORE PLAN DIAGNOSTIC
REAL RESTORE ATTEMPT #5 = CLOSED / SAFE FAIL / RESTORE_PLAN
LOCAL MANAGED RECOVERY PLAN DIAGNOSTIC = IMPLEMENTED / NOT EXECUTED / PENDING REVIEW
REAL RESTORE ATTEMPT #6 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
TD-BACKUP-004 = REQUIRED BEFORE FIRST NON-EMPTY STORAGE RECOVERY
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```

El core corregido conserva evidencia `INCOMPLETE` fuera del staging, publica el
nombre final sólo tras cleanup plaintext y prohíbe configuración/credenciales
inline en remotes `rclone`.
El antiguo [plan Self-Hosted VPS](PPO_04_PRODUCTION_PILOT_PLAN.md) queda
superseded sin despliegue. PPO-05, PPO-06 y PPO-07 permanecen pendientes.

### Workstream Self-Hosted

El detalle, alcance y límites del workstream se mantienen en
[SH_ROADMAP.md](SH_ROADMAP.md), para evitar duplicar el roadmap maestro.

Estado interno vigente de PPO-02:

| Bloque    | Estado |
| --------- | ------ |
| PPO-02A   | Cerrada |
| PPO-02B   | Cerrada para la imagen app |
| PPO-02C.1 | Cerrada — validación local aprobada |
| PPO-02C.2 | Cerrada — composición local aprobada con condiciones |
| PPO-02C.3 | Absorbida en PPO-02C.2 — límites y aislamiento validados |
| PPO-02D.1 | Cerrada — healthchecks locales aprobados |
| PPO-02D.2 | Cerrada — Aprobada con condiciones |
| PPO-02E.1 | Cerrada — handoff aprobado |

PPO-02 queda cerrada con condiciones. Este cierre no cierra PPO-01, no aprueba
`company-host` y no constituye despliegue. PPO-02C.1 no constituye despliegue;
PPO-02C.2 integra y valida Docker Compose solo localmente en
`development-laptop`, incluyendo CPU, memoria, `pids_limit`, `read_only`,
tmpfs, usuarios no root, `cap_drop=ALL`, `no-new-privileges`, red dedicada,
`app` sin puerto publicado, Nginx como única entrada, ausencia de Docker socket,
ausencia de montajes persistentes, `docker stats` y límites efectivos vía
Docker. PPO-02D.1 valida healthchecks locales y dependencia operativa inicial.
PPO-02D.2 formaliza `compose.env.local` como archivo runtime ignorado por Git,
valida sus propiedades, recibe evidencia manual de baseline remota aplicada 6/6
sin seed, confirma que HTTPS administrado es alcanzable con VPN activo,
clasifica ProTUN/PostgreSQL como restricción administrativa y aprueba readiness
administrado al enviar la publishable key existente como cabecera `apikey` en la
llamada server-side a `/auth/v1/health`. PPO-02E.1 formaliza el cierre y el
handoff operativo. PPO-03 queda activa: PPO-03A.1 formalizó el contrato y
PPO-03A.2 cerró aprobada con condiciones. El spike separó TUS autenticado por
JWT para internos de TUS presigned para público y difirió la policy pública
reservation-aware al alcance de PPO-03B. PPO-03B.1 validó localmente el control
plane de sesiones/items y policies operation-aware. PPO-03B.2A aplicó la
migración 07 en administrado por Dirección Técnica; PPO-03B.2B confirmó por
HTTPS control plane cerrado, reserva obligatoria y compatibilidad legacy con
VPN activo, sin PostgreSQL remoto. El listing devolvió cero objetos visibles;
sin staged real no prueba su enumeración, pero no evidencia una apertura.
PPO-03B queda cerrada. PPO-03C.1 queda cerrada y aprobada localmente; PPO-03C.2
queda cerrada y aprobada con condición de integración runtime en PPO-03D/E para
la infraestructura TypeScript común. PPO-03C.3A promovió manualmente la
migración 08 y PPO-03C.3B cerró el gate HTTPS administrado de reserva real,
TUS presigned, staged aislado y finalize idempotente. PPO-03C queda cerrada;
PPO-03 permanece activa y PPO-03D es la fase activa.

PPO-03C.1 implementó localmente el control plane de reserva y finalize y queda
aprobada localmente. PPO-03C.2 implementó la infraestructura TypeScript común y
queda aprobada con condición de integración runtime en PPO-03D/E. PPO-03C.3B
validó administradamente las RPCs, policies, Storage y TUS sin ejecutar el
wrapper productivo. PPO-03D.1 integra el flujo interno de Pedidos y queda
implementada localmente, pendiente de revisión arquitectónica. PPO-03C queda
cerrada y PPO-03 permanece activa mientras continúan PPO-03D, PPO-03E, PPO-03F
y PPO-03G.

## Estado vigente de PPO-03

Los párrafos anteriores documentan la secuencia histórica antes del pivot SH.
El estado operativo actual es:

| Bloque | Estado |
| --- | --- |
| PPO-03A | Cerrada |
| PPO-03B | Cerrada |
| PPO-03C | Cerrada |
| PPO-03D.1 | Cerrada / aprobada |
| PPO-03D.2 | Superseded por self-hosted |
| PPO-03E.1 | Cerrada / aprobada |
| PPO-03E.2 | Cerrada / aprobada |
| PPO-03E.3 | Cerrada / aprobada |
| PPO-03E | Cerrada / aprobada |
| PPO-03F.0 | Cerrada / aprobada |
| PPO-03F.1 | Cerrada / aprobada |
| PPO-03F.2 | Cerrada / aprobada |
| PPO-03F.3 | Cerrada / aprobada |
| PPO-03F | Cerrada / aprobada |
| SH-03 | Cerrada / aprobada |
| PPO-03G | Cerrada / aprobada |
| PPO-03 | Cerrada / aprobada |
| SH-04 | CLOSED / APPROVED |
| SH-05 | PAUSED / INCOMPLETE — SH-05.3 PARTIALLY PROVEN / DEFERRED; SH-05.4 DEFERRED |

El diseño aprobado de PPO-03F.0 vive en
[PPO_03F_CLEANUP_DESIGN.md](PPO_03F_CLEANUP_DESIGN.md), el cierre de F.1 en
[PPO_03F_DATABASE_LIFECYCLE_REPORT.md](PPO_03F_DATABASE_LIFECYCLE_REPORT.md) y
el QA/freeze aprobado de F.3 en
[PPO_03F_QA_FREEZE_REPORT.md](PPO_03F_QA_FREEZE_REPORT.md). PPO-03 queda
CLOSED / APPROVED: cerró el modelo, reserva y finalize; Pedido authenticated
TUS; Solicitud signed TUS; lifecycle/cleanup; QA production-like SH-03; el gate
exacto de 20 MiB; bytes fuera de Next; retirada de los límites de 110 MB; y
TD-UPLOAD-001 resuelta. La evidencia de cierre se concentra en
[PPO_03G_UPLOAD_LIMITS_QA_REPORT.md](PPO_03G_UPLOAD_LIMITS_QA_REPORT.md),
[SH_03_CLOSURE_REPORT.md](SH_03_CLOSURE_REPORT.md) y
[SH_03_STORAGE_QA_REPORT.md](SH_03_STORAGE_QA_REPORT.md). SH-04 queda CLOSED /
APPROVED. SH-05 queda PAUSED / INCOMPLETE; SH-05.0, SH-05.1 y
SH-05.2 conservan sus cierres aprobados, SH-05.3 queda PARTIALLY PROVEN /
DEFERRED y SH-05.4 queda DEFERRED. PPO-04M / Managed Free Production Pilot es
la iniciativa `ACTIVE / NEXT`.

## PPO-00

PPO-00 queda cerrada con una baseline local reproducible: puertos canónicos para
Supabase local, reconstrucción limpia desde las seis migraciones consolidadas,
bootstrap local de identidades y perfiles QA, login verificado por rol y
validaciones de cierre documentadas.

El detalle aprobado vive en [PPO-00 - Cierre de baseline local de preproducción](../preproduction/PPO_00_CLOSURE.md).

## PPO-01 revisada

Definición oficial:

> Determinar si el entorno de desarrollo y el futuro host operativo compatible
> poseen las capacidades, prerrequisitos y condiciones necesarias para construir
> y ejecutar la infraestructura contenerizada prevista por PPO.

PPO-01 debe responder:

1. Si la laptop puede construir y validar la composición.
2. Si el host operativo seleccionado satisface el contrato provider-neutral
   aplicable antes de un despliegue real.
3. Qué límites iniciales de CPU, memoria y almacenamiento deberían evaluarse.
4. Si la conectividad es suficiente y estable.
5. Qué estrategia de almacenamiento merece pasar a pruebas reales posteriores.

PPO-01 no construye la composición, no instala Nginx, no configura exposición
pública, no modifica el flujo de archivos, no despliega el sistema en la VPS,
no decide definitivamente el almacenamiento y no prueba todavía el dominio
productivo.

La ejecución real de la composición pertenece a PPO-02.

Estado interno de PPO-01:

| Bloque    | Estado |
| --------- | ------ |
| PPO-01A.1 | Cerrada |
| PPO-01A.2 | Cerrada |
| PPO-01B   | Cerrada — `development-laptop` Apta con condiciones |
| PPO-01C   | SUPERSEDED / NOT EXECUTED — company-host audit histórica |
| PPO-01D   | SUPERSEDED / NOT EXECUTED — veredicto company-host histórico |
| PPO-01E   | DEFERRED TO LSH/SELF-HOST FUTURE — VPS/Linux Docker readiness |
| PPO-01F   | DEFERRED TO LSH/SELF-HOST FUTURE — final host readiness verdict |

`development-laptop` ya demostró capacidad suficiente para construir y validar
la composición contenerizada prevista para PPO-02: WSL2 y Docker con
contenedores Linux están operativos, el build terminó correctamente y Supabase
local coexistió con Next.js durante las mediciones controladas.

La conectividad desde el contexto físico declarado `cuba` y con VPN confirmada
manualmente como desconectada fue demostrada para los destinos ejecutados de
GitHub, Vercel y Cloudflare. Las transferencias sintéticas de 20 MiB se
completaron en descarga y carga. En PPO-01, Supabase administrado quedó
pendiente porque el proyecto administrado no estaba configurado; la validación
administrada correspondiente quedó cubierta después en PPO-02D.2.

PPO-01 conserva sus cierres y la trazabilidad de targets anteriores. PPO-01C/D
no se ejecutarán. PPO-01E/F dejan de ser gates del Managed Free Pilot y quedan
diferidas a LSH o a un futuro self-host autorizado; no se declaran cerradas.

Por decisión expresa de Dirección Técnica, PPO-02 quedó autorizada en paralelo
para construcción y validación local en `development-laptop`. Ese inicio no
implicó cierre de PPO-01, no implicó aprobación de `company-host` y no implicó
despliegue productivo ni despliegue en la empresa.

## PPO-02 a PPO-10 — detalle histórico

La sección siguiente conserva el alcance y las decisiones registradas antes de
los pivots SH y Managed Free. Sus estados de backend, fases activas y destinos
operativos están superseded por las secciones actuales de este documento.

- PPO-02: cerró Dockerfile, Compose, Nginx, redes, healthchecks, readiness
  administrado y criterios de reproducibilidad local. PPO-02A, PPO-02B,
  PPO-02C, PPO-02D y PPO-02E.1 quedan cerradas o absorbidas según corresponda.
  Esto no implementa despliegue, TLS, Cloudflare ni validación de
  `company-host`. El contrato y cierre viven en
  [PPO-02 - Plan de contenerización](PPO_02_CONTAINERIZATION_PLAN.md) y
  [PPO-02 — Cierre de base contenerizada reproducible](PPO_02_CLOSURE.md).
- PPO-03: queda activa. PPO-03A.1 formaliza el
  [contrato de cargas y almacenamiento](PPO_03_UPLOAD_STORAGE_CONTRACT.md), y
  PPO-03A.2 queda [aprobada con condiciones](PPO_03_TUS_SPIKE_REPORT.md): el
  transporte directo usa JWT interno o token firmado público según el actor.
  No implementan el rediseño. La secuencia continúa con PPO-03B (modelo DB, RLS
  y policies), PPO-03C
  (infraestructura común de reserva, firma, transferencia y finalize), PPO-03D
  (migración interna de Pedidos), PPO-03E (migración pública de Solicitudes),
  PPO-03F (expiración, reconciliación y cleanup) y PPO-03G (QA integral,
  retirada de 110 MB y cierre documental). PPO-03B queda cerrada. PPO-03B.2B
  no probó artificialmente el positivo presigned de `cargas/v1`; PPO-03C.3B lo
  validó mediante las RPCs reales de reserva, junto con staged no enumerable por
  actores no autorizados. PPO-03D.1 integra localmente Pedidos mediante TUS
  autenticado directo y queda pendiente de revisión arquitectónica; PPO-03E
  sigue para integrar el flujo público.
- Actualización PPO-03E: Solicitudes ya integra localmente reserva, firma TUS,
  transferencia directa, finalize, resume y retry. PPO-03E queda pendiente de
  revisión/cierre arquitectónico antes de PPO-03F/G.
- PPO-04 (snapshot histórico): proponía Production Pilot V1 en VPS, con
  App/Nginx `linux/amd64` construidos fuera del target. Ese plan quedó
  `SUPERSEDED / NOT EXECUTED`; PPO-04M es ahora el plan gobernante.
- PPO-05: abordará el hardening público completo: antiabuso, rate limiting,
  superficies públicas, uploads y revisión de exposición.
- PPO-06: profundizará backups y recovery para Supabase Managed Free en la ruta
  actual: calendario, retención, custodia externa, restore drills, RPO/RTO y DR.
- PPO-07: definirá monitoreo, logs, métricas, alertas, incidentes y runbooks para
  Vercel/Supabase Managed.
- PPO-08: ejecutará validación con usuarios reales.
- PPO-09: medirá y estabilizará el uso real.
- PPO-10: queda diferida para gobernar una migración productiva futura después
  del decision gate de LSH; no repite la investigación o prototipado de LSH.

Estas fases describen alcance futuro. No incorporan diseño de implementación en
este documento.

## Fuera del alcance de PPO

- Catálogo comercial.
- Tienda online.
- Carrito.
- Pagos online.
- Inventario avanzado.
- Facturación fiscal completa.
- Aplicación móvil nativa.
- WhatsApp avanzado.
- Panel independiente de clientes.
- Analítica comercial avanzada.
- Kubernetes.
- Microservicios distribuidos.
- Alta disponibilidad multinodo.
- Nuevo rediseño visual general.


### Local Restore Plan Diagnostic #1 — migration history dialect finding

Local Restore Plan Diagnostic #1 ejecutó el tooling inmutable
`6081250f9943837d278e449d4f9c3602534f9b0a` sobre la fuente local preservada
y confirmó el primer fallo interno de Real Restore Attempt #5. La fuente local,
el target desechable y su baseline alcanzaron PASS antes del finding. No se
ejecutó SQL ni hubo actividad remota o mutación del target o Production. Este
resultado no declara corrupción del backup.

```text
LOCAL RESTORE PLAN DIAGNOSTIC #1 = FINDING / RESTORE_PLAN
TOOLING SHA = 6081250f9943837d278e449d4f9c3602534f9b0a
code = RECOVERY_MIGRATION_HISTORY_DATA_INVALID
localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS
PLAN_DIAGNOSTIC_EXIT_CODE = 1

SOURCE LOCAL VERIFY = PASS
TARGET START = PASS
TARGET BASELINE = PASS
ROLES AUDIT = PASSED BEFORE FAILURE
MANAGED SCHEMA AUDIT = PASSED BEFORE FAILURE
MIGRATION HISTORY DATA AUDIT = FINDING
RESTORE SQL = NOT EXECUTED

ATTEMPT #5 FIRST INTERNAL FAILURE = CONFIRMED / MIGRATION HISTORY DATA AUDIT
MANAGED SCHEMA FIRST-FAIL HYPOTHESIS = DISCARDED
MIGRATION-HISTORY DATA DIALECT GAP = CONFIRMED
```

La causa técnica confirmada es el wrapper data-only de Supabase CLI 2.109.1,
release commit upstream `6d4c19870ed213ba7f682f117d0345c8a40bfa94`.
`apps/cli-go/pkg/migration/scripts/dump_data.sh` produce
`database/migration-history-data.sql` mediante `supabase db dump --linked
--data-only --use-copy --schema supabase_migrations` y lo envuelve con
`SET session_replication_role = replica;` y un único `RESET ALL;` final. El
auditor admitía el prefix, pero no el suffix exacto.

La remediación admite `RESET ALL;` únicamente fuera de COPY, después del único
COPY esperado, una sola vez y al final lógico del artifact. Comments y líneas
vacías posteriores siguen siendo no significativos. El historial de migraciones
permanece `AUDIT_ONLY`; ni su schema ni sus datos se incorporan a
`restoreSql`. La comparación exacta entre las versiones capturadas y la
baseline 01–06 permanece intacta.

```text
SUPABASE CLI 2.109.1 DATA-DUMP WRAPPER =
SET session_replication_role = replica
...
RESET ALL

DIAGNOSTIC #1 AUDITOR GAP = RESET ALL suffix was not admitted
CURRENT AUDITOR GAP = NONE KNOWN / PENDING REAL BACKUP VERIFICATION
MIGRATION HISTORY DIALECT REMEDIATION = IMPLEMENTED / PENDING REAL BACKUP VERIFICATION

PPO-04M.5.3 = ACTIVE / MIGRATION HISTORY DIALECT REMEDIATION
LOCAL RESTORE PLAN DIAGNOSTIC #1 = CLOSED / FINDING CONFIRMED
LOCAL RESTORE PLAN DIAGNOSTIC #2 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #6 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```


### Local Restore Plan Diagnostic #2 — database counts reconciliation finding

Local Restore Plan Diagnostic #2 ejecutó el tooling inmutable
`1b865d463e601a3cfd900a7bf4d1221d56d1907f` sobre la fuente local preservada
y se detuvo de forma segura durante `RESTORE_PLAN`. La fuente, el target
desechable, su baseline y todos los audits SQL anteriores alcanzaron PASS. No
se ejecutó SQL ni hubo actividad remota o mutación del target o Production. El
finding no constituye evidencia de corrupción del backup.

```text
LOCAL RESTORE PLAN DIAGNOSTIC #2 = FINDING / RESTORE_PLAN
TOOLING SHA = 1b865d463e601a3cfd900a7bf4d1221d56d1907f
code = RECOVERY_MANAGED_DATA_COUNTS_MISMATCH
localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS
PLAN_DIAGNOSTIC_2_EXIT_CODE = 1

SOURCE LOCAL VERIFY = PASS
TARGET START = PASS
TARGET BASELINE = PASS
ROLES AUDIT = PASS
MANAGED SCHEMA AUDIT = PASS
MIGRATION HISTORY SCHEMA AUDIT = PASS
MIGRATION HISTORY DATA AUDIT = PASS
DATABASE COUNTS RECONCILIATION = FINDING
RESTORE SQL = NOT EXECUTED
TARGET MUTATION = 0
PRODUCTION MUTATION = 0
```

La causa raíz es una diferencia de dominios. El inventario Productivo concatena
los COPY de `database/managed-data.sql` y
`database/migration-history-data.sql`; por tanto,
`manifest.databaseCounts.tables` contiene managed data más el conteo
audit-only de `supabase_migrations.schema_migrations`. Antes de esta
remediación, el restore comparaba los COPY de managed data contra ese inventario
completo como si ambos representaran el mismo dominio.

```text
DATABASE COUNTS DOMAIN GAP = CONFIRMED
MANIFEST DATABASE COUNT DOMAIN = MANAGED DATA + AUDIT-ONLY MIGRATION HISTORY
RESTORE COMPARISON BEFORE REMEDIATION = MANAGED DATA ONLY VS FULL DATABASE COUNTS
BACKUP CORRUPTION = NO EVIDENCE
```

La reconciliación conserva el inventario Productivo existente y lo consume por
completo mediante dos dominios exactos. Los conteos de cada COPY de managed data
deben coincidir identidad por identidad y fila por fila. Además debe existir una
sola entrada audit-only `supabase_migrations.schema_migrations`, cuyo conteo
debe coincidir con el `rowCount` gobernado que entrega
`auditMigrationHistorySql()`. Cualquier entrada restante, identidad
audit-only alternativa, duplicado, ausencia o conteo diferente falla cerrado.
`dataCounts.tableCounts` sigue conteniendo únicamente managed data para no
incorporar migration history a las expectativas mutables.

El audit de migration history cuenta las filas del único COPY gobernado, exige
`rowCount === baselineVersions.length` y conserva la comparación exacta de las
versiones 01–06. Una fila duplicada ya no puede quedar oculta por la
deduplicación usada para comparar identidades de versión. Migration history
permanece `AUDIT_ONLY` y no se incorpora a `restoreSql`.

```text
PPO-04M.5.3 = ACTIVE / DATABASE COUNTS RECONCILIATION REMEDIATION
LOCAL RESTORE PLAN DIAGNOSTIC #2 = CLOSED / FINDING CONFIRMED
DATABASE COUNTS RECONCILIATION = IMPLEMENTED / PENDING REAL BACKUP VERIFICATION
LOCAL RESTORE PLAN DIAGNOSTIC #3 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #6 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```


## Local Restore Plan Diagnostic #3 — mutable catalog finding y diagnóstico acotado

La ejecución gobernada sobre el tooling inmutable confirmó una divergencia entre
las identities mutables admitidas desde el backup y el catálogo del target. El
finding no identifica todavía la tabla concreta ni confirma una diferencia de
versión entre Supabase Managed y Supabase local.

```text
LOCAL RESTORE PLAN DIAGNOSTIC #3 =
FINDING / RESTORE_PLAN

TOOLING SHA =
dad4551194d9053d42f1adfda591ec7dde9c31f9

code =
RECOVERY_MUTABLE_TABLE_UNKNOWN

localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS
PLAN_DIAGNOSTIC_3_EXIT_CODE = 1
```

La secuencia observada antes del finding fue:

```text
SOURCE VERIFY = PASS
TARGET START = PASS
TARGET BASELINE = PASS
ROLES AUDIT = PASS
MANAGED SCHEMA AUDIT = PASS
MIGRATION HISTORY AUDIT = PASS
DATABASE COUNTS RECONCILIATION = REAL BACKUP VERIFIED / PASS
MUTABLE SOURCE/TARGET CATALOG ALIGNMENT = FINDING / IDENTITY PENDING DIAGNOSTIC
RESTORE SQL = NOT EXECUTED

SUPABASE INTERNAL CATALOG VERSION DIVERGENCE =
POSSIBLE / NOT CONFIRMED
```

El diagnóstico implementado recibe únicamente el handle gobernado de
`admitManagedDataSql()` y el catálogo ya obtenido por el baseline existente.
Calcula las identities de source ausentes en target sin SQL raw, sin columnas,
sin filas, sin conteos de datos y sin consultas adicionales. Clasifica cada
identity exclusivamente como `AUTH_EPHEMERAL_KNOWN`, `AUTH_OTHER`,
`STORAGE_METADATA`, `STORAGE_OTHER`, `PUBLIC` o `PRIVATE`.

La metadata publicable queda limitada a `missingCount`, `missingClasses` y
`missingIdentities`; admite como máximo 32 identities, exige grammar
`schema.table`, schemas gobernados, ausencia de duplicados y orden
lexicográfico. El sanitizer vuelve a validar identities, clases y conteos antes
de publicarlos. Esta metadata sólo puede acompañar
`RESTORE_PLAN / RECOVERY_MUTABLE_TABLE_UNKNOWN`; cualquier otro finding
permanece sin `mutableCatalog`. El planner, `truncateTables`, la
sanitización Auth, el restore SQL, el baseline y el backup Productivo no fueron
modificados.

```text
PPO-04M.5.3 = ACTIVE / MUTABLE CATALOG DIAGNOSTIC
LOCAL RESTORE PLAN DIAGNOSTIC #3 = CLOSED / FINDING CONFIRMED
DATABASE COUNTS RECONCILIATION = APPROVED / REAL BACKUP VERIFIED
MUTABLE CATALOG DIAGNOSTIC = IMPLEMENTED / PENDING REVIEW
LOCAL RESTORE PLAN DIAGNOSTIC #4 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #6 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```


## Local Restore Plan Diagnostic #4 — Auth schema drift confirmado

La ejecución gobernada sobre el tooling inmutable confirmó cuatro identities
Auth presentes en el backup real y ausentes del catálogo del target local. El
finding quedó acotado al dominio interno de Auth; no se observó divergencia en
tablas `public`, `private` o `storage`.

```text
LOCAL RESTORE PLAN DIAGNOSTIC #4 =
FINDING / RESTORE_PLAN

TOOLING SHA =
a8145358f7815b655cb9db113cad452291c92253

code =
RECOVERY_MUTABLE_TABLE_UNKNOWN

missingCount =
4

missingClasses =
AUTH_OTHER × 4

missingIdentities =
auth.mfa_recovery_code_sets
auth.mfa_recovery_codes
auth.scim_tokens
auth.scim_users

localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS

PLAN_DIAGNOSTIC_4_EXIT_CODE =
1
```

```text
DATABASE COUNTS RECONCILIATION = PASS
MUTABLE SOURCE/TARGET CATALOG ALIGNMENT = FINDING
MISSING DOMAIN = AUTH INTERNAL ONLY
PUBLIC TABLE DIVERGENCE = NONE OBSERVED
PRIVATE TABLE DIVERGENCE = NONE OBSERVED
STORAGE TABLE DIVERGENCE = NONE OBSERVED

MANAGED VS LOCAL AUTH SCHEMA DRIFT = CONFIRMED
MISSING AUTH FEATURE TABLES = MFA RECOVERY CODES + SCIM

MISSING AUTH TABLES =
auth.mfa_recovery_code_sets
auth.mfa_recovery_codes
auth.scim_tokens
auth.scim_users

MISSING TABLE DATA OCCUPANCY = UNKNOWN / PENDING DIAGNOSTIC
```

Las cuatro identities corresponden a funcionalidades incorporadas en una línea
de GoTrue posterior a la utilizada por los targets actuales. Esto confirma el
drift de schema, pero no autoriza ignorar tablas, eliminar COPYs ni inferir que
las tablas estén vacías.

Como contexto del proyecto, la revisión del repositorio no encontró uso Product
de SCIM. La configuración local gobernada mantiene deshabilitados tanto MFA
TOTP como MFA por teléfono. Estos datos no constituyen evidencia sobre la
ocupación de las tablas del backup real.

```text
GODEL PRODUCT USE OF SCIM = NONE FOUND IN REPOSITORY
GODEL LOCAL MFA TOTP = DISABLED
GODEL LOCAL MFA PHONE = DISABLED
```

El diagnóstico implementado conserva separadas la clasificación del catálogo y
la ocupación. Sólo un resultado con provenance de
`classifyMutableCatalogMismatch()` puede consultar estructuralmente sus COPY
blocks a través del admission gobernado. Para cada identity ausente publica
únicamente `EMPTY` o `NONEMPTY`; no publica conteos, filas, columnas,
valores, SQL, hashes, tokens, UUIDs, paths ni credenciales. El límite permanece
en 32 identities y el sanitizer revalida provenance, igualdad exacta de sets,
orden y shape antes de publicar.

```text
PPO-04M.5.3 = ACTIVE / AUTH SCHEMA DRIFT DIAGNOSTIC
LOCAL RESTORE PLAN DIAGNOSTIC #4 = CLOSED / FINDING CONFIRMED
MANAGED VS LOCAL AUTH SCHEMA DRIFT = CONFIRMED
MISSING AUTH TABLE DATA OCCUPANCY = PENDING REAL BACKUP VERIFICATION
LOCAL RESTORE PLAN DIAGNOSTIC #5 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #6 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```

## Local Restore Plan Diagnostic #5 — remediación estricta del drift Auth

Diagnostic #5 confirmó que las cuatro tablas Auth ausentes del target tienen
COPY blocks vacíos en el backup real. La compatibilidad resultante queda
limitada al set y estado exactos observados; no declara compatibilidad general
entre versiones ni autoriza el restore real.

```text
LOCAL RESTORE PLAN DIAGNOSTIC #5 =
FINDING / RESTORE_PLAN

TOOLING SHA =
d18f26b712b80f56c2ee800f1f5243c79294f5ac

code =
RECOVERY_MUTABLE_TABLE_UNKNOWN

missingCount =
4

missingClasses =
AUTH_OTHER × 4

missingIdentities =
auth.mfa_recovery_code_sets
auth.mfa_recovery_codes
auth.scim_tokens
auth.scim_users

missingData =
auth.mfa_recovery_code_sets = EMPTY
auth.mfa_recovery_codes = EMPTY
auth.scim_tokens = EMPTY
auth.scim_users = EMPTY

localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS
PLAN_DIAGNOSTIC_5_EXIT_CODE = 1
```

```text
MANAGED VS LOCAL AUTH SCHEMA DRIFT = CONFIRMED
MISSING AUTH TABLE DATA OCCUPANCY = VERIFIED EMPTY / 4 OF 4
PRODUCT DATA LOSS IF OMITTED = NONE OBSERVED FOR THESE FOUR COPY BLOCKS
RESTORE SQL = NOT EXECUTED
```

La normalización gobernada ocurre después de verificar `databaseCounts` sobre
el admission original. Exige el set exacto, vuelve a comprobar EMPTY, omite sólo
los cuatro COPY vacíos y re-admite el resultado antes del mutable plan y restore
SQL. No convierte las tablas en Auth efímero ni relaja el tratamiento de otros
mismatches.

```text
PPO-04M.5.3 = ACTIVE / EMPTY AUTH SCHEMA DRIFT REMEDIATION
LOCAL RESTORE PLAN DIAGNOSTIC #5 = CLOSED / EMPTY DRIFT CONFIRMED
MANAGED VS LOCAL AUTH SCHEMA DRIFT = CONFIRMED
MISSING AUTH TABLE DATA OCCUPANCY = VERIFIED EMPTY / 4 OF 4
EMPTY AUTH SCHEMA DRIFT COMPATIBILITY = IMPLEMENTED / PENDING REAL BACKUP VERIFICATION
LOCAL RESTORE PLAN DIAGNOSTIC #6 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #6 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```

El bloque anterior conserva el estado histórico posterior a Diagnostic #5. El
estado vigente queda sustituido por la evidencia de Attempt #6 y el preflight
read-only documentados en este archivo:

```text
PPO-04M.5.3 = ACTIVE / RESTORE_EXECUTE DIAGNOSTIC
REAL RESTORE ATTEMPT #6 = CLOSED / SAFE FAIL / RESTORE_EXECUTE
RESTORE EXECUTE ROOT CAUSE = UNKNOWN / PENDING READ-ONLY PREFLIGHT DIAGNOSTIC
LOCAL RESTORE EXECUTE PREFLIGHT DIAGNOSTIC #1 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #7 = NOT AUTHORIZED
PRODUCTION RESTORE = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
```

## Local Restore Execute Preflight Diagnostic #1 — blocker de executor

La ejecución inmutable del preflight confirmó que el executor `postgres`
actual no satisface la autoridad requerida por el contrato de restore. Este
finding confirma un blocker real, pero no demuestra que sea la única causa
posible del fallo de Attempt #6.

```text
LOCAL RESTORE EXECUTE PREFLIGHT DIAGNOSTIC #1 =
FINDING / RESTORE_EXECUTE_PREFLIGHT

TOOLING SHA =
246b9d21d526ba8029834c65a125d83ba0481cbb

code =
RECOVERY_RESTORE_EXECUTE_REPLICATION_ROLE_UNAUTHORIZED

localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS

RESTORE_EXECUTE_PREFLIGHT_DIAGNOSTIC_1_EXIT_CODE =
1
```

```text
POSTGRES RESTORE EXECUTOR =
INVALID FOR CURRENT RESTORE CONTRACT

POSTGRES session_replication_role SET AUTHORITY =
DENIED

RESTORE_EXECUTE BLOCKER =
CONFIRMED
```

No se conceden privilegios ni se modifican roles. Se implementa un diagnóstico
independiente para evaluar el candidato exacto `supabase_admin` mediante el
backup local preservado, un target local desechable y cinco queries
exclusivamente read-only. La autoridad opaca no acepta nombres de rol del
caller; todos sus command plans fijan internamente `-U supabase_admin`.

El candidato debe demostrar identidad exacta y las capacidades concretas
necesarias: SET de `session_replication_role`, TRUNCATE/INSERT de tablas y
UPDATE de sequences. `rolsuper` sólo se conserva como evidencia interna y no
es requisito contractual. Se reutilizan además todos los checks de columnas,
generated columns, cierre FK y existencia de sequences del preflight anterior,
obteniendo toda la metadata bajo la misma sesión candidata. No se accede ni
ejecuta restore SQL.

```text
LOCAL RESTORE EXECUTE PREFLIGHT DIAGNOSTIC #1 =
CLOSED / FINDING CONFIRMED

POSTGRES RESTORE EXECUTOR =
REJECTED FOR CURRENT RESTORE CONTRACT

POSTGRES session_replication_role SET =
UNAUTHORIZED

PPO-04M.5.3 =
ACTIVE / RESTORE EXECUTOR DIAGNOSTIC

REAL RESTORE ATTEMPT #6 =
CLOSED / SAFE FAIL / RESTORE_EXECUTE

RESTORE EXECUTE BLOCKER =
CONFIRMED / POSTGRES REPLICATION ROLE AUTHORITY

POSTGRES RESTORE EXECUTOR =
INVALID FOR CURRENT CONTRACT

SUPABASE_ADMIN RESTORE EXECUTOR CANDIDATE =
IMPLEMENTED / PENDING REAL TARGET VERIFICATION

LOCAL RESTORE EXECUTOR CANDIDATE DIAGNOSTIC #1 =
NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW

REAL RESTORE ATTEMPT #7 =
NOT AUTHORIZED

PRODUCTION RESTORE =
NOT AUTHORIZED

TD-BACKUP-004 =
OPEN

CURRENT REAL RESTORE STORAGE SCOPE =
EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
RESTORE SQL EXECUTIONS DURING IMPLEMENTATION = 0
TARGET DATA MUTATIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```

## Local Restore Executor Candidate Diagnostic #1 — preflight persistente

```text
LOCAL RESTORE EXECUTOR CANDIDATE DIAGNOSTIC #1 =
FINDING / RESTORE_EXECUTOR_PREFLIGHT

TOOLING SHA =
bb789de11fcb5652aa3ead05a81a8865aeecd74a

code =
RECOVERY_RESTORE_EXECUTE_COPY_COLUMN_MISSING

tableCount = 3

identities =
auth.one_time_tokens
storage.buckets
storage.objects

localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS
```

Por progresión del evaluador, la sesión `supabase_admin`, su identidad y su
autoridad de replication role pasaron. No se consideran verificados todavía
los privilegios de tablas/sequences ni el cierre FK.

```text
LOCAL RESTORE EXECUTOR CANDIDATE DIAGNOSTIC #1 = CLOSED / FINDING
SUPABASE_ADMIN SESSION = AVAILABLE / PASS BY FINDING PROGRESSION
SUPABASE_ADMIN IDENTITY = VERIFIED / PASS BY FINDING PROGRESSION
SUPABASE_ADMIN REPLICATION ROLE AUTHORITY = PASS BY FINDING PROGRESSION
COPY COLUMN DRIFT = FINDING
auth.one_time_tokens =
EPHEMERAL COPY / PREFLIGHT FALSE POSITIVE / REMEDIATION IMPLEMENTED
PERSISTENT COPY COLUMN DRIFT =
storage.buckets
storage.objects
PENDING EXACT COLUMN / DATA-STATE VERIFICATION
```

El preflight conserva el admission target-compatible anterior a la
sanitización y un admission persistente re-admitido después de
`sanitizeEphemeralAuthState()`, accesible sólo por handle gobernado. COPY,
columnas required/generated, ocupación, INSERT y sequences se evalúan contra el
segundo. TRUNCATE y cierre FK usan `mutable.truncateTables`; por ello
`auth.one_time_tokens` requiere TRUNCATE, no INSERT, y queda fuera del análisis
COPY. El finding persistente publica sólo identidad, nombre de columna y
`COPY_EMPTY`, `ALL_NULL` o `HAS_NON_NULL`, con límites 32/32/64 y sin filas,
valores, counts, SQL, tokens, UUIDs, rutas ni credenciales. No existe remediación
ni omisión nueva para Storage.

```text
PPO-04M.5.3 = ACTIVE / PERSISTENT COPY COLUMN DRIFT DIAGNOSTIC
POSTGRES RESTORE EXECUTOR = INVALID FOR CURRENT CONTRACT
SUPABASE_ADMIN RESTORE EXECUTOR CANDIDATE =
IDENTITY + REPLICATION AUTHORITY VERIFIED / FULL CONTRACT PENDING
EPHEMERAL COPY PREFLIGHT SEMANTICS = REMEDIATED / PENDING REAL VERIFICATION
PERSISTENT COPY COLUMN DRIFT = CONFIRMED / DETAILS PENDING REAL VERIFICATION
LOCAL RESTORE EXECUTOR CANDIDATE DIAGNOSTIC #2 =
NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #7 = NOT AUTHORIZED
PRODUCTION RESTORE = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```

## Local Restore Executor Candidate Diagnostic #2 — Storage column drift

La ejecución inmutable sobre el SHA autorizado confirmó que la corrección de
semántica efímera eliminó el falso positivo de `auth.one_time_tokens`. El
finding restante pertenece exclusivamente a seis columnas persistentes de
Storage. No se ejecutó restore SQL.

```text
LOCAL RESTORE EXECUTOR CANDIDATE DIAGNOSTIC #2 =
FINDING / RESTORE_EXECUTOR_PREFLIGHT

TOOLING SHA =
4d3c9a29cce791c21e60b6c1b5b44a3f41ea5c63

code =
RECOVERY_RESTORE_EXECUTE_COPY_COLUMN_MISSING

tableCount = 2

storage.buckets:
lifecycle_configuration = ALL_NULL
lifecycle_configuration_generation = ALL_NULL
versioning_status = HAS_NON_NULL

storage.objects:
archived_at = COPY_EMPTY
is_delete_marker = COPY_EMPTY
is_versioned = COPY_EMPTY

localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS

RESTORE_EXECUTOR_CANDIDATE_DIAGNOSTIC_2_EXIT_CODE = 1
```

El diagnóstico amplía sólo `storage.buckets.versioning_status` con
`semanticState = ALL_DISABLED | NOT_ALL_DISABLED`. La clasificación procede
del COPY gobernado dentro del admission persistente; exige al menos una fila,
trata `\\N` y cualquier valor distinto del literal autorizado como
`NOT_ALL_DISABLED`, y nunca publica valores, filas, counts, bucket IDs/names,
JSON ni SQL. Las otras cinco columnas conservan exclusivamente su `dataState`.
Los límites 32/32/64 y la provenance gobernada permanecen intactos. No se
implementó compatibilidad Storage, no se eliminan columnas del COPY y no se
modificó el restore runner.

```text
PPO-04M.5.3 = ACTIVE / PERSISTENT COPY COLUMN DRIFT DIAGNOSTIC
LOCAL RESTORE EXECUTOR CANDIDATE DIAGNOSTIC #2 = CLOSED / FINDING
EPHEMERAL COPY PREFLIGHT SEMANTICS =
REAL TARGET VERIFIED / auth.one_time_tokens FALSE POSITIVE RESOLVED
PERSISTENT STORAGE COPY COLUMN DRIFT =
CONFIRMED / EXACT SIX COLUMNS IDENTIFIED
STORAGE VERSIONING SEMANTIC STATE =
PENDING REAL VERIFICATION
LOCAL RESTORE EXECUTOR CANDIDATE DIAGNOSTIC #3 =
NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
SUPABASE_ADMIN RESTORE EXECUTOR CANDIDATE =
IDENTITY + REPLICATION AUTHORITY VERIFIED /
FULL CONTRACT PENDING
REAL RESTORE ATTEMPT #7 =
NOT AUTHORIZED
PRODUCTION RESTORE =
NOT AUTHORIZED
TD-BACKUP-004 =
OPEN
CURRENT REAL RESTORE STORAGE SCOPE =
EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```

## Local Restore Executor Candidate Diagnostic #3 — inactive Storage drift

La ejecución inmutable confirmó el set exacto de seis columnas Storage y la
semántica inactiva de `versioning_status`. No se ejecutó restore SQL.

```text
LOCAL RESTORE EXECUTOR CANDIDATE DIAGNOSTIC #3 =
CLOSED / FINDING

TOOLING SHA =
53fbaa2837d5238ee700bcc99b67356a962bc8a1

code =
RECOVERY_RESTORE_EXECUTE_COPY_COLUMN_MISSING

storage.buckets.lifecycle_configuration =
ALL_NULL

storage.buckets.lifecycle_configuration_generation =
ALL_NULL

storage.buckets.versioning_status =
HAS_NON_NULL / ALL_DISABLED

storage.objects.archived_at =
COPY_EMPTY

storage.objects.is_delete_marker =
COPY_EMPTY

storage.objects.is_versioned =
COPY_EMPTY

localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS

RESTORE_EXECUTOR_CANDIDATE_DIAGNOSTIC_3_EXIT_CODE = 1
```

La compatibilidad implementada exige exactamente esas seis identities, vuelve
a demostrar desde el admission persistente que los dos lifecycle fields son
`\\N`, que existe al menos una fila de buckets y que todo
`versioning_status` es `DISABLED`, y que el COPY completo de
`storage.objects` está vacío. Cualquier subset, superset, tabla alternativa o
semántica distinta conserva el finding.

La transformación elimina sólo esas columnas y sus fields, conserva ambos COPY
blocks y vuelve a pasar por `admitManagedDataSql()`. Las postcondiciones
comparan orden y cantidad de tablas COPY, row counts, mutable tables, sequence
identities, columnas retenidas y valores retenidos. El admission resultante
queda detrás de un handle `WeakMap`; no se publica SQL. El preflight continúa
después hacia required/generated columns, cierre FK, sequences y privilegios.
Esta capacidad no está conectada al runner de restore real.

```text
PPO-04M.5.3 =
ACTIVE / EXACT INACTIVE STORAGE SCHEMA COMPATIBILITY

STORAGE VERSIONING SEMANTIC STATE =
ALL_DISABLED / REAL BACKUP VERIFIED

EXACT INACTIVE STORAGE SCHEMA COMPATIBILITY =
IMPLEMENTED / PENDING REAL PREFLIGHT VERIFICATION

LOCAL RESTORE EXECUTOR CANDIDATE DIAGNOSTIC #4 =
NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW

SUPABASE_ADMIN RESTORE EXECUTOR CANDIDATE =
IDENTITY + REPLICATION AUTHORITY VERIFIED /
FULL CONTRACT PENDING

REAL RESTORE ATTEMPT #7 =
NOT AUTHORIZED

PRODUCTION RESTORE =
NOT AUTHORIZED

TD-BACKUP-004 =
OPEN

CURRENT REAL RESTORE STORAGE SCOPE =
EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```

## Local Restore Executor Candidate Diagnostic #4 — Iceberg FK closure

La ejecución inmutable avanzó después de la compatibilidad exacta de columnas
Storage y confirmó dos edges FK target-only desde
`storage.buckets_analytics`. No se ejecutó restore SQL.

```text
LOCAL RESTORE EXECUTOR CANDIDATE DIAGNOSTIC #4 =
CLOSED / FINDING

TOOLING SHA =
ed3801aa34fcb8a56f298a4953af05d90db0c87f

status =
FINDING

phase =
RESTORE_EXECUTOR_PREFLIGHT

code =
RECOVERY_RESTORE_EXECUTE_TRUNCATE_FK_OPEN

edgeCount =
2

parent =
storage.buckets_analytics

children =
storage.iceberg_namespaces
storage.iceberg_tables

localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS

RESTORE_EXECUTOR_CANDIDATE_DIAGNOSTIC_4_EXIT_CODE = 1
```

La progresión real verificó identidad y autoridad de replication role de
`supabase_admin`, la compatibilidad exacta del schema Storage, las columnas
COPY y los checks required/generated. El cierre FK quedó bloqueado; sequences
y privilegios de mutación aún no fueron alcanzados.

El diagnóstico semántico implementado conserva cinco queries en el preflight
genérico y usa seis en el candidato. La sexta query es fija, SELECT-only y
publica internamente sólo dos booleanos de ocupación. Para el topology exacto,
el estado source de `storage.buckets_analytics` se deriva otra vez del
persistent managed-data admission gobernado como `COPY_EMPTY` o
`COPY_NONEMPTY`. La ocupación target sólo se considera visible cuando la
sesión demuestra `rolsuper` o `rolbypassrls`; en otro caso ambos estados son
`UNVERIFIED`. Incluso `SAFE_EMPTY_TARGET_ONLY_CLOSURE` conserva
`RECOVERY_RESTORE_EXECUTE_TRUNCATE_FK_OPEN`: no se añadió ninguna tabla a
TRUNCATE ni se implementó compatibilidad FK.

```text
PPO-04M.5.3 =
ACTIVE / ICEBERG FK CLOSURE DIAGNOSTIC

EXACT INACTIVE STORAGE SCHEMA COMPATIBILITY =
REAL TARGET VERIFIED / PASS BY EVALUATOR PROGRESSION

COPY COLUMN COMPATIBILITY =
REAL TARGET VERIFIED / PASS BY EVALUATOR PROGRESSION

REQUIRED / GENERATED COLUMN COMPATIBILITY =
REAL TARGET VERIFIED / PASS BY EVALUATOR PROGRESSION

TRUNCATE FK CLOSURE =
BLOCKED / EXACT ICEBERG TARGET-ONLY EDGES

SEQUENCE COMPATIBILITY =
PENDING

MUTATION PRIVILEGES =
PENDING

ICEBERG FK CLOSURE DIAGNOSTIC =
IMPLEMENTED / PENDING REAL PREFLIGHT VERIFICATION

LOCAL RESTORE EXECUTOR CANDIDATE DIAGNOSTIC #5 =
NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW

REAL RESTORE ATTEMPT #7 =
NOT AUTHORIZED

PRODUCTION RESTORE =
NOT AUTHORIZED

TD-BACKUP-004 =
OPEN

CURRENT REAL RESTORE STORAGE SCOPE =
EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```


## Local Restore Executor Candidate Diagnostic #5 — evidencia semántica y compatibilidad exacta

El tooling inmutable `e363a24331b0cbc6b2815b146ea842c93fa73c6e`
se ejecutó antes de este bloque de implementación. Diagnostic #5 cerró de
forma segura en el mismo par exacto de edges Iceberg y aportó evidencia real
suficiente para clasificar la semántica como
`SAFE_EMPTY_TARGET_ONLY_CLOSURE`. No ejecutó restore SQL ni mutó el target.

```text
LOCAL RESTORE EXECUTOR CANDIDATE DIAGNOSTIC #5 =
CLOSED / FINDING / SAFE SEMANTIC EVIDENCE

TOOLING SHA =
e363a24331b0cbc6b2815b146ea842c93fa73c6e

code =
RECOVERY_RESTORE_EXECUTE_TRUNCATE_FK_OPEN

edgeCount =
2

parentIdentities =
storage.buckets_analytics

childIdentities =
storage.iceberg_namespaces
storage.iceberg_tables

sourceAnalyticsState =
COPY_EMPTY

occupancyVisibility =
VERIFIED

icebergNamespacesState =
EMPTY

icebergTablesState =
EMPTY

semanticState =
SAFE_EMPTY_TARGET_ONLY_CLOSURE

localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS

RESTORE_EXECUTOR_CANDIDATE_DIAGNOSTIC_5_EXIT_CODE = 1
```

El evaluator implementa ahora una compatibilidad estricta y fail-closed. Sólo
cuando vuelve a calcular en esa misma evaluación el topology exacto de dos
edges y toda la evidencia semántica segura, el conjunto efectivo de TRUNCATE
añade exclusivamente `storage.iceberg_namespaces` y
`storage.iceberg_tables`. Después vuelve a evaluar todo el catálogo FK; una
dependencia adicional conserva
`RECOVERY_RESTORE_EXECUTE_TRUNCATE_FK_OPEN`. No se usa `CASCADE`, no se
descubren descendants automáticamente y no se alteran constraints ni triggers.

La admisión managed-data compatible no cambia. Por ello las dos tablas Iceberg
añadidas requieren `TRUNCATE`, pero no `INSERT`; la validación de sequences
continúa usando únicamente la admisión compatible original. El PASS publica
`truncateFkCompatibility` como `NOT_REQUIRED` o
`EXACT_EMPTY_TARGET_ONLY_ICEBERG_CLOSURE`, mantiene
`truncateFkClosure = PASS` y no publica el conjunto efectivo. La autoridad
interna queda ligada por procedencia `WeakMap` al PASS y sólo entrega
`admission` y `truncateTables` mediante un accessor gobernado. Los objetos
fabricados fallan cerrados.

```text
PPO-04M.5.3 =
ACTIVE / EXACT ICEBERG TRUNCATE CLOSURE COMPATIBILITY

ICEBERG FK SEMANTICS =
SAFE_EMPTY_TARGET_ONLY_CLOSURE /
REAL TARGET VERIFIED

ICEBERG TRUNCATE CLOSURE COMPATIBILITY =
IMPLEMENTED / PENDING REAL PREFLIGHT VERIFICATION

SEQUENCE COMPATIBILITY =
PENDING

MUTATION PRIVILEGES =
PENDING

RESTORE EXECUTE PREFLIGHT QUERY COUNT =
GENERIC 5 / CANDIDATE 6

LOCAL RESTORE EXECUTOR CANDIDATE DIAGNOSTIC #6 =
NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW

REAL RESTORE ATTEMPT #7 =
NOT AUTHORIZED

PRODUCTION RESTORE =
NOT AUTHORIZED

TD-BACKUP-004 =
OPEN

CURRENT REAL RESTORE STORAGE SCOPE =
EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```

## 2026-10-06 — PPO-04M.6 Simple Backup / Restore V1

```text
LOCAL RESTORE EXECUTOR CANDIDATE DIAGNOSTIC #6 =
CLOSED / FAIL / INTERNAL TOOLING FAILURE

TOOLING SHA =
906f4cf16c184d95a2c0f5f8524a5a86ec8d2fe7

status = FAIL
phase = RESTORE_EXECUTOR_PREFLIGHT
code = RECOVERY_RESTORE_EXECUTOR_DIAGNOSTIC_FAILED
localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS
RESTORE_EXECUTOR_CANDIDATE_DIAGNOSTIC_6_EXIT_CODE = 1

PPO-04M.5.3 = SUSPENDED / SUPERSEDED
PPO-04M.6 = ACTIVE
PPO-04M.6.0 = REVIEWED / CLOSED
PPO-04M.6.1 = IMPLEMENTED / PENDING CODE REVIEW
SIMPLE BACKUP V1 = IMPLEMENTED / PENDING REAL PRODUCTION BACKUP VALIDATION
SIMPLE RESTORE V1 = DESIGNED / NOT IMPLEMENTED
LEGACY COMPLEX RECOVERY HARNESS = FROZEN / NOT ACTIVE PATH
DIAGNOSTIC #7 = CANCELLED
OLD REAL RESTORE ATTEMPT #7 = CANCELLED UNDER LEGACY APPROACH
PRODUCTION RESTORE = NOT AUTHORIZED
TD-BACKUP-004 = OPEN / REASSIGNED TO SIMPLE STORAGE RECOVERY VALIDATION
```

No se determinó la causa raíz porque se detuvo esta línea antes de instrumentar
Diagnostic #7. No se afirma que fallaran sequences, privileges ni el closure
Iceberg. La estrategia activa se define en
[PPO-04M.6 — Simple Backup / Restore V1](PPO_04M6_SIMPLE_BACKUP_RESTORE_V1.md).

| Bloque | Alcance | Estado |
| --- | --- | --- |
| PPO-04M.6.0 | Architecture Pivot / Documentation | `REVIEWED / CLOSED` |
| PPO-04M.6.1 | Simple Backup V1 Implementation | `REVIEWED / CLOSED` |
| PPO-04M.6.2 | Simple Restore V1 Implementation | `REVIEWED / CODE COMPLETE` |
| PPO-04M.6.3 | Real Backup + Managed Recovery Drill | `REVIEWED / CLOSED` |
| PPO-04M.6.4 | Operationalization / Retention / Optional Off-site Copy | `ACTIVE` |
| PPO-04M.6.4A | Non-empty Storage Recovery Validation | `REVIEWED / CLOSED` |
| PPO-04M.6.4B | Minimal Operational Backup Policy | `REVIEWED / CLOSED` |
| PPO-04M.6.4C | Lightweight Operational Runbook | `REVIEWED / CLOSED` |
| PPO-04M.6.4D | Optional Off-site Decision | `NEXT / OPTIONAL OFF-SITE DECISION` |
