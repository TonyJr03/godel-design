# PPO-04M.5.2.1E — First Production Backup Attempt #1

**Resultado:** `FAILED SAFELY / LINKED CLI WORKING-DIRECTORY DEFECT`

**Fecha:** 2026-09-25

## Evidencia sanitizada

El primer intento Productivo superó el listado inicial read-only de Storage y
se detuvo en el primer comando de base de datos. El CLI no pudo resolver el
contexto linked porque el adapter lo ejecutó desde el capture root en vez del
repositorio gobernado. No se ejecutó `supabase link` ni se copió su contexto al
área de captura.

```text
PPO-04M.5.2.1E attempt #1 =
FAILED SAFELY / LINKED CLI WORKING-DIRECTORY DEFECT

Initial Storage listing =
PASS / 0 objects

DB dump roles =
NOT EXECUTED SUCCESSFULLY /
CLI FAILED TO RESOLVE LINKED PROJECT CONTEXT

Bundle =
NOT REACHED

Encryption =
NOT REACHED

R2 production publication =
NOT REACHED

Local Productive backup artifacts =
0

Production mutations =
0
```

El output root quedó vacío:

```text
IncompleteReceipts = 0
FinalCiphertexts = 0
VerifiedReceipts = 0
R2CiphertextDownloads = 0
R2ReceiptDownloads = 0
CaptureDirectories = 0
StagingDirectories = 0
```

No se registran project ref, credenciales, endpoints, URLs ni backup IDs.

## Corrección local

El boundary Productivo separa ahora:

```text
Supabase CLI cwd = repoRoot
dump --file targets = captureRoot/database/*
```

Cada plan debe contener exactamente un `--file` con uno de los cinco artifact
paths gobernados. El adapter crea un nuevo argv con destino absoluto contenido
en el capture root y conserva inmutable el plan base. El transporte de
`SUPABASE_DB_PASSWORD` permanece exclusivamente por environment, con shell
deshabilitado y sin `--password` ni `--db-url`.

Este pase correctivo fue exclusivamente local:

```text
Supabase requests = 0
Managed DB connections = 0
Production Storage operations = 0
R2 operations = 0
Vercel operations = 0
```

## Estado

```text
PPO-04M.5.2.1D =
LINKED CLI CWD CORRECTION /
PENDING REVIEW

PPO-04M.5.2.1E =
PAUSED AFTER SAFE ATTEMPT #1

FIRST PRODUCTION BACKUP =
NOT COMPLETED
```
