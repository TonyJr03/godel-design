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

## Seguimiento read-only sanitizado

Después de corregir el cwd linked se realizó una validación read-only de la
captura completa. No fue un segundo intento de backup.

```text
Corrected linked dump roles diagnostic =
PASS

Full read-only capture diagnostic =
REACHED POST-DOWNLOAD INVENTORY /
FAILED LOCALLY WITH CAPTURE_PATH_UNSAFE

Production Storage =
EMPTY / 0 VISIBLE OBJECTS

Root cause =
EMPTY STORAGE LOCAL CAPTURE ROOT WAS NOT MATERIALIZED BY TOOLING

Production mutation =
0

R2 production publication =
0

Backup attempt #2 =
NOT EXECUTED
```

No se registran project refs, URLs, dumps, paths Productivos internos ni
credenciales.

## Correcciones locales

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

El adapter también valida que el único root de Storage local y el destino
estructural del plan `download-copy` sean exactamente el layout gobernado
`captureRoot/storage`. Ese directorio se materializa como root real y privado
antes de cualquier operación remota; no se añadieron sentinels ni flags rclone.

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
EMPTY STORAGE CAPTURE ROOT CORRECTED /
PENDING FINAL REVIEW

PPO-04M.5.2.1E =
PAUSED AFTER SAFE ATTEMPT #1

FIRST PRODUCTION BACKUP =
NOT COMPLETED

ATTEMPT #2 =
NOT AUTHORIZED
```
