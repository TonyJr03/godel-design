# PPO-04M.4B.2 — Mutating QA Design

**Fecha:** 2026-09-20  
**Branch / HEAD auditados:** `ops/managed-free-production-pilot` / `396ef41704040a728c313348e67995db0ab1ecce`
**Production runtime (referencia, no consultado):** `01552f8bee59b5f9982a2d722e39795461918f43`

```text
PPO-04M.4B.1 = CLOSED / READ_ONLY QA PASS
PPO-04M.4B.2 = CLOSED / MUTATING QA ARCHITECTURE APPROVED
PPO-04M.4B.3 = ACTIVE / SAFETY INFRASTRUCTURE IMPLEMENTATION
PPO-04M.4B.3.0 = CLOSED / SAFETY INFRASTRUCTURE APPROVED
PPO-04M.4B.3.1 = IMPLEMENTED / PENDING ARCHITECTURAL REVIEW
PRODUCTION MUTATING QA = NOT EXECUTED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

## 1. Objetivo

Diseñar, exclusivamente mediante auditoría estática del repositorio, el límite
seguro de una futura QA mutante contra el backend Production managed compartido.
La condición de entrada de **cada** caso para M.4B.3 será:

```text
fixture identificable + ownership acotado + cleanup determinista
+ recuperación ante crash + verificación posterior
```

`assertions PASS + cleanup FAIL` es un fallo de QA. Esta auditoría no ejecutó
browser, Playwright, SQL, Supabase CLI, ni requests a Production o Preview.

### Handoff M.4B.3.0 — Safety infrastructure

La infraestructura local aprobada vive en
`scripts/managed-mutating-qa/manifest.mjs` y no importa Supabase, Playwright,
HTTP ni credenciales. Usa `schemaVersion: 1`, conserva manifests bajo
`test-results/managed-mutating-qa/manifests/` y genera IDs
`M4QA-<UTC compact>-<8 Base32 cryptographic chars>`.

Sólo admite `solicitud` (`description`) y `trabajo_plantilla` (`name`). Antes
del futuro DELETE, el consumidor deberá fetch la fila exacta y `verify` exige
remote ID cuando se conoce, campo de ownership exacto, valor exacto y runId
exacto; cualquier fallo resulta `OWNERSHIP_MISMATCH`. La persistencia crea un
archivo temporal en el mismo directorio, lo sincroniza y lo renombra
atómicamente. Manifests `clean` se retienen; `active`, `cleanup_required`,
`blocked` o inválidos bloquean una nueva run. No existe aún búsqueda o cleanup
remoto y la primera mutación Production continúa no autorizada.

La revisión arquitectónica posterior identificó y corrigió la semántica de
cleanup multirrecurso: un run `cleanup_required` puede conservar recursos
hermanos `planned` o `created` mientras otros avanzan por `cleanup_pending` y
`clean`. El run sólo llega a `clean` cuando todos sus recursos están limpios;
cualquier recurso `blocked` exige que el run completo sea `blocked`. El esquema
permanece en v1, no se pueden añadir recursos fuera de `active` y ningún estado
terminal puede reactivarse.

### Handoff M.4B.3.1 — Single managed solicitud flow

La autoridad aprobada de M.4B.3.0 es
`f1c4e3c801da46f024a4e11c3e31a714c58033e4`. M.4B.3.1 implementa un runner
separado y un único spec allowlisted para crear por UI pública una solicitud
`encargo` aislada, sin archivos, cliente ni conversión. El intent `planned` se
persiste después del bootstrap y antes de Playwright; el child recibe sólo
runId y ownership no sensibles, nunca credenciales admin, bypass o secretos.

El cleanup usa publishable key, sesión QA admin real y RLS existente. Descubre
por `description` exacta, valida workflow y relaciones nulas, persiste
`created` y `cleanup_pending`, vuelve a consultar por ID, exige
`OWNERSHIP_VERIFIED`, borra por ID + marker exactos y verifica ausencia por
ambos criterios antes de marcar `clean`. Ambigüedad, mismatch, error de DELETE
o residuo bloquean el run. El recovery explícito reutiliza el mismo contrato y
rechaza entidades distintas de `solicitud`.

Tanto ejecución como recovery requieren
`GODEL_MANAGED_MUTATING_PRODUCTION_CONFIRM=ALLOW_SINGLE_QA_SOLICITUD_MUTATION`;
la confirmación se rechaza si aparece persistida en los archivos managed. Este
pase sólo ejecutó tests locales con fakes: no hubo Production, Preview,
Supabase remoto, browser E2E ni mutaciones de negocio. La primera mutación
Production sigue sin autorización.

## 2. Non-goals

- No se implementó runner, manifest, teardown ni cambios a tests, `src`,
  `supabase`, scripts, configuración o dependencias.
- No se hicieron mutaciones remotas, reset de base, inspección de datos ni
  cambios de Auth.
- No se proponen service role, `SUPABASE_SECRET_KEY`, PostgreSQL directo, RLS
  relajado, RPC privilegiada nueva ni cleanup global.

`supabase db reset --linked` queda **prohibido** para Production QA: tendría
alcance destructivo sobre un backend compartido, afectaría datos ajenos, no
demostraría cleanup scoped y no sería aceptable tras datos reales. Un staging
desechable puede optar por reset completo en un trabajo futuro independiente.

## 3. Invariantes de seguridad

- Sólo publishable key, usuario QA autenticado real y RLS normal para cualquier
  futuro cleanup directo. Nunca secretos, bypass de RLS, SQL o service role.
- Todo DELETE QA directo ya aprobado debe, antes de borrar, consultar la fila
  exacta por el ID del manifest y verificar su marcador funcional `runId`. Si
  no existe, no coincide o no puede leerse, debe detenerse con
  `OWNERSHIP_MISMATCH`; nunca se borra sólo porque el ID figure en el manifest.
- Las tres identities QA existentes son infraestructura estable; no se crean,
  borran, cambian de password ni cambian de rol por run.
- El identificador propuesto es `M4QA-<UTC compact>-<random base32>` (ejemplo:
  `M4QA-20260920T154501Z-K7D3Q`). Debe aparecer en un campo funcional
  buscable (nombre/título/descripción/notas/email sintético), nunca en secretos.
- La identificación debe registrarse antes de la primera mutación durable y no
  se puede inferir sólo desde timestamps, UUIDs o `order_number` generado.
- No se modificará ni restaurará configuración compartida productiva para una
  prueba. La restauración no convierte esa mutación en segura ante crash.

## 4. Specs auditados

Se revisaron los diez specs en alcance (79 tests/casos declarados), sus helpers
`qa-data`, `supabase`, `auth`, `managed-session`, acciones/servicios relevantes,
las migraciones baseline 01–06, RLS, RPCs y Storage. `full-visual-qa.spec.ts`
se inspeccionó sólo como dependencia de alcance y sigue fuera de M.4B.3.

Las referencias base son: esquema/FK/triggers en
`supabase/migrations/20260811131824_01_core_schema.sql`; RLS en
`20260811131825_02_security_rls_grants.sql`; RPCs en
`20260811131826_03_business_rpcs.sql`; Storage en `20260811131827_04_storage.sql`;
hardening en `20260811131829_06_final_hardening.sql`.

## 5. Inventario de mutaciones por caso

Los tests de navegación, filtros, responsive, autorización y validación que no
persisten se consideran read-only y no se repiten. Cada fila enumera todos los
casos que sí pueden persistir; `I` es mutación implícita/trigger e `H` historial.

| Spec / test title o flujo | Actor / operación | Directo | Implícito / H | Tablas y Storage | RPC / action |
| --- | --- | --- | --- | --- | --- |
| `clientes` / `admin can update a QA cliente…` | admin; CREATE, UPDATE | `clientes` | `updated_at` | `clientes`; no bucket | create/update cliente actions |
| `configuracion-servicios` / `admin can create, search, hide and edit a service` | admin; CREATE, UPDATE shared | `tipos_servicio` | `created_by`, `updated_by`, `updated_at` | `tipos_servicio`; no bucket | service actions |
| `pedido-edit` / fixture `createManualPedido`; edit, payment, status, assignment tests | admin/supervisor/worker; CREATE, UPDATE | `pedidos`, `pedido_pagos`, `pedido_trabajadores` | `pedido_contadores` increment; pedido/pago timestamps; H pedido create/update/payment/assignment | contador global, pedidos, pagos, assignments, historial; no bucket | `crear_pedido_manual`, `actualizar_datos_pedido`, `actualizar_pago_pedido`, `actualizar_estado_pedido` |
| `pedidos` / `…select a cliente…` | admin; CREATE | `clientes`, `pedidos` | `pedido_contadores` increment; H pedido create | contador global, clientes, pedidos, pagos/history; no bucket | create client; `crear_pedido_manual` |
| `pedidos` / async personnel selector test | admin; CREATE, assignment/removal | `pedidos`, `pedido_trabajadores` | `pedido_contadores` increment; H create/assign/remove | contador global, pedidos, assignments, histories; no bucket | manual create; assignment actions |
| `pedidos` / `manual pedido creation persists selected…` | admin/supervisor; CREATE, UPDATE shared | `pedidos`, `tipos_servicio.is_publicly_available` | `pedido_contadores` increment; H pedido create | contador global, pedidos/pagos/history, service catalog; no bucket | manual create; service update |
| `pedidos` / `admin can create and manage focal internal pedidos` | admin; CREATE, UPDATE | `pedidos`, tasks, payments, comments, assignments | `pedido_contadores` increment; H for each listed operational mutation | contador global, pedidos, tareas, pagos, comments, assignments, history; no bucket | manual/create task/payment/comment/status/assignment actions |
| `pedido-upload-direct` / all seven named tests | admin; CREATE, UPLOAD | pedido, sessions/items, then `archivos` | H pedido and file; session status | pedidos, sesiones/items, archivos, `godel-files` objects | `crear_pedido_manual`, `reservar_carga_pedido`, `finalizar_carga_pedido` |
| `public-solicitud-upload-direct` / all six named tests | public; CREATE, UPLOAD | solicitud, session/items, then `archivos` | H solicitud and attached file | solicitudes, sesiones/items, archivos, `godel-files` objects | `crear_solicitud_publica_con_reserva_carga`, sign, `finalizar_carga_publica` |
| `solicitudes-internas` / `admin can associate…` | public + admin; CREATE, UPDATE | public solicitud; two clients; `cliente_id` | H solicitud create/client association | solicitudes, clientes, historial; no bucket | public creation; association action |
| `solicitudes-internas` / both `conversion…` tests | admin; CREATE, UPDATE | QA client, solicitud, pedido via conversion | `pedido_contadores` increment; H solicitud create/conversion + pedido create | contador global, clientes, solicitudes, pedidos, pagos, histories; no bucket | `convertir_solicitud_a_pedido` |
| `solicitudes-internas` / `admin can manage solicitud workspace…` | public + admin; CREATE, UPDATE | encargo/impresión solicitud, status/client/comment/pedido | H creation/status/client/conversion | solicitudes, clients, comments, pedidos/pagos, histories; impresión creates Storage data | public submit; status/associate/comment/convert actions |
| `solicitudes-internas` / `impresion workflow supports files…` | public + admin; CREATE, UPLOAD, UPDATE | impresión solicitud/file/status | H file/status | solicitudes, archivos/session-items, history, Storage | public upload flow and status action |
| `task-templates` / `admin can create and manage a task template` | admin; CREATE, UPDATE, DELETE child | template + template tasks | timestamps | plantillas, plantilla_tareas; no bucket | template/task actions |
| `task-templates` / `admin can apply a template…` | admin; CREATE, UPDATE | apply-template fixture, two pedidos, pedido tasks | `pedido_contadores` increment; H pedido/task actions | contador global, templates/tasks, pedidos/tasks/history; no bucket | manual create; `aplicar_plantilla_tareas_pedido` |
| `mantenimiento` / browser confirm test | admin; global DELETE | candidate `storage.objects` after global reconcile | sessions/items status mutation | upload sessions/items and any eligible bucket paths | `reconciliar_cargas_expiradas`, `storage.remove` |
| `public-solicitud` / `public encargo submit…` and manipulated workflow test | public; CREATE | solicitud | H solicitud create | solicitudes, history; no bucket | `crear_solicitud_publica_sin_archivos` |
| `public-solicitud` / `public impresion requires and uploads…` | public; CREATE, UPLOAD | solicitud/file workflow | H creation/file | solicitudes, sessions/items, archivos, `godel-files` | public reserve/finalize flow |
| `public-solicitud` / `hidden service disappears…` | admin + public; CREATE, UPDATE shared | QA service and availability | service timestamps; possible solicitud | service catalog, solicitudes/history | service actions; public submit |
| `public-solicitud` / `impresion availability can be hidden and restored safely` | admin; UPDATE shared | `Impresión.is_publicly_available` | `updated_at` | service catalog; no bucket | service update action |

No caso auditado cria identidade Auth. Las lecturas directas que algunos specs
hacen mediante `createQaSupabaseClient` usan publishable key y cuentas QA, pero
no convierten a los usuarios ni a `perfiles` en fixtures de cleanup.

## 6. Entity dependency graph and irreversible side effects

### `pedido_contadores`: global counter side effect

`public.pedido_contadores` has `year` as primary key and persistent
`last_number`. In `20260811131824_01_core_schema.sql`,
`private.generar_numero_pedido()` executes an `INSERT ... ON CONFLICT DO UPDATE`
that starts a year at `1` or performs `last_number = pc.last_number + 1`.
`private.set_pedido_order_number()` calls it, and trigger
`set_pedido_order_number` runs **BEFORE INSERT** on `public.pedidos`.

Therefore every successful INSERT of a pedido consumes a production sequence
number. DELETE of that pedido has no counter trigger, FK, RPC or other path that
reverses `last_number`. The entity is **shared global mutable state** with:

```text
cleanup primitive = DOES_NOT_EXIST / MUST_NOT_BE_REWOUND
```

Decrementing or resetting it could collide with real orders and alter Production
numbering. Consequently, creating a Production QA pedido is **NOT ZERO-RESIDUE**
even if every pedido child is deleted correctly.

### Relaciones reales relevantes

| Parent | Child / FK | Nullable | Acción al borrar parent | Consecuencia QA |
| --- | --- | ---: | --- | --- |
| `clientes` | `solicitudes.cliente_id` | Sí | `SET NULL` | borrar un cliente no borra solicitudes. |
| `tipos_servicio` | `solicitudes.service_id`, `pedidos.service_id` | No | `RESTRICT` | no borrar servicio mientras haya uso; no existe policy DELETE. |
| `solicitudes` | `pedidos.solicitud_id` | Sí | `SET NULL` | borrar solicitud no borra pedido. |
| `pedidos` | `solicitudes.converted_order_id` | Sí | `SET NULL` | borrar pedido convertido permite después borrar la solicitud. |
| `pedidos` | `pedido_trabajadores.pedido_id` | No | `CASCADE` | assignment se elimina con pedido. |
| `pedidos` | `pedido_tareas.pedido_id` | No | `CASCADE` | tareas se eliminan con pedido. |
| `pedidos` | `pedido_pagos.pedido_id` | No | `CASCADE` | pago se elimina con pedido. |
| `pedidos` | `pedido_comentarios.pedido_id` | No | `CASCADE` | comentarios se eliminan con pedido. |
| `pedidos` | `pedido_historial.pedido_id` | No | `CASCADE` | historial se elimina con pedido. |
| `pedidos` / `solicitudes` | `archivos.pedido_id` / `.solicitud_id` | Sí | `CASCADE` | borra metadata, **no** `storage.objects`. |
| `pedidos` / `solicitudes` | `archivo_carga_sesiones.*_id` | Sí | `CASCADE` | borra sesiones e items, **no** blobs. |
| `archivo_carga_sesiones` | `archivo_carga_items.session_id` | No | `CASCADE` | items se eliminan con sesión. |
| `archivos` | `archivo_carga_items.archivo_id` | Sí | `SET NULL` | no es un mecanismo de borrar blob. |
| `trabajo_plantillas` | `trabajo_plantilla_tareas.template_id` | No | `CASCADE` | tareas de plantilla se eliminan con plantilla. |

Los triggers añaden historial: alta de pedido, asignar/quitar trabajador,
archivo, crear/actualizar/borrar/completar/reabrir/progreso de tarea; y alta de
solicitud, archivo, estado, asociación de cliente y conversión. No hay policy
DELETE para historiales o comentarios; no hace falta borrarlos individualmente
si se borra su padre por cascada. El modelo **no** conserva esos historiales tras
borrar el padre: la cascada es explícita.

### Orden topológico admitido

Para un pedido sin archivos: verificar hijos por lectura; borrar el `pedido`
identificado como admin autenticado; verificar ausencia de pedido y de cascadas.
Para solicitud convertida: borrar primero el pedido (que deja
`converted_order_id` en `NULL`), luego la solicitud; comprobar ambas ausencias.
No se borran perfiles ni servicios compartidos. Si hay un blob committed, el
grafo deja de ser limpiable en Production: eliminar filas por cascada sin el
blob físico es inaceptable.

Ese orden topológico sólo borra el grafo relacional; no borra ni debe intentar
rebobinar el incremento ya persistido de `pedido_contadores`. Por tanto no hace
admisible una creación de pedido en Production.

## 7. Primitivas de cleanup auditadas

| Entidad | Primitiva actual | Autoridad | Estado | Nota |
| --- | --- | --- | --- | --- |
| `clientes` | No hay UI, servicio ni policy DELETE | Ninguna RLS | `DOES_NOT_EXIST` | `clientes_select/insert/update_*`; no delete policy. |
| `tipos_servicio` | Catálogo sólo oculta con `is_publicly_available` | Admin update, no delete | `DOES_NOT_EXIST` | `src/lib/service-types/README.md` confirma ausencia de eliminación. |
| `pedido_contadores` | No hay operación legítima de rewind | Ninguna; debe permanecer monotónico | `DOES_NOT_EXIST / MUST_NOT_BE_REWOUND` | Estado global mutable; un INSERT de pedido deja residuo irreversible. |
| `solicitudes` | DELETE directo autenticado y acotado por id | Admin, `solicitudes_delete_admin` | `EXISTS_AND_ALLOWED` | Legítimo bajo RLS, pero no product-surfaced. |
| `pedidos` | DELETE directo autenticado y acotado por id | Admin, `pedidos_delete_admin` | `EXISTS_AND_ALLOWED` | Legítimo bajo RLS, pero no product-surfaced; sus hijos hacen cascade. |
| `pedido_trabajadores` | Acción `remove-internal-pedido-worker` / policy | Admin o supervisor | `EXISTS_AND_ALLOWED` | Sólo útil antes de borrar padre; su delete genera historial. |
| `pedido_tareas` | Acción `delete-pedido-task` / policy | actor que gestiona pedido | `EXISTS_AND_ALLOWED` | Sólo útil granularmente; cascade del pedido es preferible. |
| `pedido_pagos` | Policy DELETE, sin UI de cleanup | Admin o supervisor | `EXISTS_AND_ALLOWED` | Cascade del pedido es preferible. |
| comentarios e historiales | Sin policy DELETE | Ninguna | `DOES_NOT_EXIST` | Se limpian sólo por cascade del padre. |
| `trabajo_plantillas` | DELETE directo autenticado por id | Admin | `EXISTS_AND_ALLOWED` | Legítimo bajo RLS, no product-surfaced; tasks cascade. |
| `archivos`, sesiones, items | Sin policy DELETE separada | Ninguna | `DOES_NOT_EXIST` | Sólo cascade del pedido/solicitud; no resuelve objeto físico. |
| `storage.objects` staged expirado | `reconciliar_cargas_expiradas` + `storage.remove` | Admin | `EXISTS_BUT_TOO_BROAD` | Predicado global por expiración y límites, no ownership/run-id. |
| `storage.objects` committed | Ninguna | Ninguna | `DOES_NOT_EXIST` | Policy `godel_files_delete_managed` sólo admite item expirado, sin `archivo_id`. |

El cleanup QA directo autenticado queda **APPROVED** exclusivamente para
`solicitudes` y `trabajo_plantillas` que superen la comprobación exacta de
ownership anterior: publishable key, sesión admin QA real, RLS existente, ID de
manifest y marcador funcional `runId` coincidente. Historiales se limpian por
`ON DELETE CASCADE` del padre, comportamiento existente aprobado. Aunque RLS
permite DELETE de `pedidos`, esa vía no se usa en M.4B.3 por el residuo global
del contador.

## 8. Storage cleanup analysis

El bucket privado real es `godel-files`. La reserva crea:

```text
solicitud/pedido
 -> archivo_carga_sesiones (open, expiry, owner/capability)
 -> archivo_carga_items (reserved, object_path cargas/v1/<session>/<item>/...)
 -> TUS storage.objects
 -> finalizar_* -> archivos + item committed + session completed/partial
```

`finalizar_carga_publica` y `finalizar_carga_pedido` insertan `archivos` y
marcan el item `committed`; el physical object ya existía por TUS. Borrar la
solicitud/pedido elimina `archivos`, sesiones e items por FK, pero no hay trigger
que elimine `storage.objects`. El sentido inverso tampoco elimina metadata.
Por tanto, ambos specs `*-upload-direct.spec.ts` son `STAGING_ONLY`: después de
un finalize exitoso no existe cleanup bounded, completo y verificable.

`reconciliar_cargas_expiradas` sólo convierte sesiones abiertas vencidas a
expired/partial y devuelve candidatos globales; el UI `mantenimiento` borra
hasta 100 paths devueltos. La policy de Storage exige admin, item `expired`,
sesión `expired`/`partial`, grace period y ausencia de `archivos`. No es un
cleanup por run, no cubre committed y puede afectar residuos de terceros.

**Veredicto Storage:** no hay vía Production aceptable para cargas TUS,
committed ni staged dependientes de una ejecución nueva. Los tests de límites
que rechazan antes de reservar pueden ser extraídos como unit/UI aislados, pero
no convierten los specs de direct upload en allowlist M.4B.3.

## 9. Shared configuration analysis

`tipos_servicio` es estado compartido. `configuracion-servicios.spec.ts` crea,
oculta y edita un servicio QA; aun con nombre único, no hay DELETE RLS y dejar
una fila es residuo. `pedidos.spec.ts` y `solicitudes-internas.spec.ts` usan
`setQaServiceAvailability` / servicios ocultos; sus subflujos que cambian
availability quedan excluidos. `public-solicitud.spec.ts` crea servicio y
oculta/restaura `Impresión`; su `finally` no es recuperación suficiente frente a
crash y `Impresión` es configuración productiva compartida.

Una plantilla creada por QA no es el mismo riesgo si se marca con run-id y se
elimina por id mediante RLS admin + cascade; no se puede aplicar a un pedido
que conserve un blob. No hay intención de cambiar el catálogo para QA.

### División conceptual de `public-solicitud.spec.ts`

El spec actual es `PROD_BLOCKED`. Puede extraerse en el futuro un **SAFE public
submit subset**: render de catálogo, submit de encargo sin archivos con un
servicio ya disponible, captura de `public_reference`, login admin QA y DELETE
acotado de la solicitud, con verificación de sus historiales cascada. Permanecen
fuera: crear/ocultar/restaurar servicios, disponibilidad de `Impresión`, submit
de impresión con archivo y cualquier concurrencia que dependa del catálogo.

## 10. Fixture manifest design

Antes de cada create durable, un futuro runner deberá escribir atómicamente en
un directorio gitignored, por ejemplo `test-results/mutating-qa-manifests/`, un
JSON por run. Campos permitidos:

```text
runId, startedAt, actorRole, spec, testTitle,
entityType, entityId/publicReference/orderNumber,
parentEntityId, storageObjectPath (si aplica), cleanupStatus, verifiedAt
```

No passwords, cookies, tokens, signed URLs, claves ni capability pública. El
manifest se actualiza tras cada paso de cleanup, nunca se borra antes de que la
verificación alcance cero; un archivo final puede marcarse `clean` y archivarse
localmente según retención de QA.

## 11. Crash recovery

`afterEach`, `afterAll` y `finally` son optimizaciones, no autoridad de
recovery. Al iniciar un nuevo run, un proceso server-side/local autenticado con
publishable key debe leer manifests pendientes, buscar por los IDs exactos y
ejecutar únicamente primitives ya aprobadas. Si un recurso sigue presente, no
tiene manifest, no puede identificarse inequívocamente o el cleanup falla,
**NEW MUTATING RUN = BLOCKED**. La recuperación debe preservar los mismos
límites RLS y prohibiciones de Production.

## 12. Pre-run residue gate

1. Rechazar manifests corruptos, incompletos o de estado no `clean`.
2. Antes de cualquier DELETE, fetch exacto por ID/ref/path del manifest con
   actor QA y permisos RLS reales; verificar el marcador funcional `runId`.
   Si no coincide, detener con `OWNERSHIP_MISMATCH`.
3. Limpiar sólo recursos que tengan primitive aprobada, en orden topológico.
4. Verificar ausencia de cada recurso; si alguno queda, bloquear la nueva run.
5. Registrar resultado sin datos sensibles.

No se buscará ni borrará por prefijo global sin manifest: eso podría alcanzar
estado de otra ejecución o datos reales.

## 13. Post-run verification

Después de cleanup se verifica, desde el manifest: entidad padre ausente;
hijos con cascade ausentes; objeto Storage ausente cuando hubiese existido; y
estado de configuración compartida sin drift. Expected result:

```text
DB QA residues = 0
Storage QA residues = 0
Auth QA residues = 0
shared config drift = 0
pedido_contadores drift = 0
```

Para solicitudes y templates candidatos, la ausencia de padre e hijos cascade
es comprobable por sus IDs y marcadores. Para pedidos, la ausencia de filas no
restaura `pedido_contadores.last_number`: el modelo de residuo Production exige
cero filas QA **y** cero side effects globales no reversibles. Por ello ningún
caso que inserte pedido puede ser Production safe. Para blobs committed no hay
primitive, por lo que post-verification tampoco puede probar cleanup. Auth
lifecycle es una categoría distinta y está excluida por defecto.

## 14. Spec classification matrix

La clasificación es del spec en su estado actual, con el alcance Production
recomendado señalado; `PROD_SAFE_AFTER_ADAPTATION` no autoriza ejecutarlo aún.

| Spec | Tests mutantes relevantes | Fixtures primarios / secundarios | Shared / Storage | Cleanup y RLS | Crash/verificación | Adaptación necesaria | Clasificación | Scope Production recomendado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `clientes.spec.ts` | create/update QA cliente | `clientes` | No / no | no DELETE policy | no / no | no hay primitive | `PROD_BLOCKED` | sólo tests read-only, fuera de M.4B.3 mutante |
| `configuracion-servicios.spec.ts` | create/hide/edit servicio | `tipos_servicio`; audit fields | Sí / no | update admin; no delete | no / no | no crear ni mutar catálogo | `PROD_BLOCKED` | sólo acceso/lectura |
| `pedido-edit.spec.ts` | crear pedido, edit, pago, status, assignment | pedido, pago, worker, historial, contador | global / no | DELETE pedido no limpia contador | no: contador global persiste | contador no se puede limpiar ni rebobinar | `PROD_BLOCKED` | ninguno: crear pedido no es zero-residue |
| `pedidos.spec.ts` | create pedido/cliente, tareas, pagos, comentarios, assignments, status | clientes, pedidos, tareas, pagos, comments, histories, contador | algunos / no | pedido delete sí; contador no | no: contador global persiste | además de clientes/catalog drift, todo pedido queda excluido | `PROD_BLOCKED` | ninguno: no pedidos |
| `pedido-upload-direct.spec.ts` | reserve/TUS/finalize/retry | pedido, sesión, items, archivo, object | no / sí | committed blob sin delete | no / no | requiere entorno desechable o producto nuevo fuera de pase | `STAGING_ONLY` | ninguno |
| `public-solicitud-upload-direct.spec.ts` | public reserve/TUS/finalize/retry | solicitud, sesión, items, archivo, object | catálogo leído / sí | committed blob sin delete | no / no | igual que upload interno | `STAGING_ONLY` | ninguno |
| `solicitudes-internas.spec.ts` | public/internal solicitud, client association, conversion, comments/status | solicitudes, clientes, pedidos, histories, comments, posible archivo | algunos / algunos | admin delete solicitud; cliente/pedido paths excluded | solicitud aislada sí / sí | extraer submit sin cliente creado, archivo, conversión ni catalog drift | `PROD_SAFE_AFTER_ADAPTATION` | sólo solicitud encargo aislada |
| `task-templates.spec.ts` | create/edit template/tasks; apply to pedido | plantilla, template tasks, pedido tasks, pedido/history | configuración propia / no | admin DELETE template + cascades | CRUD plantilla sí / sí | run-id, ownership gate y cleanup id-bound; excluir apply-to-pedido | `PROD_SAFE_AFTER_ADAPTATION` | sólo plantilla aislada + tareas de plantilla |
| `mantenimiento.spec.ts` | reconciliación y delete de uploads expirados | sesiones/items/objects de cualquier dueño | global / sí | RPC+remove admin, global limit 100 | no / no | no puede acotarse por run con producto actual | `STAGING_ONLY` | tests puros locales solamente |
| `public-solicitud.spec.ts` | create service, hide/restore `Impresión`, public submits | catálogo, solicitudes, historial, archivo | Sí / en impresión | solicitud delete admin; catalog/blob no | parcial / parcial | dividir subset encargo sin archivo y sin catálogo mutation | `PROD_BLOCKED` | futuro subset extraído, no este spec |

Totales de los diez specs: `PROD_SAFE_EXISTING = 0`,
`PROD_SAFE_AFTER_ADAPTATION = 2`, `PROD_BLOCKED = 5`, `STAGING_ONLY = 3`.

## 15. Entity cleanup matrix

| Entity | Specs creadores | Identificador QA natural | Delete path / role | Cascade children / manual children | Storage coupling | Safety / gap |
| --- | --- | --- | --- | --- | --- | --- |
| `clientes` | clientes, pedidos, solicitudes internas | name/email/notes | ninguno | `solicitudes.cliente_id SET NULL` | no | bloqueado: fixture queda |
| `tipos_servicio` | servicios, public solicitud | name/description | ninguno; admin sólo update | RESTRICT desde pedidos/solicitudes | no | bloqueado: catálogo compartido |
| `pedido_contadores` | todo INSERT de pedido: pedido-edit, pedidos, conversiones, apply-template, uploads | año + `last_number` (no es marcador QA ni fixture poseíble) | ninguno; `MUST_NOT_BE_REWOUND` | no FK/cascade; side effect del trigger `set_pedido_order_number` | no | estado global mutable irreversible; bloquea Production pedidos |
| `solicitudes` | public, internas, public upload | client fields/notes + reference manifest | admin RLS DELETE | archivos, sesiones, items, comments/history cascade; pedidos `SET NULL` | sí si hubo archivo | seguro sólo sin blob y tras pedido convertido |
| `pedidos` | pedido edit, pedidos, template, upload, conversion | title/description + order number manifest | RLS DELETE existe, pero no se aprueba para M.4B.3 | assignments/tasks/payment/comments/history/archivos/sesiones/items cascade | sí si hubo archivo | contador global irreversible; ningún pedido Production |
| `pedido_tareas` | pedidos, templates | title + parent id | manage actor / cascade parent | historial creado por trigger; parent cascade | no | parent delete preferible |
| `pedido_trabajadores` | pedido edit, pedidos | parent + profile id | admin/supervisor / cascade parent | removal trigger adds historial | no | parent delete avoids extra event |
| `pedido_pagos` | pedido edit, pedidos | parent id | admin/supervisor / cascade parent | none | no | parent delete |
| comments/history | pedidos, edit, internas | parent id | no direct delete | cascade parent | no | must use parent cascade |
| `trabajo_plantillas` / tasks | templates | template name + id | admin RLS DELETE | template tasks cascade | no | viable after adaptation |
| `archivos` / sessions/items | upload specs | manifest IDs/path | no direct policy; parent cascade | physical object separate | not sufficient for uploaded data |
| `storage.objects` | upload specs | exact generated `object_path` | only expired uncommitted, admin | no DB cascade | yes | committed deletion gap blocks Production |
| `perfiles` / Auth users | none in scope | stable preprovisioned account | excluded | Auth→perfil cascade only | no | identity lifecycle QA excluded |

## 16. Recommended M.4B.3 scope

Los únicos niveles propuestos, sujetos a la implementación previa de manifest,
ownership gate y post-verification, son:

1. **Nivel 1:** solicitud encargo aislada, sin cliente creado, archivo ni
   conversión. Un admin QA debe leer la fila exacta, comprobar su marcador
   funcional `runId`, borrarla bajo RLS existente y verificar su cascade.
2. **Nivel 2:** plantilla QA aislada y sus tareas de plantilla, sin aplicarla a
   un pedido. El mismo ownership gate debe preceder DELETE de plantilla.

Quedan explícitamente fuera: pedidos, conversión a pedido, aplicación de
plantilla a pedido, clientes, servicios, Storage, Auth y mantenimiento global.

## 17. Blocked / staging-only coverage

- Excluidos de Production: todo INSERT de pedido y sus derivados
  (conversión/aplicar plantilla), clientes creados, catálogo de servicios, toda
  disponibilidad compartida (especialmente `Impresión`), Auth lifecycle y el
  cleanup global de mantenimiento.
- Excluidos de Production: ambos direct TUS upload specs, including finalize,
  resume, retry y objects committed/staged, hasta que exista una capacidad de
  cleanup product-safe y bounded o un ambiente QA desechable.
- `full-visual-qa.spec.ts` y los 14 specs `SELFHOSTED_ONLY` no cambian de
  estado por esta auditoría.

## 18. Open decisions

1. El uso de DELETE directo con publishable key/admin QA bajo RLS existente queda
   aprobado sólo tras fetch exacto y verificación de marker/runId; un mismatch
   obliga `OWNERSHIP_MISMATCH` y stop.
2. El cleanup de history por `ON DELETE CASCADE` del padre queda aprobado como
   comportamiento de esquema existente.
3. Aprobar el formato y directorio local gitignored del manifest, y la retención
   de manifests `clean`.
4. Confirmar que M.4B.3 se limita inicialmente a solicitud aislada y CRUD de
   plantilla, sin pedidos, Storage, catálogo, clientes ni Auth.
5. Decidir fuera de este pase si el producto necesita una solución segura para
   borrar archivos committed; no se diseñará una RPC privilegiada sólo para QA.

## Evidence boundaries

Esta conclusión es estática. No afirma que un DELETE remoto, una cascada ni la
ausencia de un blob se hayan ejecutado o validado contra Production. Antes de
M.4B.3 se requerirá revisión arquitectónica y una autorización nueva; la
primera mutación seguirá estando prohibida hasta entonces.
