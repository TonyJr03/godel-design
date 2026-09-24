# PPO-04M.5.2.1B — Cloudflare R2 Synthetic Remote Proof

**Estado:** `CLOSED / R2 SYNTHETIC CUSTODY PASS`

**Fecha de ejecución:** 2026-09-24

**Ejecución:** manual por Dirección Técnica

**Git branch:** `ops/managed-free-production-pilot`

**Git HEAD:** `eec9d95fd94f4bfa560dd708ecd66862b14c226f`

**Production runtime authority:** `01552f8bee59b5f9982a2d722e39795461918f43`

## 1. Alcance y fuente de evidencia

Este reporte registra de forma sanitizada la evidencia real suministrada por
Dirección Técnica después de ejecutar una única vez el harness aprobado de
PPO-04M.5.2.1A. No reejecuta el proof ni realiza solicitudes adicionales a R2.

La prueba usó exclusivamente datos sintéticos y el namespace de integración.
No accedió a Supabase, Vercel, datos Auth reales, archivos Godel reales,
backups Productivos ni al namespace `production/`.

## 2. Autoridad y preflight

```text
branch exacta = PASS
HEAD exacto = PASS
worktree clean = PASS

rclone = 1.75.1
age = 1.3.1
age-keygen = 1.3.1

endpoint validation = PASS
bucket configuration = PASS
credential transport = environment
```

No se registran endpoint, Account ID, bucket, Access Key ID, Secret Access Key,
identity privada age ni rutas temporales locales.

## 3. Resultado del proof

```text
PPO-04M.5.2.1B = CLOSED / R2 SYNTHETIC CUSTODY PASS
Cloudflare R2 = PASS
namespace class = integration
proofRunId = GDR2-20260924T004942Z-AMA3E67K
synthetic backupId = GDBK-20260924T004942Z-WPLYOQ6G

ciphertext upload = PASS
ciphertext download = PASS
ciphertext SHA-256 roundtrip = PASS
receipt publication = PASS
receipt download/schema = PASS
receipt -> ciphertext verification = PASS
local temporary cleanup = PASS
```

El resultado sanitizado del harness fue:

```json
{
  "status": "PASS",
  "proofRunId": "GDR2-20260924T004942Z-AMA3E67K",
  "backupId": "GDBK-20260924T004942Z-WPLYOQ6G",
  "remoteResidue": "EXPECTED_UNTIL_MANUAL_OPERATOR_CLEANUP"
}
```

## 4. Residuo remoto sintético

El proof no incluyó ni ejecutó delete. El namespace esperado permanece como
evidencia hasta que Dirección Técnica decida retirarlo manualmente mediante el
Dashboard:

```text
integration/GDR2-20260924T004942Z-AMA3E67K/
  synthetic.age
  synthetic.external-receipt.json

SYNTHETIC REMOTE RESIDUE = EXPECTED / PENDING MANUAL OPERATOR CLEANUP
```

La eventual eliminación manual no forma parte de M.5.2.1B. Este residuo no es
un backup Productivo y no autoriza objetos bajo `production/`.

## 5. Bucket Lock Productivo

Dirección Técnica confirmó manualmente la configuración siguiente:

```text
R2 PRODUCTION PREFIX LOCK = OPERATOR-CONFIRMED
prefix = production/
minimum retention = 8 days
```

Esta evidencia es una atestación del operador. El tooling no consultó ni
verificó programáticamente el Dashboard y el token S3 del proof no administra
la configuración del bucket.

## 6. Actividad y límites

```text
Cloudflare R2 integration operations = EXECUTED / SYNTHETIC ONLY
R2 production/ operations = 0
Supabase Production operations = 0
Supabase Managed DB connections = 0
Production Storage operations = 0
Vercel operations = 0
Production backup artifacts = 0
remote delete operations = 0
```

M.5.2 no queda cerrado por este resultado. La custodia de la identity age
Productiva continúa pendiente de decisión de Dirección Técnica y el primer
backup Production sigue sin autorización.

## 7. Estado final y siguiente gate

```text
PPO-04M.5.2.1A = CLOSED / R2 CUSTODY ADAPTER APPROVED
PPO-04M.5.2.1B = CLOSED / R2 SYNTHETIC CUSTODY PASS
EXTERNAL CUSTODY DESTINATION = CLOUDFLARE R2 / SELECTED + SYNTHETICALLY VERIFIED
R2 REMOTE SYNTHETIC PROOF = PASS
R2 PRODUCTION PREFIX LOCK = OPERATOR-CONFIRMED / 8 DAYS
NEXT GATE = PRODUCTION AGE RECOVERY IDENTITY CUSTODY
FIRST PRODUCTION BACKUP = NOT AUTHORIZED
```
