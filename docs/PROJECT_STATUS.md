# Estado del proyecto

Última actualización: 2026-09-25

## Estado general

Godel Diseño mantiene un MVP interno funcional, la baseline de base de datos
congelada y evidencia técnica aprobada tanto en entornos managed como en el
workstream self-hosted. El deployment técnico de Vercel Production existe, fue
aceptado mediante health/runtime smoke y permanece protegido por Vercel
Authentication.

```text
PRODUCTION DEPLOYMENT = READY
PRODUCTION ACCEPTANCE = PASS
PRODUCTION EXPOSURE = PROTECTED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

El primer destino real vigente es Vercel Hobby + Supabase Managed Free. PPO-04M
está `ACTIVE / NEXT`; PPO-04M.0–PPO-04M.3 están `CLOSED / APPROVED`. M.2A
aplicó y aceptó la baseline 01–06, M.2B validó bootstrap, lifecycle Auth,
RLS/grants, Storage/TUS y cleanup, y M.3 aceptó el deployment técnico protegido.
El Site URL de Supabase está alineado con el dominio Production estable.
PPO-04M.4 queda `CLOSED / QUALIFIED PRODUCTION QA ACCEPTANCE`; PPO-04M.5 queda
`ACTIVE / PRODUCTION BACKUP PREPARATION`. M.5.0 está `CLOSED / ARCHITECTURE APPROVED`;
M.5.1 está `CLOSED / LOCAL INTEGRATION APPROVED`, M.5.2.0 está
`CLOSED / PRODUCTION BACKUP PREPARATION APPROVED`, M.5.2.1A está
`CLOSED / R2 CUSTODY ADAPTER APPROVED` y M.5.2.1B está
`CLOSED / R2 SYNTHETIC CUSTODY PASS`. M.5.2.1C está `CLOSED / PRODUCTION AGE
RECOVERY IDENTITY CUSTODY PASS`; M.5.2.1D está `WRITER FREEZE ORDERING CORRECTION /
PENDING FINAL REVIEW`; M.5.2.1E está `PAUSED AFTER SAFE ATTEMPT #2`
y M.5.3 sigue
`NOT STARTED`. El primer backup Production no fue completado. Todavía no se realizó el pilot rollout ni se afirma que el sistema
esté públicamente operativo.

## Arquitectura vigente

```text
DEVELOPMENT / E2E
Next.js development
+
Supabase CLI/local workflow
```

```text
CURRENT PRODUCTION TARGET
Vercel Hobby / Next.js
+
Supabase Managed Free
  ├── PostgreSQL
  ├── PostgREST
  ├── Auth
  └── Storage
```

```text
FUTURE SELF-HOSTED R&D
LSH
→ Supabase Slim
→ decision gate
→ portable Slim stack OR PostgreSQL/PostgREST/own Auth/own Storage
```

El Managed Free Pilot no usa Nginx, Docker, VPS ni Supabase Self-Hosted en
producción. Desarrollo/E2E mantiene su arquitectura actual. Godel Diseño se
considera por ahora personal/no comercial; si su uso cambia materialmente,
debe reevaluarse la elegibilidad de Vercel Hobby.

## Baseline de base de datos

La baseline congelada contiene exactamente seis migraciones consolidadas:

1. `20260811131824_01_core_schema.sql`
2. `20260811131825_02_security_rls_grants.sql`
3. `20260811131826_03_business_rpcs.sql`
4. `20260811131827_04_storage.sql`
5. `20260811131828_05_auth_admin_user_lifecycle.sql`
6. `20260811131829_06_final_hardening.sql`

```text
BASELINE 01–06 = FROZEN
```

El Managed Pilot aplicó esas seis migraciones sobre una baseline limpia, sin
seed productivo salvo decisión explícita. Toda evolución DB posterior debe usar
una migración nueva `07+`.

## Estado de gobernanza

| Bloque | Estado |
| --- | --- |
| PPO-00 | `CLOSED` |
| PPO-01 | trabajo residual de host diferido a LSH/self-host futuro |
| PPO-02 | `CLOSED`; evidencia managed histórica relevante |
| PPO-03 | `CLOSED / APPROVED` |
| PPO-04 | `ACTIVE / NEXT` — Managed Free Production Pilot |
| PPO-04M | `ACTIVE / NEXT` |
| PPO-04M.0 | `CLOSED / APPROVED` |
| PPO-04M.1 | `CLOSED / APPROVED` |
| PPO-04M.2 | `CLOSED / APPROVED` |
| PPO-04M.2A | `CLOSED / APPROVED` |
| PPO-04M.2B | `CLOSED / APPROVED` |
| PPO-04M.3 | `CLOSED / APPROVED` |
| PPO-04M.4 | `CLOSED / QUALIFIED PRODUCTION QA ACCEPTANCE` |
| PPO-04M.5 | `ACTIVE / PRODUCTION BACKUP PREPARATION` |
| PPO-04M.5.0 | `CLOSED / ARCHITECTURE APPROVED` |
| PPO-04M.5.1 | `CLOSED / LOCAL INTEGRATION APPROVED` |
| PPO-04M.5.2.0 | `CLOSED / PRODUCTION BACKUP PREPARATION APPROVED` |
| PPO-04M.5.2.1A | `CLOSED / R2 CUSTODY ADAPTER APPROVED` |
| PPO-04M.5.2.1B | `CLOSED / R2 SYNTHETIC CUSTODY PASS` |
| PPO-04M.5.2.1C | `CLOSED / PRODUCTION AGE RECOVERY IDENTITY CUSTODY PASS` |
| PPO-04M.5.2.1D | `WRITER FREEZE ORDERING CORRECTION / PENDING FINAL REVIEW` |
| PPO-04M.5.2.1E | `PAUSED AFTER SAFE ATTEMPT #2` |
| PPO-04M.5.3 | `NOT STARTED` |
| PPO-04M.6–PPO-04M.7 | `NOT STARTED` |
| PPO-05 | `PENDING` — seguridad pública/antiabuso |
| PPO-06 | `PENDING` — backup/recovery managed |
| PPO-07 | `PENDING` — observabilidad/operación managed |
| PPO-08–PPO-09 | `PENDING` |
| PPO-10 | `DEFERRED` — eventual migración productiva post-LSH |
| SH full-stack | `FROZEN AS REFERENCE ARCHITECTURE` |
| SH-05 | `PAUSED / INCOMPLETE` |
| LSH | `PLANNED / NOT STARTED` |

```text
PRODUCTION DEPLOYMENT = READY
PRODUCTION ACCEPTANCE = PASS
PRODUCTION EXPOSURE = PROTECTED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
FINAL PUBLICATION ATOMICITY = APPROVED
DATABASE SECRET-SAFE TRANSPORT = LOCALLY PROVEN
STORAGE METADATA + BYTE RESTORE ORDER = LOCALLY PROVEN
AGE ENCRYPTION = LOCALLY PROVEN
RCLONE S3 = LOCALLY PROVEN
FIRST PRODUCTION BACKUP = NOT COMPLETED
LOCAL INTEGRATION = PASS
EXTERNAL CUSTODY DESTINATION = CLOUDFLARE R2 / SELECTED + SYNTHETICALLY VERIFIED
R2 REMOTE SYNTHETIC PROOF = PASS
R2 BUCKET = NOT PROVISIONED BY TOOLING
R2 PRODUCTION PREFIX LOCK = OPERATOR-CONFIRMED / 8 DAYS
PRODUCTION AGE RECOVERY IDENTITY CUSTODY = OPERATOR-ATTESTED / VERIFIED
PRIVATE IDENTITY ON CAPTURE HOST = NO INTENTIONAL PERSISTENT COPY
RECOVERY COPIES = 2 / INDEPENDENT OPERATOR CUSTODY
NEXT GATE = WRITER FREEZE ORDERING FINAL REVIEW
ATTEMPT #3 = NOT AUTHORIZED
REMOTE ACTIVITY = 0
```

## Evidencia y capacidades Self-Hosted conservadas

SH-01, SH-02, SH-03 y SH-04 conservan `CLOSED / APPROVED`. Permanecen válidos
la baseline, integración App/Nginx/Supabase Self-Hosted, QA production-like,
backup/restore, secretos, update/rollback y runbook técnico.

También sigue disponible el tooling genérico de producción que materializa:

```text
Git exacto
→ App/Nginx linux/amd64
→ deterministic tags
→ verified artifacts
→ sanitized manifest
→ checksum
```

Docker/release/backup/restore/secret generations son capacidades disponibles
para un futuro self-hosted ligero; no son requisitos del Managed Free Pilot y
no prueban que se haya realizado un build o despliegue productivo.

SH-05 no está cerrado. SH-05.0–SH-05.2 conservan sus cierres reales;
SH-05.3 queda `PARTIALLY PROVEN / DEFERRED` y SH-05.4 queda `DEFERRED`.
Siguen pendientes el build Godel target-side completo, la autoridad exacta del
Dockerfile, la dependencia del frontend externo, la aceptación funcional/
Playwright, el cleanup final y el cierre agregado.

## Ruta activa

La arquitectura, variables, Auth, DB, Storage, compatibilidad Vercel y handoff
aprobados constan en
[PPO-04M.0 — Managed Architecture Audit](production/PPO_04M0_MANAGED_ARCHITECTURE_AUDIT.md).
La aceptación sanitizada del proyecto Supabase Free vacío consta en
[PPO-04M.1 — Supabase Free Project Report](production/PPO_04M1_SUPABASE_FREE_PROJECT_REPORT.md).
La aplicación exacta de 01–06, hardening, lint y smoke estructural constan en
[PPO-04M.2 — Managed Provisioning Report](production/PPO_04M2_MANAGED_PROVISIONING_REPORT.md).
El deployment Vercel, su aceptación técnica protegida y el Site URL alineado
constan en
[PPO-04M.3 — Vercel Hobby Deployment Report](production/PPO_04M3_VERCEL_HOBBY_DEPLOYMENT_REPORT.md).
El inventario durable, separación DB/Auth/Storage, bundle cifrado y contrato de
restore de M.5 constan en
[PPO-04M.5 — Managed Backup & Recovery Architecture](production/PPO_04M5_BACKUP_RECOVERY_DESIGN.md).

```text
PPO-04M.0  arquitectura y gobernanza — CLOSED / APPROVED
→ PPO-04M.1  proyecto Supabase Free productivo/piloto — CLOSED / APPROVED
→ PPO-04M.2A  baseline/hardening estructural — CLOSED / APPROVED
→ PPO-04M.2B  bootstrap y QA funcional Auth/Storage — CLOSED / APPROVED
→ PPO-04M.3  deployment Vercel Hobby — CLOSED / APPROVED
→ PPO-04M.4  QA managed propio — CLOSED / QUALIFIED ACCEPTANCE
→ PPO-04M.5.0  arquitectura backup/recovery — CLOSED / ARCHITECTURE APPROVED
→ PPO-04M.5.1  tooling core
  — CLOSED / LOCAL INTEGRATION APPROVED
→ PPO-04M.5.2.0  preparación backup/custodia — CLOSED / PRODUCTION BACKUP PREPARATION APPROVED
→ PPO-04M.5.2.1A  adapter de custodia R2 — CLOSED / APPROVED
→ PPO-04M.5.2.1B  proof sintético remoto R2 — CLOSED / PASS
→ PPO-04M.5.2.1C  custodia identity age Productiva — CLOSED / PASS
→ PPO-04M.5.2.1D  harness de primer backup Productivo — WRITER FREEZE ORDERING CORRECTION / PENDING FINAL REVIEW
→ PPO-04M.5.2.1E  ejecución del primer backup Productivo — PAUSED AFTER SAFE ATTEMPT #2
→ PPO-04M.5.2  First Production Backup + External Custody — ACTIVE
→ PPO-04M.5.3  Restore Drill + Baseline Closure — NOT STARTED
→ PPO-04M.6  small initial real use
→ PPO-04M.7  estabilización y medidas reales
→ LSH (futuro, no iniciado)
```

La evidencia managed de PPO-02/PPO-03 es antecedente de compatibilidad. El
nuevo entorno debe tener aceptación propia, backup fuera de Supabase y control
de capacidad/free-tier antes de depender de él para datos reales.

La integración local desechable de M.5.1 probó transporte DB secret-safe,
captura/restauración lógica con continuidad Auth, cifrado streaming `tar → age`
y restore ordenado de metadata antes de bytes mediante `rclone` S3, sin
duplicados y con hashes coincidentes. El tooling no publica externamente ni
autoriza acceso a Production.

## Capacidades funcionales disponibles

- Solicitud pública y tracking público `/estado`.
- Dashboard interno por rol, clientes, solicitudes, pedidos y tareas.
- Archivos privados con reserva, TUS, finalize, listing y descarga protegida.
- Comentarios, historial, pagos y administración de usuarios internos.
- RLS, RPCs, policies y Auth Admin server-only según los contratos vigentes.

## Documentación gobernante

- [Roadmap PPO](production/PPO_ROADMAP.md)
- [PPO-04 — Managed Free Production Pilot](production/PPO_04_MANAGED_FREE_PILOT_PLAN.md)
- [Cierre del camino Self-Hosted VPS](production/PPO_04_SELF_HOSTED_VPS_PATH_CLOSURE.md)
- [Roadmap Self-Hosted de referencia](production/SH_ROADMAP.md)
- [LSH — Lightweight Self-Hosted](production/LSH_ROADMAP.md)
- [Deuda técnica activa](development/TECH_DEBT.md)
