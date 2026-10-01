# PPO — Preproducción y Puesta en Operación

## Metadatos

- Actualización de estado: 2026-09-21

- Proyecto: Godel Diseño
- Estado: Activo
- Fecha de creación: 2026-07-21
- Última revisión: 2026-09-21
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
PPO-04M.3 queda `CLOSED / APPROVED`; PPO-04M.4 queda
`CLOSED / QUALIFIED PRODUCTION QA ACCEPTANCE`; PPO-04M.5 queda
`ACTIVE / PG_DUMP SEQUENCE SET REMEDIATION`, con M.5.0 `CLOSED / ARCHITECTURE APPROVED`,
M.5.1 `CLOSED / LOCAL INTEGRATION APPROVED`
(`DATABASE SECRET-SAFE TRANSPORT`, `AGE ENCRYPTION`, `RCLONE S3` y
`STORAGE METADATA + BYTE RESTORE ORDER` localmente probados) y
M.5.2.0 `CLOSED / PRODUCTION BACKUP PREPARATION APPROVED`, M.5.2.1A
`CLOSED / R2 CUSTODY ADAPTER APPROVED`, M.5.2.1B
`CLOSED / R2 SYNTHETIC CUSTODY PASS`, M.5.2.1C
`CLOSED / PRODUCTION AGE RECOVERY IDENTITY CUSTODY PASS`, M.5.2
`CLOSED / FIRST PRODUCTION BACKUP + EXTERNAL CUSTODY VERIFIED`, M.5.3.0
`CLOSED / RESTORE DRILL ARCHITECTURE APPROVED`, M.5.3A `CLOSED / SOURCE
VERIFICATION TOOLING APPROVED`, M.5.3B `CLOSED / ISOLATED TARGET + RESTORE
TOOLING APPROVED`, M.5.3B.2 `CLOSED / REAL LOCAL TARGET COMPATIBILITY VERIFIED`,
M.5.3C.0 `CLOSED / REAL RESTORE EXECUTION CONTRACT APPROVED` y M.5.3C.1
`IMPLEMENTED / ARCHITECTURAL CORRECTIONS APPLIED / PENDING ARCHITECTURAL
REVIEW`; sus límites reales son operator-governed, no usa `TRUNCATE CASCADE` y
el gate FK post-restore está implementado. M.5.3D.2 queda `CLOSED / REAL LOCAL
RECOVERY APPLICATION COMPATIBILITY VERIFIED` tras el PASS real de Attempt #9;
M.5.3 queda `ACTIVE / PG_DUMP SEQUENCE SET REMEDIATION`.
Cloudflare R2
Standard queda seleccionado y sintéticamente verificado como custodia externa.
Dirección Técnica confirmó como operador el Bucket Lock de `production/` por
8 días; el tooling no verificó programáticamente el Dashboard. La custodia de
la identity age Productiva queda `OPERATOR-ATTESTED / VERIFIED` con dos copias
independientes;
y PPO-04M.6–PPO-04M.7 permanecen `NOT STARTED`. PPO-04 global continúa
`ACTIVE / NEXT` porque todavía faltan M.5, M.6 y M.7. El Production pilot
rollout permanece `NOT EXECUTED`.

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
PPO-04M.5.3 = ACTIVE / PG_DUMP SEQUENCE SET REMEDIATION
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
REAL RESTORE ATTEMPT #3 = NOT AUTHORIZED
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
