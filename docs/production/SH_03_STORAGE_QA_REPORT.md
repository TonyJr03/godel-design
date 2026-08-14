# SH-03.3 — Storage/TUS production-like QA

## Estado

SH-03.3A = IMPLEMENTED / PENDING ARCHITECTURAL REVIEW

Alcance de A: inventario, baseline production-like y portabilidad exclusiva de
instrumentación E2E. No se modificaron producto, control plane, TUS adapter,
RLS, RPC, policies, DB, migraciones, Compose, Nginx, Dockerfile ni Supabase
upstream.

## Inventory

### Pedido actions

- `reservePedidoFilesAction` delega en `reservePedidoUpload`.
- `finalizePedidoFileAction` delega en `finalizePedidoUpload`, llama a
  `revalidatePedidoDetail` y devuelve el resultado committed.
- El consumidor `PedidoFileUploadForm.tsx` mantiene la cola de dos, obtiene el
  JWT de sesión, sube por TUS y tras éxito invoca `router.refresh()`.

### Public actions

- `startPublicSolicitudAction` (rama files), `signPublicSolicitudFileAction` y
  `finalizePublicSolicitudFileAction` viven en
  `src/app/(publico)/solicitud/actions.ts`.
- Sus servicios son `reservePublicUpload`, `signPublicUpload` y
  `finalizePublicUpload`; los consumidores son `PublicSolicitudForm.tsx` y
  `PublicSolicitudUploadQueue.tsx`.

### TUS adapter, list/download y cleanup

- `src/lib/storage/constants.ts`: bucket privado `godel-files`, máximo 20 MiB,
  máximo diez items, chunk TUS de 6 MiB y extensiones permitidas.
- `src/lib/storage/upload-control/`: descriptores, parsers, reserva, firma y
  finalize autoritativo. Las rutas nuevas son `cargas/v1/...`.
- `src/lib/storage/tus/`: `tus-js-client`, JWT para Pedido y `x-signature` para
  público; sus URLs resumibles sólo viven en memoria.
- `list-pedido-files.ts` y `list-solicitud-files.ts` devuelven DTOs internos sin
  `file_path` ni bucket. `signed-url.ts` genera URL firmada server-side de 120 s
  y `download-route.ts` redirige después de validar IDs/permisos.
- `cleanupExpiredUploads` es server-only; `runExpiredUploadsCleanupAction` es su
  consumidor UI administrativo y expone sólo conteos seguros.

## Data plane

| Flujo | Secuencia | Autorización bytes | Resultado |
| --- | --- | --- | --- |
| Pedido | reserve → `/storage/v1/upload/resumable` → finalize | Bearer user JWT | committed |
| Public | reserve → sign → `/storage/v1/upload/resumable/sign` → finalize | `x-signature`, sin Bearer | committed |

Común: `godel-files` es privado; máximo 20 MiB por archivo, diez items por
sesión, chunk de 6 MiB, concurrencia dos y paths `cargas/v1/...`. No se
registraron tokens, firmas, capability, bodies ni object paths.

## DB policies/helpers read-only

Se inspeccionó, sin modificar, la baseline congelada 01–06:
`20260811131827_04_storage.sql`.

- `private.can_sign_public_upload` junto con
  `godel_files_insert_reserved_public_sign` permite a `anon` sólo firmar/insertar
  un item público reservado, open y no expirado con descriptor válido.
- `private.can_create_internal_upload` junto con
  `godel_files_insert_reserved_internal_tus` exige `authenticated`, perfil
  activo, Pedido accesible, sesión propia y visibilidad derivada; permite create
  y part TUS.
- `private.can_read_committed_storage_object` junto con
  `godel_files_select_committed` gobierna select/sign/get autenticado de objetos
  committed cuya metadata y relación autorizada coinciden.
- `private.can_manage_upload_storage_object`, la rama delete de select y
  `godel_files_delete_managed` permiten sólo a admin activo borrar staged
  expirado/partial tras grace, sin metadata committed.

Una corrección DB posterior requeriría migration 07+ y queda fuera de A.

## Matriz Storage

| Surface / action | Consumer | Auth | Mutation | Revalidation / refresh | Baseline | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| `reservePedidoFilesAction` | `PedidoFileUploadForm` | interno | reserve | ninguna | bloqueado antes de TUS | 3.3B |
| `finalizePedidoFileAction` | `PedidoFileUploadForm` | interno | finalize | revalidate + `router.refresh()` | no alcanzado | 3.3B |
| `startPublicSolicitudAction` files | formulario público | anon/capability | reserve | cola UI | PASS | 3.3C |
| `signPublicSolicitudFileAction` | cola pública | capability | sign | ninguna | PASS | 3.3C |
| `finalizePublicSolicitudFileAction` | cola pública | capability | finalize | UI completed | PASS | 3.3C |
| cleanup action/service | mantenimiento | admin | reconcile/delete | `ActionState` local | PASS | 3.3E |
| list Pedido | detalle Pedido | interno | no | server render | fixture no determinista | 3.3D |
| list Solicitud | detalle Solicitud | admin/supervisor | no | server render | fixture no determinista | 3.3D |
| Pedido download route | link interno | interno | URL firmada | redirect | IDs inválidos PASS | 3.3D |
| Solicitud download route | link interno | interno | URL firmada | redirect | IDs inválidos/worker PASS | 3.3D |

## Original baseline

| Spec | Gate | Resultado original por Nginx |
| --- | --- | --- |
| `pedido-upload-direct.spec.ts` | 7 MiB authenticated, resume, batch/concurrencia 2, sesión inválida, límites y Pedido cancelado | proceso completo terminado externamente a 60 s; reruns focales fallaron antes de data plane por panel/campo inconsistente y timeout de `setInputFiles` |
| `public-solicitud-upload-direct.spec.ts` | 7 MiB signed, sin Bearer, resume/retry, sin Web Storage, batch/concurrencia 2, finalize-only retry y límites | primer caso PASS; segundo FAIL por detector `:3000`; los demás no ejecutados al detenerse el serial |
| `storage.spec.ts` | panel/list/download seguro, extensión bloqueada, IDs inválidos, worker denegado, tracking sin Storage | 4 PASS, 2 SKIP por ausencia de fixture estable Pedido/Solicitud |
| `mantenimiento.spec.ts` | parser/service, paths exactos, conteos, UI admin y denegación supervisor/worker | 4 PASS |

El timeout externo del proceso completo de Pedido no es un `PLAYWRIGHT FAIL`:
inició seis casos, pero la herramienta lo terminó a 60 s sin emitir fallo
Playwright desde ese proceso.

## Failure classification

- **A. STALE TEST ENVIRONMENT ASSUMPTION:** el spec público detectaba acciones
  con `url.origin === "http://localhost:3000"`. Bajo Nginx `:8080` registró cero
  actions aunque el TUS de 7 MiB completó. Pedido contenía el mismo detector.
- **B. STALE / NON-DETERMINISTIC FIXTURE:** `storage.spec.ts` omite los dos
  paneles internos cuando no encuentra un detalle estable; Pedido no alcanzó
  reserve/TUS de forma reproducible al abrir/encontrar el panel.
- **C. TEST INFRASTRUCTURE ISSUE:** corte externo del run completo de Pedido y
  timeout interno de 30 s en `setInputFiles` del caso focal de límites.
- **D/E/F/G:** ninguna regresión de producto, RLS/policy, finalize o posible
  TD-NEXT fue confirmada. El diferencial finalize Pedido quedó sin alcanzar; no
  se aplica workaround preventivo.

## Test portability

Cambios limitados a `pedido-upload-direct.spec.ts` y
`public-solicitud-upload-direct.spec.ts`:

- Detector anterior: puerto/origen `localhost:3000`.
- Detector nuevo: `POST`, header `next-action` presente y exclusión explícita de
  `/storage/`.
- La evidencia es no vacía: los gates 7 MiB exigen al menos un Server Action
  observado antes de calcular la máxima longitud; no aceptan `Math.max([], 0)`.
- El aislamiento se demuestra por path y semántica: TUS usa
  `/storage/v1/upload/resumable...`; el control plane usa POST `next-action`.
  Ambos pueden entrar por `http://localhost:8080`.
- No se capturan/imprimen IDs de action, JWT, firma, capability, body ni object
  path; los reintentos guardan sólo booleanos, conteos y longitudes.

Después de este cambio permitido, el spec público pasó 5/5: TUS signed de 7
MiB, Bearer ausente, HEAD/PATCH del mismo recurso, un control-plane POST antes
del TUS reanudado, sin Web Storage, batch de tres con máximo dos PATCH, retry de
finalize sin nuevo TUS y límites tempranos.

## Pedido observation

| Hito | Resultado |
| --- | --- |
| TUS completed | no alcanzado |
| finalize persisted | no alcanzado |
| metadata/list visible | no alcanzado |
| action completion | no alcanzado |
| UI completed | no alcanzado |
| `router.refresh()` settled | no alcanzado |

## Public observation and security

La evidencia pública completada confirma signed TUS y Bearer ausente. En los
gates completados de público, `storage` y mantenimiento no se observó fuga de
JWT, firma, capability, `file_path`, bucket, signed URL ni error técnico
SQL/Postgres/RLS; tracking público no ofrece descarga. La evidencia de Pedido
queda pendiente de 3.3B.

## Baseline, ownership and restrictions

Sin drift en baseline 01–06, migration 07, `database.types`, Supabase upstream,
Compose, Dockerfile ni Nginx. Ownership: A inventory/baseline/portability; B
Pedido authenticated/finalize; C público signed; D committed/list/download/RLS;
E cleanup/resilience/cierre agregado.

No product changes. No DB. No Storage architecture changes. No commit. No push.
Detenerse para revisión arquitectónica de SH-03.3A.

## Quality

- `npm run lint`: PASS.
- `git diff --check`: PASS; Git informa sólo normalización futura LF→CRLF en
  archivos existentes, sin error de whitespace.
- `npm run diff:check`: PASS; mismo aviso LF→CRLF, sin error de whitespace.
- `npm run test:e2e:selfhosted -- tests/e2e/public-solicitud-upload-direct.spec.ts --project=chromium --workers=1`:
  PASS 5/5 tras la corrección de portabilidad.
- `live`: 200; `ready`: 200.
- Drift final: sólo dos specs E2E y tres documentos (incluido este informe).
  Sin cambios de migración, tipos, upstream, Compose, Dockerfile ni Nginx.
