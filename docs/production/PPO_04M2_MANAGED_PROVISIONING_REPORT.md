# PPO-04M.2 — Managed Provisioning Report

**Estado de PPO-04M.2:** `CLOSED / APPROVED`

**Estado de M.2A:** `CLOSED / APPROVED`

**Estado de M.2B:** `CLOSED / APPROVED`

**Siguiente bloque:** `PPO-04M.3 — ACTIVE / NEXT`

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

## 16. Verdict de M.2A (snapshot histórico)

```text
PPO-04M.0 = CLOSED / APPROVED
PPO-04M.1 = CLOSED / APPROVED
PPO-04M.2 = ACTIVE / IN PROGRESS
PPO-04M.2A = CLOSED / APPROVED
PPO-04M.2B = ACTIVE / MANUAL PASSWORD CHECKPOINT
PPO-04M.3–PPO-04M.7 = NOT STARTED
PRODUCTION DEPLOYMENT = NOT EXECUTED
```

M.2A pasa: baseline exacta, historia remota exacta, hardening aprobado, lint
limpio y smokes estructurales satisfactorios. M.2 permanece abierto porque aún
faltan bootstrap de identidades y validación funcional Auth/Storage de M.2B.

## 17. M.2B — bootstrap del primer administrador

Fecha del checkpoint: 2026-09-16.

Preflight previo a mutaciones, con salida reducida a booleanos:

```text
SUPABASE_PROJECT_ID = present
SUPABASE_DB_PASSWORD = present
GODEL_BOOTSTRAP_ADMIN_EMAIL = present
GODEL_BOOTSTRAP_ADMIN_FULL_NAME = present
GODEL_BOOTSTRAP_ADMIN_TEMP_PASSWORD = present
.env.managed.local = present / ignored
linked state = present / ignored
linked project = expected
managed URL project = expected
Auth users empty = true
target Auth user absent = true
public.perfiles empty = true
```

`supabase db query --help` confirmó soporte de `--linked --file`. Se usó ese
canal con archivos temporales ignorados bajo `.codex`; no se pasó contraseña,
project ref, URL ni connection string en argumentos. La autoridad remota se
reconfirmó con las seis migraciones 01–06 alineadas local/remoto.

El primer intento del arnés no llegó al checkpoint porque el subproceso SQL
interno no pudo certificar la operación. Se activó la compensación: el usuario
Auth recién creado fue eliminado y después se confirmó por canales separados
que Auth y `public.perfiles` habían vuelto a quedar vacíos. El reintento separó
Auth y SQL para mantener evidencia inequívoca.

Bootstrap efectivo:

- primer usuario creado mediante `auth.admin.createUser` con email confirmado;
- no se envió `app_metadata.godel_provisioning` ni otro marcador de lifecycle;
- perfil insertado directamente una sola vez con el UUID de Auth;
- contrato verificado dentro de la misma transacción: rol `admin`, activo,
  `must_change_password = true`, `created_by = null` y nombre esperado;
- existencia del usuario Auth reconfirmada al finalizar;
- no se usó `SUPABASE_SERVICE_ROLE_KEY` ni cliente admin para tablas de negocio;
- no se alteraron migraciones, schema, policies, grants ni Storage.

Checkpoint obligatorio alcanzado:

```text
FIRST_ADMIN_CREATED
PROFILE_BOOTSTRAPPED
INITIAL_PASSWORD_CHANGE_REQUIRED
```

La ejecución se detiene aquí para que Dirección Técnica realice manualmente el
cambio inicial de contraseña mediante el flujo normal. No se modificó
`must_change_password` de forma directa. Hasta recibir confirmación explícita no
se ejecutarán lifecycle normal, pruebas RLS/grants, Auth/Storage funcional,
fixtures QA, cleanup ni cierre de M.2.

Estado en el checkpoint manual:

```text
PPO-04M.2 = ACTIVE / IN PROGRESS
PPO-04M.2A = CLOSED / APPROVED
PPO-04M.2B = ACTIVE / MANUAL PASSWORD CHECKPOINT
PPO-04M.3–PPO-04M.7 = NOT STARTED
PRODUCTION DEPLOYMENT = NOT EXECUTED
```

## 18. M.2B — verificación post-checkpoint

Dirección Técnica confirmó el cambio inicial mediante el flujo normal y la
redirección correcta al dashboard, sin compartir la contraseña definitiva. El
canal PostgreSQL linked verificó después:

```text
profile count = 1
role = admin
is_active = true
must_change_password = false
created_by = null
operational admin = true
```

Para ejercer el backend sin leer la contraseña definitiva se obtuvo una sesión
efímera del mismo administrador mediante Auth Admin y un magic link consumido
íntegramente en memoria. No se imprimieron ni persistieron action links, OTP,
JWT, refresh tokens o credenciales.

## 19. Lifecycle normal de identidades QA

Se crearon tres identidades sintéticas separadas bajo `example.com`:

```text
QA admin
QA supervisor
QA worker
```

Cada alta recorrió el contrato normal:

```text
admin authenticated session
→ begin_internal_user_creation_attempt(role)
→ auth.admin.createUser con godel_provisioning
→ Auth trigger
→ public.perfiles
→ complete_internal_user_creation_attempt(succeeded)
→ login temporal
→ auth.updateUser({ password })
→ complete_initial_password_change(user_id)
→ login definitivo
```

Para las tres identidades se verificaron Auth user, perfil, rol exacto,
`is_active = true`, `created_by` igual al administrador operativo,
`must_change_password = true` antes del cambio y `false` después, además de una
auditoría `succeeded` cerrada.

El caso inválido usó un marcador cuyo creador era supervisor. El trigger lo
rechazó atómicamente: no quedó Auth user ni perfil, y el intento se cerró como
`failed / provisioning_error`. No se utilizó inserción directa de perfiles para
las identidades QA.

Las contraseñas aleatorias quedaron exclusivamente en
`.env.managed.qa.local`, confirmado como ignored. Las tres identidades se
conservan para PPO-04M.4; son sintéticas, no contienen PII real y deben
eliminarse o deshabilitarse antes de PPO-04M.6.

## 20. RLS y grants funcionales

Casos aceptados:

- `anon` no pudo leer `perfiles` ni tablas internas;
- admin autenticado pudo leer el conjunto administrativo de perfiles y datos;
- supervisor autenticado obtuvo las lecturas autorizadas de gestión;
- trabajador sólo vio su propio perfil cuando no tenía asignaciones;
- admin y supervisor mantuvieron su acceso de lectura autorizado.

Casos rechazados:

- supervisor y trabajador no pudieron iniciar creación de usuarios internos;
- trabajador no pudo insertar un cliente;
- la operación rechazada no dejó fila residual;
- el trabajador no obtuvo acceso al objeto interno QA, staged ni committed.

La comprobación PostgreSQL independiente confirmó cuatro perfiles operativos:
el primer administrador y las tres identidades QA.

## 21. Storage funcional

Se reutilizó como referencia el probe PPO-03C.3 sobre un arnés temporal
ignorado, contrastado con 01–06 y extendido para listing, descarga y verificación
independiente de cleanup. Playwright Chromium headless se usó únicamente como
transporte browser para TUS cross-origin; no se inició servidor Next.js ni se
ejecutó QA visual de producto, que permanece en M.4.

### Public signed TUS

```text
public request/reservation = PASS
valid capability authorization = PASS
invalid capability = REJECTED
regular anonymous TUS = REJECTED
signed TUS without signature = REJECTED
signed TUS with invalid signature = REJECTED
signed TUS POST/PATCH/HEAD/resume = PASS
staged listing/download by anon or worker = REJECTED
finalize = committed
finalize retry = already_committed
committed metadata listing by admin = PASS
authorized signed download = PASS
```

La descarga directa del SDK quedó bloqueada por el contrato de operación de la
policy; la ruta autorizada real de firma server-side sí descargó exactamente el
payload esperado. Ninguna URL firmada se registró.

### Authenticated TUS

```text
admin reservation = PASS
foreign/unassigned worker reservation = REJECTED
TUS without JWT = REJECTED
authenticated TUS POST/PATCH/HEAD/resume = PASS
staged listing/download by anon or worker = REJECTED
finalize = committed
finalize retry = already_committed
committed metadata listing by admin = PASS
authorized signed download = PASS
committed download by unassigned worker = REJECTED
```

El primer intento del probe detectó una limitación del harness histórico: daba
por exitoso un `remove` de objeto committed aunque la policy sólo permite borrar
candidatos reconciliados como `expired`. La fila Storage residual fue detectada
por el SQL independiente, reconstruida como control de cleanup expirado,
eliminada con la sesión QA admin y verificada a cero. El probe final preparó
ambos objetos por el mismo contrato antes del borrado y completó limpio.

Conteos finales independientes:

```text
solicitudes = 0
pedidos = 0
archivos = 0
archivo_carga_sesiones = 0
archivo_carga_items = 0
storage.objects en godel-files = 0
```

## 22. Autoridad final y seguridad

La historia final local/remota continúa exactamente en:

```text
20260811131824
20260811131825
20260811131826
20260811131827
20260811131828
20260811131829
```

No existe migration 07 ni se modificaron 01–06. `npm run audit:security` terminó
sin violaciones bloqueantes después de normalizar un placeholder documental
histórico de elipsis tipográfica a `...`; no era una clave real. La secret key
se limitó a Auth Admin/lifecycle autorizado y no se usó para tablas de negocio,
RLS ni Storage. No se ejecutaron lint/build porque no cambió código de
aplicación, TypeScript, dependencias ni schema.

## 23. Verdict final

```text
PPO-04M.0 = CLOSED / APPROVED
PPO-04M.1 = CLOSED / APPROVED
PPO-04M.2 = CLOSED / APPROVED
PPO-04M.2A = CLOSED / APPROVED
PPO-04M.2B = CLOSED / APPROVED
PPO-04M.3 = ACTIVE / NEXT
PPO-04M.4–PPO-04M.7 = NOT STARTED
PRODUCTION DEPLOYMENT = NOT EXECUTED
```

DB, Auth, RLS y Storage provisionados funcionan sobre la baseline Managed
congelada. El siguiente bloque es PPO-04M.3 — Vercel Hobby Deployment; este
cierre no implica que exista despliegue productivo.
