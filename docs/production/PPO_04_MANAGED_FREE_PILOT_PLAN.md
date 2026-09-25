# PPO-04 — Managed Free Production Pilot

**Estado de PPO-04:** `ACTIVE / NEXT`

**Estado de PPO-04M:** `ACTIVE / NEXT`

**Bloque activo:** `PPO-04M.5 — ACTIVE / PRODUCTION BACKUP PREPARATION`

**Estado de PPO-04M.2:** `CLOSED / APPROVED`

**PPO-04M.0–PPO-04M.1:** `CLOSED / APPROVED`

**PPO-04M.3:** `CLOSED / APPROVED`

**PPO-04M.4:** `CLOSED / QUALIFIED ACCEPTANCE`

**PPO-04M.5:** `ACTIVE / PRODUCTION BACKUP PREPARATION`

**PPO-04M.5.0:** `CLOSED / ARCHITECTURE APPROVED`

**PPO-04M.5.1:** `CLOSED / LOCAL INTEGRATION APPROVED`

**PPO-04M.5.2.0:** `CLOSED / PRODUCTION BACKUP PREPARATION APPROVED`

**PPO-04M.5.2.1A:** `CLOSED / R2 CUSTODY ADAPTER APPROVED`

**PPO-04M.5.2.1B:** `CLOSED / R2 SYNTHETIC CUSTODY PASS`

**PPO-04M.5.2.1C:** `CLOSED / PRODUCTION AGE RECOVERY IDENTITY CUSTODY PASS`

**PPO-04M.5.2.1D:** `PQ AGE RECIPIENT VALIDATION CORRECTED / PENDING FINAL REVIEW`

**PPO-04M.5.2.1E:** `NOT STARTED`

**PPO-04M.5.3:** `NOT STARTED`

**FIRST PRODUCTION BACKUP:** `NOT EXECUTED`

**REMOTE ACTIVITY:** `0`

**EXTERNAL CUSTODY DESTINATION:** `CLOUDFLARE R2 / SELECTED + SYNTHETICALLY VERIFIED`

**R2 REMOTE SYNTHETIC PROOF:** `PASS`

**LOCAL INTEGRATION:** `PASS`

**PPO-04M.6–PPO-04M.7:** `NOT STARTED`

**Despliegue productivo:** `READY / ACCEPTED / PROTECTED`

**Production pilot rollout:** `NOT EXECUTED`

**Fecha de apertura:** 2026-09-16

**Roadmap maestro:** [PPO_ROADMAP.md](PPO_ROADMAP.md)

**Evidencia M.0:**
[PPO_04M0_MANAGED_ARCHITECTURE_AUDIT.md](PPO_04M0_MANAGED_ARCHITECTURE_AUDIT.md)

**Evidencia M.1:**
[PPO_04M1_SUPABASE_FREE_PROJECT_REPORT.md](PPO_04M1_SUPABASE_FREE_PROJECT_REPORT.md)

**Evidencia M.2:**
[PPO_04M2_MANAGED_PROVISIONING_REPORT.md](PPO_04M2_MANAGED_PROVISIONING_REPORT.md)

**Evidencia M.3:**
[PPO_04M3_VERCEL_HOBBY_DEPLOYMENT_REPORT.md](PPO_04M3_VERCEL_HOBBY_DEPLOYMENT_REPORT.md)

**Diseño M.5:**
[PPO_04M5_BACKUP_RECOVERY_DESIGN.md](PPO_04M5_BACKUP_RECOVERY_DESIGN.md)

```text
PPO-04M = ACTIVE / NEXT
PPO-04M.0 = CLOSED / APPROVED
PPO-04M.1 = CLOSED / APPROVED
PPO-04M.2 = CLOSED / APPROVED
PPO-04M.2A = CLOSED / APPROVED
PPO-04M.2B = CLOSED / APPROVED
PPO-04M.3 = CLOSED / APPROVED
PPO-04M.4 = CLOSED / QUALIFIED ACCEPTANCE
PPO-04M.5 = ACTIVE / PRODUCTION BACKUP PREPARATION
PPO-04M.5.0 = CLOSED / ARCHITECTURE APPROVED
PPO-04M.5.1 = CLOSED / LOCAL INTEGRATION APPROVED
PPO-04M.5.2.0 = CLOSED / PRODUCTION BACKUP PREPARATION APPROVED
PPO-04M.5.2.1A = CLOSED / R2 CUSTODY ADAPTER APPROVED
PPO-04M.5.2.1B = CLOSED / R2 SYNTHETIC CUSTODY PASS
PPO-04M.5.2.1C = CLOSED / PRODUCTION AGE RECOVERY IDENTITY CUSTODY PASS
PPO-04M.5.2.1D = PQ AGE RECIPIENT VALIDATION CORRECTED / PENDING FINAL REVIEW
PPO-04M.5.2.1E = NOT STARTED
PPO-04M.5.3 = NOT STARTED
PPO-04M.6–PPO-04M.7 = NOT STARTED
PRODUCTION DEPLOYMENT = READY
PRODUCTION ACCEPTANCE = PASS
PRODUCTION EXPOSURE = PROTECTED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

## 1. Objetivo y arquitectura gobernante

PPO-04M gobierna el primer despliegue real funcional de Godel Diseño con coste
de infraestructura de 0 USD:

```text
Browser
  │
  ├── Vercel Hobby / Next.js
  │
  └── Supabase Managed Free
          ├── PostgreSQL
          ├── PostgREST
          ├── Auth
          └── Storage
```

Este piloto no usa Nginx, Docker, VPS ni Supabase Self-Hosted en producción. El
registro de generaciones de secretos self-hosted tampoco es el mecanismo
productivo managed. Desarrollo y E2E conservan `Next.js development + Supabase
CLI/local workflow` hasta que una decisión explícita los cambie.

PPO-02 y PPO-03 aportan evidencia histórica de compatibilidad con Supabase
Managed, incluidos Storage, TUS y RPCs. No aceptan el nuevo entorno productivo:
PPO-04M debe generar evidencia propia.

## 2. Premisas y constraints

- Godel Diseño se considera actualmente personal y no comercial; bajo esa
  premisa se ha seleccionado Vercel Hobby.
- Si el uso del proyecto cambia materialmente, debe reevaluarse la elegibilidad
  del plan de hosting antes de continuar.
- Supabase Free está sujeto a límites, pausas y condiciones externas. Los
  límites del proveedor se revalidarán al ejecutar; este documento no congela
  cifras que puedan cambiar.

```text
provider limits are external and must be revalidated at execution time
```

- Se monitorizará capacidad y habrá un trigger de upgrade o migración si el
  margen del free tier deja de ser suficiente.
- Supabase Managed Free no se considera la única copia confiable de los datos.
- Los secretos y credenciales permanecen fuera de Git, documentación, logs y
  superficies cliente.
- `SUPABASE_SECRET_KEY` es server-only y solo puede ser consumida por el
  adaptador Auth Admin existente. No se usa `SUPABASE_SERVICE_ROLE_KEY` ni se
  crean clientes admin nuevos.

## 3. Estado de bloques

| Bloque | Nombre | Estado |
| --- | --- | --- |
| PPO-04M.0 | Managed Free Architecture & Governance | `CLOSED / APPROVED` |
| PPO-04M.1 | Supabase Free Production Project | `CLOSED / APPROVED` |
| PPO-04M.2 | Database / Auth / Storage Provisioning | `CLOSED / APPROVED` |
| PPO-04M.3 | Vercel Hobby Deployment | `CLOSED / APPROVED` |
| PPO-04M.4 | Managed Production QA | `CLOSED / QUALIFIED ACCEPTANCE` |
| PPO-04M.5 | Free-Tier Backup & Recovery Baseline | `ACTIVE / PRODUCTION BACKUP PREPARATION` |
| PPO-04M.6 | Production Pilot Rollout | `NOT STARTED` |
| PPO-04M.7 | Stabilization & Usage Measurement | `NOT STARTED` |

## 4. PPO-04M.0 — Managed Free Architecture & Governance

### Alcance

- cerrar formalmente la topología Browser → Vercel/Supabase Managed;
- asignar a Vercel el hosting/build/runtime Next.js y HTTPS administrado;
- asignar a Supabase PostgreSQL, PostgREST, Auth y Storage managed;
- inventariar variables públicas, variables server-only, responsables y
  superficies autorizadas sin registrar sus valores;
- confirmar que VPS readiness, Nginx, Docker productivo, full Supabase
  Self-Hosted y generación de secretos self-hosted dejan de ser gates;
- reutilizar baseline 01–06, contratos funcionales, RLS/RPC/policies, QA y
  evidencia managed previa como antecedentes, no como aceptación;
- registrar responsabilidades de operación, incidentes y decisión de pausa.

### Criterios de salida

- topología y límites aprobados por Dirección Técnica;
- inventario de configuración clasificado en público/server-only;
- separación clara entre proyecto de desarrollo y proyecto productivo/piloto;
- orden PPO-04M.1–PPO-04M.7 aceptado;
- dependencias, evidencia reutilizable y gates no aplicables documentados;
- confirmación de que, al cierre de M.0, aún no existía despliegue productivo.

### Cierre

La auditoría focal
[PPO_04M0_MANAGED_ARCHITECTURE_AUDIT.md](PPO_04M0_MANAGED_ARCHITECTURE_AUDIT.md)
confirma que no existe un cambio de código bloqueante previo a crear el proyecto
Supabase. El contrato Managed queda aprobado y el handoff pasa a PPO-04M.1.

## 5. PPO-04M.1 — Supabase Free Production Project

Crear, en una ejecución posterior autorizada, un proyecto Supabase Free
específico para producción/piloto. Esta fase debe:

- seleccionar y registrar la región adecuada;
- separar el proyecto productivo del desarrollo y de cualquier evidencia
  histórica;
- definir settings de Auth, URLs y redirects requeridos;
- mantener keys y credenciales fuera de Git;
- verificar una baseline limpia antes de provisionar;
- registrar ownership, acceso y recuperación administrativa de forma segura.

El proyecto fue aceptado sin aplicar la baseline ni crear datos. La evidencia
sanitizada, los límites de la verificación pública y el handoff constan en
[PPO_04M1_SUPABASE_FREE_PROJECT_REPORT.md](PPO_04M1_SUPABASE_FREE_PROJECT_REPORT.md).

## 6. PPO-04M.2 — Database / Auth / Storage Provisioning

Provisionar el entorno mediante la baseline vigente de exactamente seis
migraciones:

1. `20260811131824_01_core_schema.sql`
2. `20260811131825_02_security_rls_grants.sql`
3. `20260811131826_03_business_rpcs.sql`
4. `20260811131827_04_storage.sql`
5. `20260811131828_05_auth_admin_user_lifecycle.sql`
6. `20260811131829_06_final_hardening.sql`

```text
BASELINE 01–06 = FROZEN
```

No se ejecutará seed productivo salvo decisión explícita. Cualquier cambio DB
posterior seguirá siendo una migración nueva `07+`.

El gate debe validar:

- aplicación limpia y ordenada de 01–06;
- Auth y settings aprobados;
- creación de usuarios/perfiles iniciales por el mecanismo autorizado;
- bucket privado y metadata de Storage;
- RLS, grants, RPCs, triggers y policies;
- TUS autenticado, signed uploads públicos y finalize;
- separación staged/committed, listing y descargas protegidas;
- ausencia de datos seed no autorizados y consistencia de la baseline.

M.2A queda `CLOSED / APPROVED`: aplicó exactamente 01–06, confirmó historia
local/remota, hardening final, lint y smokes estructurales sin crear usuarios ni
objetos. M.2B queda `CLOSED / APPROVED`: completó el bootstrap, lifecycle Auth,
RLS/grants, TUS autenticado y público firmado, negativas y cleanup verificado.
PPO-04M.3 queda `CLOSED / APPROVED`; PPO-04M.4 queda
`CLOSED / QUALIFIED ACCEPTANCE` y PPO-04M.5 queda
`ACTIVE / PRODUCTION BACKUP PREPARATION`.
La evidencia acumulativa vive en
[PPO_04M2_MANAGED_PROVISIONING_REPORT.md](PPO_04M2_MANAGED_PROVISIONING_REPORT.md).

## 7. PPO-04M.3 — Vercel Hobby Deployment

El bloque ejecutó y aceptó:

- crear el proyecto Vercel y vincular la integración Git autorizada;
- configurar variables por entorno, separando públicas y server-only;
- comprobar que ninguna key server-only llega al cliente o al build público;
- construir y desplegar el Git exacto aprobado;
- aceptar inicialmente el dominio `*.vercel.app`;
- usar el HTTPS gestionado por Vercel;
- comprobar liveness, readiness y conectividad con Supabase Managed.

Un dominio propio no es gate inicial. No se crea `vercel.json` salvo evidencia
posterior de que sea necesario.

La evidencia sanitizada del deployment técnico, build, runtime smoke,
protección, límites de exposición cliente y alineación del Site URL consta en
[PPO_04M3_VERCEL_HOBBY_DEPLOYMENT_REPORT.md](PPO_04M3_VERCEL_HOBBY_DEPLOYMENT_REPORT.md).
Production queda `READY / ACCEPTED / PROTECTED`; el pilot rollout permanece
`NOT EXECUTED` y pertenece a PPO-04M.6.

## 8. PPO-04M.4 — Managed Production QA

PPO-04M.4 queda `CLOSED / QUALIFIED PRODUCTION QA ACCEPTANCE`. La aceptación
propia y sanitizada del entorno managed demostró el slice read-only completo,
la mutación aislada de solicitud, la mutación del header de plantilla y la
seguridad de cleanup sin residuo. No demostró CRUD de tareas de plantilla y no
se presenta como un Production PASS de ese subflujo.

```text
READ-ONLY MANAGED QA = PASS / 44 OF 44
ISOLATED SOLICITUD MUTATION = PASS
TEMPLATE HEADER MUTATION = DEMONSTRATED
TEMPLATE TASK CRUD = NOT DEMONSTRATED
MUTATING CLEANUP SAFETY = PASS
FINAL QA RESIDUE = ZERO
FULL VISUAL MUTATING QA = DEFERRED
KNOWN PRODUCT P0/P1 FROM M.4 = NONE OBSERVED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

M.4B.3 queda `CLOSED / PARTIAL PRODUCTION MUTATING QA`. M.4B.3.2 queda cerrado
sin aceptación como flujo completo: `TASK CRUD NOT DEMONSTRATED` no equivale a
`TASK CRUD PRODUCT DEFECT`. La suite histórica cubre ese CRUD y los runs no
mostraron HTTP 5xx, errores runtime, Auth ni configuración Supabase. No se
autoriza un tercer run de plantilla ni specs mutantes Production adicionales en
M.4.

PPO-04M.4C queda `DEFERRED / NOT AUTHORIZED ON CURRENT PRODUCTION / FUTURE
STAGING OR SAFE QA ENVIRONMENT`. `full-visual-qa.spec.ts` mezcla clientes,
pedidos, contador global, Storage, Auth/roles, configuración compartida y
relaciones no limpiables con seguridad. No se ampliarán privilegios QA, no se
usarán service role/secret key para negocio, no se relajará RLS y no se hará DB
reset. El gap de evidencia task CRUD es importante después del piloto y antes
de un rollout más amplio o QA en staging dedicado, pero no bloquea este piloto.

La evidencia de cierre vive en
[PPO_04M4_MANAGED_PRODUCTION_QA_REPORT.md](PPO_04M4_MANAGED_PRODUCTION_QA_REPORT.md).

## 9. PPO-04M.5 — Free-Tier Backup & Recovery Baseline

**Estado:** `ACTIVE / PRODUCTION BACKUP PREPARATION`

```text
external backup required
```

Antes de depender del piloto para datos reales debe aprobarse una estrategia
reproducible que cubra:

- schema;
- datos PostgreSQL;
- objetos y metadata de Storage necesarios;
- configuración que pueda documentarse y reconstruirse;
- checks/inventario de integridad;
- custodia fuera de Supabase.

Esta fase define discovery, responsabilidades, frecuencia mínima, verificación
y criterio de recuperación antes de seleccionar o implementar herramientas.
Las capacidades de SH-04 son antecedentes conceptuales; no se afirma que sus
mecanismos sean directamente compatibles con Supabase Managed Free. PPO-04M.5
es un gate mínimo del piloto y no cierra el workstream completo PPO-06.
M.5.0 queda `CLOSED / ARCHITECTURE APPROVED` mediante
[PPO_04M5_BACKUP_RECOVERY_DESIGN.md](PPO_04M5_BACKUP_RECOVERY_DESIGN.md):
inventaría estado durable, separa DB/Auth/metadata/bytes, recomienda export
lógico y copia S3-compatible cifrada, y fija los gates de restore. No creó
backup, credenciales S3, proyecto, conexión remota ni restore. El primer pase de
M.5.1 queda `CLOSED / LOCAL INTEGRATION APPROVED`:
además del core determinista, ejecutó SOURCE y TARGET locales desechables con
Auth, dump lógico, metadata y bytes Storage, rclone S3 y cifrado streaming age.
M.5.2.0 queda `CLOSED / PRODUCTION BACKUP PREPARATION APPROVED`;
su captura exige continuidad real password/identity para perfiles internos, las
dos tablas privadas durables de baseline 05 y confirmación operacional de writer
freeze. M.5.2.1A queda `CLOSED / R2 CUSTODY ADAPTER APPROVED`. Dirección
Técnica ejecutó el harness sintético una única vez y M.5.2.1B queda
`CLOSED / R2 SYNTHETIC CUSTODY PASS`. M.5.2.1C queda
`CLOSED / PRODUCTION AGE RECOVERY IDENTITY CUSTODY PASS` mediante atestación
operativa, y M.5.2.1D queda `PQ AGE RECIPIENT VALIDATION CORRECTED / PENDING
FINAL REVIEW`;
M.5.2.1E y M.5.3 permanecen
`NOT STARTED`.

El harness corregido exige igualdad exacta entre inventario Storage inicial,
inventario Storage final y la proyección local `path/size`. También exige Docker
client/Engine funcionales y coincidencia exacta entre la versión Supabase CLI
instalada y el devDependency gobernado antes de construir adapters.

Cloudflare R2 Standard queda seleccionado con bucket dedicado privado, acceso
público deshabilitado, sin custom domain ni Worker. El token futuro será S3
`Object Read & Write` limitado al bucket. Los prefixes son `integration/` y
`production/`; este último requiere Bucket Lock manual por un mínimo de 8 días.
No hay lifecycle auto-delete en M.5. El bucket no fue provisionado por tooling,
Dirección Técnica confirmó como operador el lock de `production/` por 8 días;
el tooling no verificó programáticamente el Dashboard. Dirección Técnica
atestó dos copias independientes verificadas de la identity age Productiva y
decrypt PASS con cada una; no se registran material privado ni ubicaciones.

La prueba local conservó UUID/hash Auth y login, restauró metadata antes de
bytes sin duplicados y verificó hashes coincidentes. No contactó Production,
Preview, Supabase Managed, Vercel ni S3 Production.

```text
DATABASE SECRET-SAFE TRANSPORT = LOCALLY PROVEN
STORAGE METADATA + BYTE RESTORE ORDER = LOCALLY PROVEN
AGE ENCRYPTION = LOCALLY PROVEN
RCLONE S3 = LOCALLY PROVEN
FINAL PUBLICATION ATOMICITY = APPROVED
LOCAL INTEGRATION = PASS
EXTERNAL CUSTODY DESTINATION = CLOUDFLARE R2 / SELECTED + SYNTHETICALLY VERIFIED
R2 REMOTE SYNTHETIC PROOF = PASS
R2 BUCKET = NOT PROVISIONED BY TOOLING
R2 PRODUCTION PREFIX LOCK = OPERATOR-CONFIRMED / 8 DAYS
PRODUCTION AGE RECOVERY IDENTITY CUSTODY = OPERATOR-ATTESTED / VERIFIED
PRIVATE IDENTITY ON CAPTURE HOST = NO INTENTIONAL PERSISTENT COPY
RECOVERY COPIES = 2 / INDEPENDENT OPERATOR CUSTODY
NEXT GATE = FIRST PRODUCTION BACKUP EXECUTION HARNESS FINAL ARCHITECTURAL REVIEW
FIRST PRODUCTION BACKUP = NOT EXECUTED
REMOTE ACTIVITY = 0
```

## 10. PPO-04M.6 — Production Pilot Rollout

```text
small initial real use
→ observe
→ stop on P0/P1
```

El rollout comienza con un grupo y volumen pequeños, responsables identificados
y criterios de pausa. No se amplía ante pérdida de datos, acceso no autorizado,
exposición de secretos, recuperación no confiable, errores core P0/P1 o falta
de margen operativo. La promoción requiere evidencia y aprobación expresa de
Dirección Técnica.

## 11. PPO-04M.7 — Stabilization & Usage Measurement

Durante estabilización se medirán, como mínimo:

- tamaño de la base PostgreSQL;
- uso de Storage;
- crecimiento de Storage;
- egress;
- frecuencia de uploads;
- tamaños promedio y pico de archivos;
- usuarios activos;
- concurrencia aproximada;
- volumen de requests;
- incidentes;
- margen disponible dentro del free tier.

Estas medidas alimentan el inventario y los benchmarks de LSH; no se estiman
como si fueran evidencia real antes del piloto.

## 12. Relación con PPO-05, PPO-06 y PPO-07

- PPO-05 conserva seguridad pública, antiabuso y rate limiting, con
  independencia de que el frontend se aloje en Vercel.
- PPO-06 diseñará backup/recovery productivo completo para Supabase Managed
  Free en la ruta actual; LSH tendrá después su modelo portable propio.
- PPO-07 adaptará observabilidad, alertas, incidentes y operación a Vercel y
  Supabase Managed.

Ninguno queda cerrado por este plan.

## 13. Condición de cierre

PPO-04M solo podrá cerrar con proyecto managed provisionado, deployment Vercel
aceptado, QA managed propio aprobado, backup externo reproducible, rollout
controlado y medidas iniciales registradas. Hasta entonces:

```text
PPO-04M = ACTIVE / NEXT
PRODUCTION DEPLOYMENT = READY
PRODUCTION ACCEPTANCE = PASS
PRODUCTION EXPOSURE = PROTECTED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```
