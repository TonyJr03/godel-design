# PPO-04M.2 — Managed Provisioning Report

**Estado de PPO-04M.2:** `ACTIVE / IN PROGRESS`

**Estado de M.2A:** `CLOSED / APPROVED`

**Siguiente bloque:** `M.2B — ACTIVE / NEXT`

**Fecha de ejecución:** 2026-09-16

**Despliegue productivo:** `NOT EXECUTED`

## 1. Scope / baseline

M.2A aplicó al proyecto Supabase Managed linked exactamente la baseline
congelada 01–06, verificó su autoridad, ejecutó las assertions finales, lint y
smokes estructurales públicos, y se detuvo antes de crear identidades o probar
flujos funcionales de Storage.

```text
remote clean project
→ apply exactly migrations 01–06
→ verify migration authority
→ verify final hardening
→ structural smoke
→ stop before users/files
```

No se modificó código, tests, migraciones, tipos, Docker, Compose, dependencias
ni configuración Auth. M.2 completo no se cierra en este pase.

## 2. Git and linked-project preflight

```text
branch = ops/managed-free-production-pilot
initial HEAD = 55a196b4608e1ea3ade2491773f05bd5fd0aeb90
initial worktree = clean
SUPABASE_PROJECT_ID present = true
SUPABASE_DB_PASSWORD present = true
linked project state present = true
linked project matches process project ID = true
managed env matches process project ID = true
```

Todos los checks fueron booleanos. No se imprimió project ref, contraseña,
token, URL completa, connection string ni key. `supabase/.temp/project-ref`
está ignorado y no existe estado linked tracked.

No se ejecutó `supabase status`: no aporta autoridad sobre el proyecto remoto y
su salida local puede mostrar credenciales del stack de desarrollo. Los gates
reales se ejecutaron con `--linked`.

## 3. Migration authority + hashes

`supabase/migrations` contiene exactamente seis archivos SQL y ninguna
migration 07+:

| Migration | SHA-256 |
| --- | --- |
| `20260811131824_01_core_schema.sql` | `0b3738b4fd813984216f1f498d59ad2d60e4c79ae59fabc4b4d67795e8e4a9ce` |
| `20260811131825_02_security_rls_grants.sql` | `a51b54635c0b44f4330ced461f43939d3de96326f89f022391d90a9b1245bdbc` |
| `20260811131826_03_business_rpcs.sql` | `2f1ccade03696272acce6ddf5b6981619d9fbb9c8a23ab6a82ba83342dc4e5fb` |
| `20260811131827_04_storage.sql` | `f35777e1ab0bcf2fdd888f1a51795620598d8de7ff01b3e4925a7e85bba9032e` |
| `20260811131828_05_auth_admin_user_lifecycle.sql` | `cf87182bc16be68a461ab6ca85adaf1bb3111800f0818a1b84c8332fc8090484` |
| `20260811131829_06_final_hardening.sql` | `e22d3d3c2a9814c59c7f32656022df141fedb2c3c2ea42b15d8d33cebd7aa4de` |

```text
BASELINE 01–06 = FROZEN
migration 07+ present = false
```

Ningún byte de 01–06 fue modificado.

## 4. Remote preflight

Comando:

```text
npx supabase migration list --linked
```

Resultado previo al push:

| Local | Remote |
| --- | --- |
| `20260811131824` | vacío |
| `20260811131825` | vacío |
| `20260811131826` | vacío |
| `20260811131827` | vacío |
| `20260811131828` | vacío |
| `20260811131829` | vacío |

```text
REMOTE GODEL MIGRATIONS = NONE
unexpected remote history = false
```

No se usó repair, reset, down ni pull.

## 5. Dry-run evidence

Comando:

```text
npx supabase db push --linked --dry-run
```

El dry-run propuso, y solo propuso:

1. `20260811131824_01_core_schema.sql`
2. `20260811131825_02_security_rls_grants.sql`
3. `20260811131826_03_business_rpcs.sql`
4. `20260811131827_04_storage.sql`
5. `20260811131828_05_auth_admin_user_lifecycle.sql`
6. `20260811131829_06_final_hardening.sql`

```text
seed proposed = false
extra migration proposed = false
roles proposed = false
history repair proposed = false
dry run = PASS
```

## 6. Apply evidence

Comando autorizado:

```text
npx supabase db push --linked
```

Resultado:

```text
01 APPLIED
02 APPLIED
03 APPLIED
04 APPLIED
05 APPLIED
06 APPLIED
exit code = 0
```

Supabase informó que `extensions` y `pgcrypto` ya existían y omitió recrearlos;
son componentes estándar esperados del proyecto Managed, no errores ni drift.
No hubo fallo parcial ni reintento.

## 7. Migration history post-apply

El segundo `npx supabase migration list --linked` demostró correspondencia
exacta:

| Local | Remote | Estado |
| --- | --- | --- |
| `20260811131824` | `20260811131824` | match |
| `20260811131825` | `20260811131825` | match |
| `20260811131826` | `20260811131826` | match |
| `20260811131827` | `20260811131827` | match |
| `20260811131828` | `20260811131828` | match |
| `20260811131829` | `20260811131829` | match |

```text
extra remote Godel migrations = none
migration authority = PASS
```

## 8. Final hardening acceptance

```text
MIGRATION 06 APPLIED SUCCESSFULLY
=
FINAL HARDENING ASSERTIONS PASSED
```

La migración 06 aborta si no se satisfacen sus contratos de tablas core,
servicios iniciales, RLS, firmas RPC, grants/revokes, objetos legacy ausentes,
Auth lifecycle, ownership/RLS de `storage.objects`, bucket, MIME y policies.
Su finalización con código 0 constituye el gate autoritativo de estructura.

No se duplicaron manualmente todas las assertions ni se usó SQL improvisado.

## 9. Remote DB lint

Comando:

```text
npx supabase db lint --linked --level warning --fail-on error
```

Schemas revisados: `extensions`, `private` y `public`.

```text
errors = 0
warnings = 0
db lint = PASS
```

No se editó la baseline para silenciar resultados.

## 10. PostgREST structural smoke

Todos los requests usaron exclusivamente la publishable key leída en memoria;
no se imprimió ni se usó secret key.

### `tipos_servicio`

```text
GET /rest/v1/tipos_servicio
httpStatus = 200
rowCount = 2
```

Contrato exacto:

- `Impresión`: descripción, workflow `impresion` y disponibilidad pública
  coinciden con la baseline;
- `Otro`: descripción, workflow `encargo` y disponibilidad pública coinciden;
- no apareció un tercer servicio.

El primer conteo del harness PowerShell encapsuló el array JSON como un solo
objeto aunque detectó ambas filas. Se repitió exclusivamente el GET con conteo
explícito del array: 2 filas y contrato exacto. No fue un fallo de DB.

### `perfiles`

```text
GET /rest/v1/perfiles?select=id&limit=1
httpStatus = 401
relationMissing = false
anonDataLeakage = false
```

En M.1 la misma relación era inexistente (`404`). Después de 01–06 existe, pero
`anon` no puede leer perfiles internos. El status exacto puede variar por
gateway; el contrato de existencia sin fuga quedó satisfecho.

## 11. Auth/Storage health

Probes no mutantes posteriores al push:

| Probe | Resultado |
| --- | --- |
| `GET /auth/v1/health` | HTTP 200 / reachable |
| `GET /auth/v1/settings` | HTTP 200 |
| Email/password | enabled |
| Public signup | disabled |
| Anonymous sign-ins | disabled |
| `GET /storage/v1/status` | HTTP 200 / reachable |

No se crearon usuarios ni objetos.

## 12. Storage structural contract

La migration 04 materializó y la migration 06 validó:

```text
bucket = godel-files
public = false
file_size_limit = 20971520
allowed MIME contract = exact
storage.objects owner = supabase_storage_admin
storage.objects RLS = enabled
```

Policies exactas aceptadas:

1. `godel_files_insert_reserved_internal_tus`
2. `godel_files_insert_reserved_public_sign`
3. `godel_files_select_committed`
4. `godel_files_delete_managed`

La assertion también confirmó que no existe policy anónima de select/update/
delete ni policies legacy. No se creó el bucket manualmente, no se enumeró
Storage con secret key y no se construyó una connection string adicional.

## 13. Data state

Datos canónicos creados por migrations:

```text
tipos_servicio = 2
Impresión = present / exact
Otro = present / exact
```

Esto forma parte de la baseline y no es un seed externo.

```text
external seed applied = false
business/operational user data created = false
Auth users created = false
uploaded Storage objects created = false
```

`supabase/seed.sql` existe en el repositorio, pero ni el dry-run ni el push lo
incluyeron. Las migraciones no insertan en `auth.users` ni `storage.objects`, y
M.2A no ejecutó ninguna operación que cree identidades u objetos. La ausencia
inicial aceptada en M.1 se conserva; no se usó secret key para enumerarlos.

## 14. Explicitly not executed

- migration 07, edición de 01–06, repair, reset, down, pull o rollback remoto;
- `--include-seed`, `--include-all`, `--include-roles` o seed externo;
- SQL Editor, `psql` remoto o connection string construida en argumentos;
- `db diff --linked` como falsa autoridad;
- creación manual de bucket, policies, perfiles o datos;
- Auth users, usuario admin, identidades QA o bootstrap local contra Managed;
- TUS, signed upload, finalize, download, cleanup o listing funcional;
- cambios de Auth settings, rotación de keys, Vercel o E2E;
- modificaciones de aplicación, tests, tipos generados, Docker, Compose o
  dependencias.

No hubo datos QA temporales, transacción de prueba ni rollback que ejecutar.
No se ejecutó lint/build de aplicación porque no cambió TypeScript/runtime.

## 15. M.2B handoff

M.2B debe completar el segundo pase de provisioning sin alterar 01–06:

1. diseñar y ejecutar el bootstrap especial del primer administrador;
2. validar trigger Auth → `public.perfiles` y lifecycle inicial;
3. crear solo las identidades/fixtures autorizadas y controladas;
4. comprobar roles, RLS y grants con casos válidos e inválidos;
5. validar atomicidad de RPCs relevantes con rollback cuando corresponda;
6. ejecutar TUS autenticado, signed upload público, finalize, listing,
   descarga protegida y cleanup con fixtures trazables;
7. verificar ausencia de residuos y documentar estado final de datos;
8. cerrar PPO-04M.2 solo si DB/Auth/Storage funcionales pasan íntegramente.

El script `bootstrap-local-qa-users.mjs` no gobierna Managed y no fue usado ni
modificado.

## 16. Verdict

```text
PPO-04M.0 = CLOSED / APPROVED
PPO-04M.1 = CLOSED / APPROVED
PPO-04M.2 = ACTIVE / IN PROGRESS
PPO-04M.2A = CLOSED / APPROVED
PPO-04M.2B = ACTIVE / NEXT
PPO-04M.3–PPO-04M.7 = NOT STARTED
PRODUCTION DEPLOYMENT = NOT EXECUTED
```

M.2A pasa: baseline exacta, historia remota exacta, hardening aprobado, lint
limpio y smokes estructurales satisfactorios. M.2 permanece abierto porque aún
faltan bootstrap de identidades y validación funcional Auth/Storage de M.2B.
