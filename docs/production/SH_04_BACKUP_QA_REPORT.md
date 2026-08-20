# SH-04.1 — Backup QA report

**Fecha:** 2026-08-20  
**Estado:** IMPLEMENTED / PENDING ARCHITECTURAL REVIEW

## Scope

Se implementó y verificó el mecanismo técnico de backup self-hosted. No se ejecutó restore, no se modificaron datos originales y no se configuró SMTP.

## Evidence

- Backup ID: `20260820T133007Z-b66c7272`
- Dry-run: PASS
- Maintenance sequence: PASS
- Logical `pg_dumpall --no-role-passwords`: PASS — 2,497,233 bytes
- Physical PGDATA tar: PASS — 80,118,784 bytes
- Storage tar: PASS — 300,181,504 bytes
- Protected pgsodium key capture: PASS
- Checksums and explicit verify: PASS
- Supabase and Godel restart: PASS
- `/api/health/live`: PASS
- `/api/health/ready`: PASS
- Git ignore for data and protected artifacts: PASS
- Stop conditions: none

Artifacts remain local and ignored. This report contains no secret values, key contents, dump content, Storage listings, or checksum values.

## Limitation

The first historical backup used an isolated, read-only, no-new-privileges Docker run and `--pull=never`, and Docker Desktop bind-mount access required retaining root DAC capability. At that time, `--cap-drop=ALL` without restoring `DAC_OVERRIDE` was insufficient. Pass B2 subsequently demonstrated the definitive policy, `--cap-drop=ALL` with `--cap-add=DAC_OVERRIDE`, successfully in this environment. Windows ACL custody remains pending SH-04.3/PPO-06.

## Pass A robustness amendment

- Streaming SHA-256 and consumed `checksums.sha256`: PASS.
- Exact Supabase and Godel service sets: PASS.
- Disk-space preflight: PASS; the conservative estimate uses PGDATA, Storage,
  `max(512 MiB, PGDATA × 2)` for the logical dump, plus a safety margin.
- Missing checksum negative test: PASS (verify failed).
- Corrupt checksum negative test: PASS (verify failed).
- Unsafe protected-root negative test: PASS (rejected before maintenance).
- Runtime remained healthy throughout: PASS.

## Pass B2 nondestructive operational validation

- Fecha: 2026-08-20.
- Branch: `preprod/selfhosted-supabase`.
- Tested code commit: `1c3a2a83141aaf4653b4d41f0182c7939ac517e9`.
- Hardened dry-run: PASS.
- Filesystem-helper capability: PASS.
- PGDATA probe (read/traverse, `PG_VERSION`, temporary output write/delete): PASS.
- Storage probe (read/traverse): PASS.
- pgsodium probe (read/traverse, key readability, temporary protected output write/delete): PASS.
- Probe leftovers: 0.
- PostgreSQL stop signal observed: `SIGINT`.
- Capacity: required 1,184,873,017 bytes; data available 198,041,030,656 bytes; protected available 198,041,030,656 bytes.
- Dry-run did not acquire a lock: PASS.
- Lock-negative: expected FAIL before maintenance; PASS.
- Verify `.incomplete` negative: expected FAIL; PASS.
- Runtime remained healthy: PASS; `/api/health/live` and `/api/health/ready` returned 200.
- No backup created, no downtime, and no restore executed.
