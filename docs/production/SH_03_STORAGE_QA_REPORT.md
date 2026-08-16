# SH-03.3 — Storage/TUS production-like QA

## Estado

SH-03.3A = CLOSED / APPROVED
SH-03.3B = CLOSED / APPROVED
SH-03.3C = CLOSED / APPROVED
SH-03.3D = CLOSED / APPROVED
SH-03.3E = CLOSED / APPROVED

Alcance de A: inventario, baseline production-like y portabilidad exclusiva de
instrumentación E2E. No se modificaron producto, control plane, TUS adapter,
RLS, RPC, policies, DB, migraciones, Compose, Nginx, Dockerfile ni Supabase
upstream.

## Inventory

### Pedido actions

- `reservePedidoFilesAction` delega en `reservePedidoUpload`.
- `finalizePedidoFileAction` delega en `finalizePedidoUpload` y devuelve el
  resultado committed sin revalidación de éxito.
- El consumidor `PedidoFileUploadForm.tsx` mantiene la cola de dos, obtiene el
  JWT de sesión, sube por TUS y tras éxito confirmado navega una vez al detalle
  canónico mediante el fallback TD-NEXT-001 acotado.

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
| `reservePedidoFilesAction` | `PedidoFileUploadForm` | interno | reserve | ninguna | PASS | 3.3B |
| `finalizePedidoFileAction` | `PedidoFileUploadForm` | interno | finalize | completion local + navegación canónica TD-NEXT-001 | PASS; `router.refresh()` stale reproducido | 3.3B |
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

## SH-03.3B — Pedido authenticated TUS + finalize differential

La fixture anterior sólo esperaba el `h1` del detalle y abría inmediatamente el panel Files. El auto-review canónico todavía podía estar navegando, por lo que el panel/campo resultaba racy. La estabilización limitada al helper espera el `h1` exacto, `En revisión` visible y ausencia de `Iniciando revisión` antes de abrir Files. Clasificación: **STALE / RACY fixture**. No hubo cambio de producto para la fixture.

El primer gate aislado se ejecutó tres veces independientes por Chromium/Nginx con el mismo resultado: reserva, TUS authenticated y finalize completados. La instrumentación conserva sólo método, pathname y presencia booleana de Bearer: se observaron POST/PATCH TUS a `/storage/v1/upload/resumable`, con Bearer, sin registrar JWT, IDs de action, cuerpos ni `object_path`.

El diferencial confirmó: TUS completó; `finalizePedidoFileAction` devolvió éxito y la UI local mostró completion; pero la lista permaneció stale tras `router.refresh()`. Una navegación documental diagnóstica a la URL canónica mostró el archivo y su enlace de descarga, confirmando persistencia de metadata antes de aplicar cualquier fallback.

Se reprodujo por tanto **TD-NEXT-001** únicamente en el success path `finalizePedidoFileAction` / `PedidoFileUploadForm`. Se retiró sólo la revalidación de éxito de esa action. La cola procesa todos los ítems localmente y navega una única vez a su href canónico con `window.location.assign()` sólo cuando el batch queda completamente exitoso. Un batch parcial conserva diálogo, ítems completed y retry; el retry sólo navega al completar el último pendiente. El comentario TD-NEXT-001 queda inmediato a cada llamada. No se extendió el fallback a reserve ni a flujos públicos.

También se configuró un nombre de cookie de sesión compartido entre los clientes browser, server y proxy. Antes, el hostname interno `api-gw:8000` y el hostname del navegador `localhost:8080` derivaban nombres por defecto distintos: el servidor veía sesión y el browser no podía obtener el JWT para TUS. Ahora el namespace se deriva de `protocol + host` de `NEXT_PUBLIC_SUPABASE_URL`, no de `SUPABASE_SERVER_URL`: client/server/proxy usan el mismo nombre por runtime y local CLI/self-hosted quedan aislados por host/puerto. No expone ni registra secretos.

El gate partial batch usa dos PDF pequeños y aborta controladamente el PATCH de un único recurso TUS. El primer resultado fue 1 completed / 1 failed, sin navegación documental, con `Carga completada parcialmente` y Retry visible. Tras permitir el recurso, Retry reutilizó el mismo TUS resource mediante HEAD/PATCH, sin segunda reserva; hubo una única navegación canónica y la lista fresca mostró ambos archivos y dos descargas, sin texto técnico. Los gates restantes de Pedido pasaron de forma aislada: primer 7 MiB 3/3 (y 1/1 tras namespace); resume con HEAD/PATCH del mismo recurso; batch de tres con máximo dos PATCH concurrentes; sesión invalidada sin TUS; límites con once archivos, 20 MiB + 1 byte y SVG; y cancelación sin input ni mensaje de carga. El caso worker/list/download se difiere explícitamente a SH-03.3D porque requiere una fixture adicional de asignación; no se usó como razón para modificar producto.

## SH-03.3C — Public Solicitud signed TUS

El patrón público actual se ejecutó primero sin cambios de producto y pasó 5/5;
la suite final reforzada pasó 6/6 por Chromium/Nginx. El gate Impresión 7 MiB
demostró reserve/control-plane no vacío, TUS POST/PATCH con offsets 0 y 6 MiB,
path exclusivo `/storage/v1/upload/resumable/sign`, `x-signature` presente,
Bearer ausente y máximo POST de control plane menor de 128 KiB. La UI terminó
en `Recibido` y `Archivos recibidos: 1`.

Resume interrumpió PATCH y confirmó que Retry re-firma el mismo item: HEAD y
PATCH reutilizan el mismo recurso TUS; el único control-plane antes de TUS en
retry es la nueva firma, no una segunda reserva. El snapshot de keys de
`localStorage` y `sessionStorage` quedó idéntico antes/después; no hay keys
relacionadas con TUS, `godel-v1` ni `cargas/v1`.

El batch de tres creó una sola Solicitud/reserva, usó tres recursos y mantuvo
máximo dos PATCH concurrentes; los tres finalize terminaron `Recibido` y el
conteo fue `Archivos recibidos: 3`. El retry exclusivo de finalize no añadió
ninguna request TUS. El nuevo gate partial batch usó dos PDF pequeños: uno
terminó recibido y el PATCH del otro se abortó de manera controlada. La
Solicitud permaneció registrada, el formulario quedó disabled, apareció
`Solicitud registrada con archivos pendientes` y Retry. Al permitir el recurso,
Retry re-firmó/reanudó el mismo TUS resource, sin segunda Solicitud/reserva, y
ambos finalizaron `Recibido`.

Los límites de 11 archivos, 20 MiB + 1 byte y SVG se rechazaron antes de crear
Solicitud/reserva: cero Server Actions de control plane y cero requests TUS.
La evidencia negativa de capability permanece en el control plane ya aprobado:
`private.can_sign_public_upload` y la policy
`godel_files_insert_reserved_public_sign` restringen firma a item reservado,
open, no expirado y descriptor válido. No se capturó capability, firma, token,
body, ID ni path para fabricar casos de navegador.

No se observó capability, firma, Bearer, bucket/path, UUID, correo ni errores
SQL/Postgres/RLS en UI pública. `PUBLIC CURRENT PATTERN = SAFE`: no hay nueva
manifestación TD-NEXT ni fallback documental. Listado/download interno,
aislamiento RLS, worker denial y cleanup permanecen fuera de C, para 3.3D/3.3E.

## Pedido observation

| Hito | Resultado |
| --- | --- |
| TUS completed | PASS, POST/PATCH authenticated por TUS |
| finalize persisted | PASS, confirmado con navegación diagnóstica canónica |
| metadata/list visible | PASS tras navegación canónica |
| action completion | PASS, completion local observado antes del fallback |
| UI completed | PASS, lista y enlace fresco tras fallback documental |
| `router.refresh()` settled | FAIL reproducido; cubierto por TD-NEXT-001 |

## Public observation and security

La evidencia pública completada confirma signed TUS y Bearer ausente. En los
gates completados de público, `storage` y mantenimiento no se observó fuga de
JWT, firma, capability, `file_path`, bucket, signed URL ni error técnico
SQL/Postgres/RLS; tracking público no ofrece descarga. El cross-check posterior
al namespace de cookie pasó 5/5 por Chromium/Nginx, sin cambios de producto
público.

## Baseline, ownership and restrictions

Sin drift en baseline 01–06, migration 07, `database.types`, Supabase upstream,
Compose, Dockerfile ni Nginx. Ownership: A inventory/baseline/portability; B
Pedido authenticated/finalize; C público signed; D committed/list/download/RLS;
E cleanup/resilience/cierre agregado.

La corrección de B modificó sólo el boundary de cookie de sesión y el success
path confirmado de finalize Pedido. C modifica exclusivamente la spec pública y
documentación: no cambia producto público, DB, migraciones, tipos, Storage
architecture changes, Compose, Dockerfile, Nginx ni Supabase upstream. No
commit. No push. Detenerse para revisión arquitectónica de SH-03.3C.

## SH-03.3D — Functional signed-download gate (resolved)

El fixture determinista de Pedido ya demostró: listado Admin, aislamiento por
owner (404 sin redirect Storage), listado Supervisor, listado Worker asignado,
TUS autenticado pequeño del Worker y revocación posterior sin redirect Storage;
el `storage.spec.ts` histórico mantiene 4 PASS y 2 SKIP legítimos.

El nuevo primer hop funcional de descarga autorizada de Pedido se ejecutó por
Chromium/Nginx con `maxRedirects: 0`. La ruta interna devolvió 3xx y `Location`,
pero el destino firmado tuvo pathname bajo `/storage/v1/` y el origen interno
`http://api-gw:8000`, mientras el origen público navegable es
`http://localhost:8080`. Por tanto, `browser-reachable signed URL = false` e
`internal-only hostname = true`. No se registraron URL firmada completa, query,
token, firma, pathname de objeto ni body.

Clasificación: **REAL PRODUCT REGRESSION — SIGNED URL
PUBLIC/INTERNAL ENDPOINT MISMATCH**. El navegador no puede seguir ese destino
interno, por lo que no procede declarar descarga funcional ni continuar los
gates de Solicitud, commit boundary, tracking ni matriz final de D. No se tocó
producto, base de datos, migraciones, Supabase upstream, Compose, Dockerfile ni
Nginx; tampoco se creó workaround de URL rewriting.

| Gate D | Resultado |
| --- | --- |
| Pedido Admin first hop | 3xx con `Location`; FAIL de origen público |
| Pedido signed origin browser-reachable | FAIL (`false`) |
| Pedido signed hostname internal-only | FAIL (`true`) |
| Pedido follow/file bytes | No ejecutado por stop condition |
| Supervisor/Worker functional download | No ejecutado por stop condition |
| Worker identity exacta / Solicitud / commit boundary | No ejecutado por stop condition |
| Worker removed / anonymous | Evidencia parcial previa preservada; no revalidada tras el stop |

La decisión arquitectónica aprobada se aplicó exclusivamente en el boundary de
`createSignedFileUrl`: el cliente server-side sigue firmando mediante
`SUPABASE_SERVER_URL`; `getSupabasePublicUrl()` exige
`NEXT_PUBLIC_SUPABASE_URL`; la URL resultante se acepta sólo desde el origen
server/public y con prefijo `/storage/v1/`, y se normalizan sólo protocol/host.
Se preservan pathname, query, token y TTL. No hubo cambios de Nginx, Compose,
DB, migraciones, tipos ni Supabase upstream.

La regresión quedó resuelta por Chromium/Nginx: Pedido Admin, Supervisor y
Worker asignado recibieron primer hop 3xx, origen público y bytes PDF; Worker
retirado tuvo denegación segura sin redirect ni bytes y anónimo recibió 307 sólo
hacia login. La asignación UI fue verificada contra la identidad exacta del
Worker mediante cliente QA normal y `pedido_trabajadores`.

Solicitud pública A completó reserve → signed TUS → finalize → `Recibido`.
Admin y Supervisor ven la lista segura y descargan bytes PDF con el mismo
contrato; owner B y Worker reciben denegación sin redirect Storage ni bytes.
Tracking público de la Solicitud committed no muestra nombre de archivo,
descarga ni metadata Storage.

La frontera staged → committed también pasó: tras TUS y el bloqueo único de
finalize, `public.archivos` devolvió 0 filas para el nombre de fixture y el
panel interno no mostró archivo ni descarga. Retry ejecutó finalize sin nuevas
requests TUS; después devolvió exactamente una fila, el panel mostró un enlace
interno y la descarga funcional pasó.

| Surface | Admin | Supervisor | Worker assigned | Worker removed | Anonymous |
| --- | --- | --- | --- | --- | --- |
| Pedido list | PASS | PASS | PASS | DENIED | N/A |
| Pedido download | PASS | PASS | PASS | DENIED | DENIED (307 login) |
| Pedido small upload | PASS | N/A | PASS | N/A | N/A |
| Solicitud list | PASS | PASS | DENIED | DENIED | N/A |
| Solicitud download | PASS | PASS | DENIED | DENIED | N/A |
| Public tracking | N/A | N/A | N/A | N/A | PASS (safe) |

SH-03.3D queda `CLOSED / APPROVED`.

## SH-03.3E — Cleanup / resilience / Storage closure

### Initial PPO-03F block

El primer gate obligatorio se ejecutó sin cambios de producto ni DB mediante
`scripts/sql/ppo-03f-lifecycle-qa.sql` contra el servicio `db` del Compose
self-hosted. El harness abre una transacción y termina en `ROLLBACK`; no dejó
fixtures ni cambios persistidos.

El harness falló en el primer resultado de
`public.reconciliar_cargas_expiradas(100, 100)` con
`PPO-03F lifecycle reconciliation result mismatch`: los conteos/candidatos
observados no satisfacen la matriz exacta que el harness vigente espera para
expired/partial/completed. No se ejecutaron cleanup físico, time-warp, UI de
mantenimiento ni los specs agregados de E, conforme al stop condition.

Clasificación: **INCOMPATIBILIDAD A INVESTIGAR ENTRE EL HARNESS PPO-03F Y LA
BASELINE SELF-HOSTED ACTUAL**. No se modificaron migrations, RPC, RLS, policies,
cleanup service, TUS, Storage, Nginx, Compose, Dockerfile ni Supabase upstream.
No se imprimieron secretos, paths de objeto, tokens, capabilities ni URLs
firmadas. Se requiere revisión arquitectónica antes de adaptar el harness o
corregir la baseline; SH-03.3E no puede cerrarse.

### Harness isolation

Corrección arquitectónica posterior: el diagnóstico read-only confirmó 8
sesiones `open` vencidas preexistentes, por lo que PPO-03F se aisló bajo
`BEGIN`/`ROLLBACK` con fixtures prioritarias y assertions target-scoped. El
harness pasó con `PPO_03F_LIFECYCLE_QA_OK`; `mantenimiento.spec.ts` pasó 4/4.
No cambió la RPC ni la baseline.

### Time-warp constraint block

El siguiente gate físico quedó bloqueado inicialmente por un constraint vigente:
`archivo_carga_sesiones_expires_after_creation_check` impide que una sesión
creada por la fixture real lleve sólo `expires_at` al pasado. El time-warp
autorizado prohíbe alterar `created_at`, status, items u objetos, por lo que no
existe una mutación QA permitida para alcanzar cleanup grace. No se ejecutó la
UI de cleanup físico ni se dejó una spec o script QA fallidos. Se requiere una
decisión arquitectónica sobre un mecanismo de tiempo QA compatible; no se
modificó producto, DB, migration, RLS, cleanup service ni infraestructura.
Las tentativas del gate crearon fixtures públicas persistentes con prefijos
`QA SH-03.3E Committed` y `QA SH-03.3E Expired`; no se borraron de forma
forzada al no existir todavía una vía de expiración permitida.

### Architectural resolution

La decisión posterior autorizó un time-warp QA coherente: conserva TTL y orden
relativo al desplazar sólo timestamps permitidos de la fixture exacta. Antes y
después del desplazamiento, el script QA verifica TTL positivo/invariable,
orden `solicitud <= sesión <= item < expires_at`, estado `open`/`reserved`,
sin metadata pública y un único objeto real asociado.

### Physical cleanup evidence

El gate físico pasó con TUS staged real y finalize bloqueado. Tras el
mantenimiento Admin por UI, el verificador read-only target-scoped confirmó:
sesión `expired`, item `expired`, `public.archivos` ausente y objeto físico
ausente mediante `archivo_carga_items.object_path → storage.objects`. La
segunda ejecución confirmó de nuevo el mismo estado target, sin asumir conteos
globales sobre el backlog.

El control committed mantuvo metadata presente, el listado interno mostró el
archivo y la descarga firmada pasó antes y después de cleanup (ruta interna
3xx, origen público, `application/pdf` y prefijo `%PDF`), incluida la
comprobación posterior a la segunda pasada.

- Pre-cleanup: session `open`; item `reserved`; `public.archivos = 0`; objeto
  real asociado = 1.
- Post-cleanup: session `expired`; item `expired`; `public.archivos = 0`;
  objeto real asociado = 0.
- Committed: metadata = 1; descarga funcional antes y después del primer
  cleanup = PASS.
- Segundo cleanup: target = `SH_03_3E_CLEANUP_TARGET_OK`; committed funcional
  = PASS.

No hubo cambios de RPC, constraint, migration, RLS, cleanup productivo ni
infraestructura. SH-03.3E queda `CLOSED / APPROVED`.

## Quality

- `npm run lint`: PASS.
- `npm run build`: PASS.
- `npm run audit:security`: PASS.
- `git diff --check`: PASS; Git informa sólo normalización futura LF→CRLF en
  archivos existentes, sin error de whitespace.
- `npm run diff:check`: PASS; mismo aviso LF→CRLF, sin error de whitespace.
- `scripts/sql/ppo-03f-lifecycle-qa.sql`: PASS con
  `PPO_03F_LIFECYCLE_QA_OK` y `ROLLBACK`.
- `mantenimiento.spec.ts`: PASS 4/4.
- `storage-cleanup-selfhosted.spec.ts`: PASS 1/1; verificadores staged y
  cleanup físico target-scoped, control committed y segunda pasada incluidos.
- `storage-access-selfhosted.spec.ts`: PASS 2/2.
- `storage.spec.ts`: PASS 4/4, SKIP 2 previsto por ausencia de fixture estable.
- `npm run test:e2e:selfhosted -- tests/e2e/public-solicitud-upload-direct.spec.ts --project=chromium --workers=1`:
  PASS 6/6 tras el gate partial, Web Storage y límites no vacíos de C.
- `live`: 200; `ready`: 200.
- `pedido-upload-direct.spec.ts`, Chromium/Nginx, gates aislados: primer 7 MiB
  PASS 3/3 y 1/1 posterior al namespace; resume, batch, partial batch, sesión
  invalidada, límites y cancelación PASS 1/1 cada uno.
- Auth transversal por Chromium/Nginx: `smoke.spec.ts` PASS 6/6;
  `dashboard-shell.spec.ts` PASS 3/3, 1 SKIP previsto de workspace existente.
- Cross-check público anterior por Chromium/Nginx: `public-solicitud-upload-direct.spec.ts`
  PASS 5/5; C final PASS 6/6.
- Drift final de esta corrección: scripts QA de E, una spec E y documentación.
  Sin cambios de migraciones 01–06, `database.types`, Supabase upstream,
  Compose, Dockerfile ni Nginx; no existe migration 07.
