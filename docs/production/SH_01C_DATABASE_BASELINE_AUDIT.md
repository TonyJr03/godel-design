# SH-01C.0 — Auditoría de la baseline definitiva de base de datos

Fecha: 2026-08-11
Target: Supabase self-hosted, PostgreSQL 17, Auth y Storage self-hosted
Estado: diseño aprobado para revisión; no implementa SH-01C.1

## 1. Objetivo y alcance

Esta auditoría define el estado final que debe expresar una instalación nueva de
Godel Diseño. La fuente es el efecto acumulado de las ocho migraciones activas,
sus consumidores en `src/` y `tests/`, la documentación operativa vigente y una
consulta read-only al PostgreSQL self-hosted local.

No se modificaron migraciones, aplicación, tipos, tests ni base de datos. La
historia incremental no forma parte del nuevo contrato: 07 y 08 se integrarán
por responsabilidad en una nueva baseline de seis archivos.

## 2. Estado actual 01–08

| MIGRATION | EFFECTIVE CONTENT | TOP-LEVEL INVENTORY |
|---|---|---:|
| 01 core | 10 enums, 16 tablas, constraints/FK, DML inicial, triggers de integridad e historial | 10 types, 16 tables, 26 functions, 40 indexes, 31 triggers |
| 02 security | helpers de autorización, RLS y policies de negocio; incluye helpers/path de upload interno legacy | 13 functions, 48 policies |
| 03 business RPCs | transacciones de solicitudes, pedidos, tareas, pagos, comentarios, historial y tracking | 13 public functions |
| 04 Storage | bucket, validación, paths legacy, grants y policies de `storage.objects`/`archivos` | 11 functions, 6 policies |
| 05 Auth Admin | dos auditorías privadas, provisioning, alta/reset y triggers de `auth.users` | 2 tables, 7 functions, 7 indexes, 2 triggers |
| 06 hardening | cierre de grants y assertions del baseline 01–05 | grants/revokes y bloque `DO` |
| 07 upload sessions | control plane estructural y policies Storage operation-aware | 2 types, 2 tables, 6 functions, 7 indexes, 4 policies |
| 08 upload control plane | reserva, capability pública, finalize y grants de RPC | 11 functions |

El inventario completo de objetos 01–06 permanece válido salvo los objetos
Storage legacy identificados en este documento. Las 13 RPC existentes de 03 y
los contratos Auth Admin de 05 se conservan sin rediseño funcional.

## 3. Arquitectura objetivo 01–06

| FINAL MIGRATION | RESPONSIBILITY |
|---|---|
| 01 core schema | schemas propios, `extensions`/`pgcrypto`, 12 enums, 18 tablas, constraints, FK, índices, triggers estructurales y DML obligatorio |
| 02 security / RLS / grants | helpers generales de autorización, RLS/policies de tablas `public` y acceso directo mínimo; sin RPC de negocio |
| 03 business RPCs | 13 RPC actuales más las 5 RPC de carga y sus helpers transaccionales; grants exactos |
| 04 Storage | bucket privado, 20 MiB, MIME final, helpers/policies `cargas/v1` y permisos mínimos de Storage |
| 05 Auth Admin lifecycle | contenido funcional actual de 05, sin objetos de upload |
| 06 final hardening | revokes finales y assertions del estado definitivo, incluida ausencia de legacy |

No se reutilizarán timestamps de `20260731` ni `20260809`. SH-01C.1 debe
reservar una serie nueva al implementarse, por ejemplo `20260812000100` a
`20260812000600` si sigue siendo posterior al momento real de creación.

## 4. Inventario de objetos y matriz principal

`CURRENT_CONSUMERS` usa `constraint`, `policy`, `RPC`, `Pedido UI`, `public UI`,
`listing/download` o `none direct`. Los grupos de grants/revokes se representan
como contratos explícitos; cada constraint e índice de 07 aparece individualmente.

| OBJECT | CURRENT_MIGRATION | TYPE | CURRENT_PURPOSE | CURRENT_CONSUMERS | FINAL_DECISION | FINAL_MIGRATION | FINAL_NAME | REASON | RISK |
|---|---|---|---|---|---|---|---|---|---|
| `archivo_carga_sesion_estado` | 07 | enum | ciclo de sesión | tables/RPC | MOVE | 01 | same | estructura base | LOW |
| `archivo_carga_item_estado` | 07 | enum | ciclo de item | tables/RPC | MOVE | 01 | same | estructura base | LOW |
| `archivo_carga_sesiones` | 07 | table | contexto y capability | RPC only | MOVE | 01 | same | tabla final | LOW |
| `archivo_carga_items` | 07 | table | descriptor y commit | RPC/Storage | MOVE | 01 | same | tabla final | LOW |
| `archivo_carga_sesiones_exactly_one_context_check` | 07 | constraint | solicitud XOR pedido | table | MOVE | 01 | same | invariante final | LOW |
| `archivo_carga_sesiones_public_context_check` | 07 | constraint | capability pública | table | MOVE | 01 | same | invariante final | LOW |
| `archivo_carga_sesiones_internal_context_check` | 07 | constraint | actor interno | table | MOVE | 01 | same | invariante final | LOW |
| `archivo_carga_sesiones_expires_after_creation_check` | 07 | constraint | expiración válida | table | MOVE | 01 | same | invariante final | LOW |
| `archivo_carga_sesiones_completed_at_status_check` | 07 | constraint | cierre coherente | table | MOVE | 01 | same | invariante final | LOW |
| `archivo_carga_items_sort_order_range_check` | 07 | constraint | máximo 10 items | table | MOVE | 01 | same | invariante final | LOW |
| `archivo_carga_items_object_path_shape_check` | 07 | constraint | path y extensión | table/helper | REPLACE | 01 | same | usar helper renombrado | MEDIUM |
| `archivo_carga_items_descriptor_check` | 07 | constraint | MIME/tamaño/nombre | table/helper | REPLACE | 01 | same | usar helper renombrado | MEDIUM |
| `archivo_carga_items_committed_at_status_check` | 07 | constraint | metadata de commit | table | MOVE | 01 | same | invariante final | LOW |
| `archivo_carga_items_session_sort_order_unique` | 07 | constraint | orden único | table | MOVE | 01 | same | invariante final | LOW |
| `archivo_carga_items_object_path_unique` | 07 | constraint | path único | table | MOVE | 01 | same | invariante final | LOW |
| `archivo_carga_sesiones_solicitud_id_idx` | 07 | index | lookup solicitud | RPC | MOVE | 01 | same | acceso final | LOW |
| `archivo_carga_sesiones_pedido_id_idx` | 07 | index | lookup pedido | RPC | MOVE | 01 | same | acceso final | LOW |
| `archivo_carga_sesiones_status_expires_at_idx` | 07 | index | expiración/estado | cleanup futuro | MOVE | 01 | same | acceso final | LOW |
| `archivo_carga_sesiones_public_token_hash_unique_idx` | 07 | index | capability única | RPC | MOVE | 01 | same | seguridad | LOW |
| `archivo_carga_items_session_id_idx` | 07 | index | items de sesión | RPC | MOVE | 01 | same | acceso final | LOW |
| `archivo_carga_items_session_status_idx` | 07 | index | completion | RPC | MOVE | 01 | same | acceso final | LOW |
| `archivo_carga_items_archivo_id_unique_idx` | 07 | index | commit 1:1 | finalize | MOVE | 01 | same | integridad final | LOW |
| RLS `archivo_carga_sesiones` | 07 | RLS | defensa por defecto | none direct | MOVE | 02 | same | RLS habilitado sin policies | LOW |
| RLS `archivo_carga_items` | 07 | RLS | defensa por defecto | none direct | MOVE | 02 | same | RLS habilitado sin policies | LOW |
| revokes CRUD control plane | 07 | grants | prohíbe CRUD directo | RPC only | MOVE | 02 | same | `anon`, `authenticated` y `service_role` sin CRUD | LOW |
| `is_valid_ppo03_file_descriptor` | 07 | helper | descriptor canónico | constraint/RPC | RENAME | 01 | `is_valid_upload_file_descriptor` | quitar nombre de fase | MEDIUM |
| `is_ppo03_object_path` | 07 | helper | valida `cargas/v1` | constraint | RENAME | 01 | `is_upload_object_path` | nombre de dominio | MEDIUM |
| `can_sign_ppo03_public_upload` | 07 | helper | signed upload público reservado | Storage policy | RENAME | 04 | `can_sign_public_upload` | nombre de dominio | MEDIUM |
| `can_create_ppo03_internal_upload` | 07 | helper | TUS interno reservado | Storage policy | RENAME | 04 | `can_create_internal_upload` | nombre de dominio | MEDIUM |
| `can_read_ppo03_storage_object` | 07 | helper | lectura committed | listing/download | RENAME | 04 | `can_read_committed_storage_object` | nombre semántico | MEDIUM |
| `can_manage_ppo03_storage_object` | 07 | helper | borrado manager | Storage policy | RENAME | 04 | `can_manage_upload_storage_object` | nombre semántico | MEDIUM |
| grants helpers PPO-03 | 07 | grants | policies invocan helpers | Storage API roles | REPLACE | 04 | grants a helpers renombrados | firmas cambian | MEDIUM |
| `godel_files_insert_ppo03_internal_tus` | 07 | policy | create/part TUS | Pedido UI | RENAME | 04 | `godel_files_insert_reserved_internal_tus` | quitar fase | MEDIUM |
| `godel_files_insert_ppo03_public_sign` | 07 | policy | firma pública reservada | public control plane | RENAME | 04 | `godel_files_insert_reserved_public_sign` | quitar fase | MEDIUM |
| `godel_files_select_ppo03_committed` | 07 | policy | download/delete autorizado | listing/download | RENAME | 04 | `godel_files_select_committed` | quitar fase | MEDIUM |
| `godel_files_delete_ppo03_managed` | 07 | policy | delete manager | future management | RENAME | 04 | `godel_files_delete_managed` | quitar fase | MEDIUM |
| bucket update PPO-03 | 07 | DML | 20 MiB/MIME final | Storage API | REPLACE | 04 | bucket final declarativo | no transición incremental | LOW |
| comments PPO-03 tables | 07 | comment | documentación | operators | REPLACE | 01 | comentarios sin PPO | dominio permanente | LOW |
| `create schema extensions` + `create extension pgcrypto` | 08 | extension | hashing | token helper | REPLACE | 01 | contrato único `extensions.pgcrypto` | evitar IF NOT EXISTS ambiguo | HIGH |
| `ppo03_public_token_hash` | 08 | helper | hash capability | public RPCs | RENAME | 03 | `upload_public_token_hash` | quitar fase | MEDIUM |
| `is_valid_ppo03_safe_name` | 08 | helper | safe filename | reservation validator | RENAME | 03 | `is_valid_upload_safe_name` | quitar fase | LOW |
| `validate_ppo03_reservation_items` | 08 | helper | JSON descriptors | reserve RPCs | RENAME | 03 | `validate_upload_reservation_items` | quitar fase | MEDIUM |
| `insert_ppo03_reservation_items` | 08 | helper | crea items/paths | reserve RPCs | RENAME | 03 | `insert_upload_reservation_items` | quitar fase | MEDIUM |
| `assert_ppo03_storage_object` | 08 | helper | objeto, tamaño y MIME | finalize RPCs | RENAME | 03 | `assert_upload_storage_object` | quitar fase | HIGH |
| `refresh_ppo03_upload_session_completion` | 08 | helper | estado agregado | finalize RPCs | RENAME | 03 | `refresh_upload_session_completion` | quitar fase | MEDIUM |
| `crear_solicitud_publica_con_reserva_carga` | 08 | RPC | solicitud + reserva atómica | server-only, no UI | MOVE | 03 | same | nombre público correcto | HIGH |
| `reservar_carga_pedido` | 08 | RPC | reserva interna | Pedido UI | MOVE | 03 | same | consumidor activo | LOW |
| `autorizar_firma_carga_publica` | 08 | RPC | valida capability | server-only, no UI | MOVE | 03 | same | contrato final | MEDIUM |
| `finalizar_carga_publica` | 08 | RPC | commit metadata público | server-only, no UI | MOVE | 03 | same | contrato final | MEDIUM |
| `finalizar_carga_pedido` | 08 | RPC | commit metadata interno | Pedido UI | MOVE | 03 | same | consumidor activo | LOW |
| revokes/grants helpers 08 | 08 | grants | encapsulación | RPC internals | REPLACE | 03 | firmas renombradas, sin execute externo | mínimo privilegio | LOW |
| grants cinco RPC upload | 08 | grants | `anon`/`authenticated` | app | MOVE | 03 | same | exactos por rol | LOW |
| `storage_path_has_exact_parts` | 04 | legacy helper | parser paths antiguos | legacy helpers | REMOVE | — | — | solo paths legacy | LOW |
| `storage_order_id` | 04 | legacy helper | extrae pedido del path | legacy policy | REMOVE | — | — | metadata/control plane reemplaza path | MEDIUM |
| `storage_order_category` | 04 | legacy helper | extrae categoría del path | legacy policy | REMOVE | — | — | visibilidad está en metadata/item | MEDIUM |
| `storage_request_id` | 04 | legacy helper | extrae solicitud del path | public legacy | REMOVE | — | — | reserva genera asociación | HIGH |
| `is_allowed_public_request_file_type` | 04 | legacy helper | extensión/MIME público | public legacy | REPLACE | 01 | `is_valid_upload_file_descriptor` | un contrato MIME | HIGH |
| `is_allowed_public_request_file` | 04 | legacy helper | descriptor público | public legacy | REPLACE | 01 | `is_valid_upload_file_descriptor` | un contrato descriptor | HIGH |
| `can_read_storage_object` | 04 | legacy helper | lectura por path | old select policy | REMOVE | — | — | committed control plane reemplaza | MEDIUM |
| `can_insert_storage_object` | 04 | legacy helper | insert por path pedido | old insert policy | REMOVE | — | — | reserva obligatoria | MEDIUM |
| `can_manage_storage_object` | 04 | legacy helper | manage por path | old policies | REMOVE | — | — | helper final usa control plane | MEDIUM |
| `can_insert_public_request_storage_object` | 04 | legacy helper | upload público directo | public UI actual | REMOVE | — | — | eliminar tras PPO-03E | HIGH |
| `can_insert_public_request_file_metadata` | 04 | legacy helper | metadata pública directa | public UI actual | REMOVE | — | — | finalize RPC reemplaza | HIGH |
| `pedido_file_path_matches` | 02 | legacy helper | valida path pedido | old metadata insert | REMOVE | — | — | Pedido ya usa finalize | MEDIUM |
| `can_insert_pedido_file_metadata` | 02 | legacy helper | metadata interna directa | no consumer active | REMOVE | — | — | finalize RPC reemplaza | MEDIUM |
| `solicitudes_insert_public` | 02 | legacy policy | INSERT público directo | public UI actual | REMOVE | — | — | RPC pública será única escritura | HIGH |
| `archivos_insert_internal` | 02 | legacy policy | metadata directa interna | no consumer active | REMOVE | — | — | finalize RPC | MEDIUM |
| `archivos_insert_public_request_files` | 04 | legacy policy | metadata pública directa | public UI actual | REMOVE | — | — | finalize pública | HIGH |
| `godel_files_select_accessible` | 04 | legacy policy | select por paths viejos | listing/download | REMOVE | — | — | policy committed nueva | MEDIUM |
| `godel_files_insert_accessible` | 04 | legacy policy | upload interno paths viejos | dead builder | REMOVE | — | — | TUS reservado | MEDIUM |
| `godel_files_update_manager` | 04 | legacy policy | update path viejo | no active consumer | REMOVE | — | — | no update de objetos final | LOW |
| `godel_files_delete_manager` | 04 | legacy policy | delete path viejo | management | REMOVE | — | — | policy control plane nueva | MEDIUM |
| `godel_files_insert_public_request_files` | 04 | legacy policy | upload público path viejo | public UI actual | REMOVE | — | — | signed reservation | HIGH |
| `grant insert solicitudes to anon` | 06 | direct grant | escritura pública | public UI actual | REMOVE | 02/06 | revoke/assert | solo RPC | HIGH |
| `grant insert archivos to anon` | 06 | direct grant | metadata pública | public UI actual | REMOVE | 02/06 | revoke/assert | solo finalize RPC | HIGH |
| `grant insert storage.objects to anon` | 04/06 | direct grant | habilita policy INSERT | Storage API | KEEP | 04 | same | RLS limita a firma reservada | MEDIUM |
| `grant insert archivos to authenticated` | 06 | direct grant | metadata interna | legacy path | REMOVE | 02/06 | revoke/assert | finalize SECURITY DEFINER | MEDIUM |

## 5. Resultado por decisión

La matriz contiene 77 filas: 29 `MOVE`, 1 `KEEP`, 9 `REPLACE`, 22 `REMOVE`
y 16 `RENAME`. SH-01C.1 debe recalcular esta cuenta desde el SQL generado y
tratar cualquier objeto no representado como un hallazgo, no como permiso para
copiarlo automáticamente.

## 6. Storage legacy

El modelo antiguo deriva autorización desde cuatro segmentos del path. Se usa
en uploads directos y permite que el cliente participe en la construcción del
contexto. El modelo final deriva autoridad desde `archivo_carga_sesiones`,
`archivo_carga_items` y `archivos`; el path solo identifica el objeto reservado.

Decisión final: retirar todos los parsers/helpers/policies legacy listados en la
matriz. No hay objetos productivos históricos que conservar. La retirada queda
condicionada a desplegar PPO-03E junto con la nueva baseline/aplicación.

## 7. Control plane final

- RLS habilitado en ambas tablas, sin policies de CRUD.
- `PUBLIC`, `anon`, `authenticated` y `service_role` sin CRUD directo.
- Solo funciones `SECURITY DEFINER` con `search_path = ''` escriben el control
  plane.
- `anon` ejecuta creación pública, autorización de firma y finalize público.
- `authenticated` ejecuta reserva y finalize de Pedido.
- Los helpers privados no reciben execute de roles externos salvo los helpers
  invocados por policies de Storage, que requieren únicamente el grant exacto.

## 8. Direct grants públicos

La hipótesis queda validada como arquitectura final:

```text
anon: NO INSERT public.solicitudes
anon: NO INSERT public.archivos
anon: escritura de negocio solo por RPC pública controlada
```

El `INSERT storage.objects` de `anon` sí permanece porque la API Storage evalúa
la policy de firma reservada; no concede upload arbitrario. `SELECT`, `UPDATE` y
`DELETE` anónimos permanecen revocados.

## 9. Consumers TypeScript

### Pedido

El detalle de Pedido conecta `reservePedidoFilesAction` a
`reservar_carga_pedido`, transfiere bytes por TUS a la ruta reservada y conecta
`finalizePedidoFileAction` a `finalizar_carga_pedido`. Listing consulta
`public.archivos` y la descarga genera signed URL server-side usando
`file_path`. Las rutas `pedidos/{id}/internos|avances|finales` siguen presentes
en builders/constants/documentación, pero no participan en nuevas cargas de la
UI de Pedido. Son código legacy inventariado; no se elimina en SH-01C.0.

### Público

La UI `/solicitud` sigue conectada a `createPublicSolicitud`, que hace INSERT
directo en `solicitudes`, y después a `uploadPublicSolicitudFiles`, que usa
`solicitudes/{id}/originales/...`, Storage upload directo e INSERT directo en
`archivos`. El módulo server-only nuevo existe y consume las tres RPC públicas,
pero `reservePublicUpload`, `signPublicUpload` y `finalizePublicUpload` no están
conectados a la action/UI.

## 10. Gap público PPO-03E

PPO-03E debe reemplazar en una sola entrega el formulario/action actual por:

```text
descriptores -> crear_solicitud_publica_con_reserva_carga
-> autorizar_firma_carga_publica -> signed upload
-> finalizar_carga_publica
```

Si se retiran antes los grants/policies legacy, `/solicitud` crea cero
solicitudes y/o deja objetos staged sin metadata. Por ello PPO-03E es un gate
HIGH para activar la baseline definitiva, aunque no para redactarla.

## 11. Paths definitivos

Una instalación nueva debe aceptar exclusivamente:

```text
cargas/v1/{session_id}/{item_id}/{nonce}-{safe_filename}
```

No existe producción con objetos históricos. Los cuatro roots legacy no deben
aparecer en helpers, policies ni assertions finales. Los builders TS pueden
seguir temporalmente en código durante la transición, pero no son contrato DB.

## 12. MIME final

| EXTENSION | CANONICAL MIME | BUCKET ACCEPTED MIME | LEGACY COMPATIBILITY MIME |
|---|---|---|---|
| pdf | `application/pdf` | same | — |
| jpg/jpeg | `image/jpeg` | same | — |
| png | `image/png` | same | — |
| webp | `image/webp` | same | — |
| doc | `application/msword` | same | — |
| docx | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | same | — |
| zip | `application/zip` | canonical plus `application/x-zip-compressed` | `application/x-zip-compressed` solo en bucket/legacy input; nuevos descriptores normalizan a `application/zip` |
| rar | `application/vnd.rar` | same | — |
| cdr | `application/vnd.corel-draw` | same | — |

El drift actual está en el validador legacy TS/04, que no acepta RAR/CDR, y en
ZIP, que acepta el MIME alternativo. El control plane TS/07/08 ya usa el
contrato canónico final; el bucket conserva el MIME ZIP alternativo por
compatibilidad del cliente Storage, sin convertirlo en descriptor canónico.

## 13. pgcrypto y extensions

Evidencia local read-only:

```text
PostgreSQL=17.6
extensions schema=exists
pgcrypto schema=extensions
pgcrypto version=1.3
extensions.digest(bytea,text)=exists
extensions.digest(text,text)=exists
```

01 debe crear/confirmar primero el schema `extensions` y ejecutar `CREATE
EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions`. Después debe comprobar
que `pgcrypto` realmente pertenece a `extensions`; `IF NOT EXISTS ... WITH
SCHEMA` no mueve una instalación preexistente. Ante otra ubicación, la baseline
debe fallar con diagnóstico en vez de asumir que `extensions.digest` existe.

## 14. Contrato `public.archivos`

La estructura actual se conserva sin cambios: `pedido_id`, `solicitud_id`,
`file_name`, `file_path`, `file_type`, `file_size`, `bucket`, `visibility`,
`uploaded_by` y constraints actuales. Permitir ambos IDs es intencional tras la
conversión Solicitud→Pedido. El finalize público/interno escribe la misma
metadata que consumen listados y signed downloads. No hay evidencia para añadir
columnas ni derivar contexto desde el path.

## 15. Conversión Solicitud → Pedido

`convertir_solicitud_a_pedido` actualiza `archivos.pedido_id` por
`solicitud_id`, `pedido_id is null` y `visibility = cliente_solicitud`. No
interpreta `file_path`; por tanto funciona igual con `cargas/v1`. El registro
queda asociado a solicitud y pedido, y la lectura final usa metadata/RLS.

## 16. Hardening esperado

06 debe abortar si no se cumple cualquiera de estos contratos:

- existen los 12 enums/18 tablas finales y RLS está activo en ambas tablas de carga;
- existen las cinco RPC con firmas exactas y solo los roles previstos tienen execute;
- `anon` no inserta directamente en `solicitudes` ni `archivos`;
- control plane sin CRUD directo para `anon`, `authenticated` o `service_role`;
- bucket `godel-files` privado, 20 MiB y allowlist MIME exacta;
- cuatro policies nuevas presentes y policies legacy ausentes;
- `anon` sin read/list/update/delete de Storage;
- helpers/path legacy y nombres `ppo03` ausentes;
- firmas RPC intermedias ausentes;
- `pgcrypto` pertenece a `extensions` y `extensions.digest` existe;
- triggers/grants Auth Admin y las 13 RPC de negocio originales permanecen.

## 17. Dependencias Supabase self-hosted

| DEPENDENCY | CLASSIFICATION | DECISION |
|---|---|---|
| roles `anon`, `authenticated`, `service_role`, `supabase_auth_admin` | SUPPORTED_PLATFORM_CONTRACT | conservar grants exactos |
| `auth.uid()`, `auth.users`, trigger provisioning | SUPPORTED_PLATFORM_CONTRACT | limitar `auth.users` a 05 |
| `storage.objects`, `storage.buckets`, RLS | SUPPORTED_PLATFORM_CONTRACT | conservar uso documentado |
| `storage.allow_any_operation` / `allow_only_operation` | VERSION_SENSITIVE | existen en bundle fijado; assertion de firma y pin de bundle |
| `storage.objects.metadata.size/mimetype` | VERSION_SENSITIVE | finalize debe assertar shape; prueba contra versión fijada |
| schemas `private`, tablas control plane, helpers | PROJECT_OWNED | baseline autoritativa |

## 18. Plan de sustitución atómica

1. Implementar PPO-03E o coordinar su merge/activación con la baseline.
2. Generar seis archivos nuevos desde el estado final, no mediante concatenación.
3. Renombrar helpers/policies PPO y actualizar todas sus referencias dentro del
   mismo conjunto SQL.
4. Retirar los ocho archivos del directorio activo y añadir los seis nuevos en
   un solo commit; Git conserva la historia.
5. Validar desde cero únicamente contra Supabase self-hosted fijado, PostgreSQL
   17, Auth y Storage self-hosted.
6. Regenerar `database.types.ts`, ejecutar pruebas SQL/RLS/RPC/Storage y QA de
   aplicación antes de promover.

No se debe aplicar la nueva serie sobre una DB que ya registró 01–08. Es una
baseline de instalación nueva; la transición de entornos con historia requiere
una decisión separada, no `migration repair` improvisado.

## 19. Riesgos

### HIGH

- Retirar grants/policies legacy antes de PPO-03E rompe `/solicitud`.
- Ubicación incorrecta de `pgcrypto` rompe el hash de capability.
- `assert_upload_storage_object` depende del shape de metadata Storage fijado.
- Un rename incompleto de helper dentro de constraint/policy/RPC invalida el
  bootstrap o abre Storage.

### MEDIUM

- Helpers `storage.allow_*` son version-sensitive y deben probarse al actualizar
  el bundle.
- Builders legacy TS siguen exportados y podrían reutilizarse accidentalmente.
- El validador público legacy tiene drift MIME respecto al control plane final.
- El acceso directo `authenticated` a `archivos` debe reducirse sin romper
  listados, comentarios de historial o futuras acciones manager.

## 20. Criterios de aceptación SH-01C.1

- seis migraciones nuevas reproducen desde cero el estado definido aquí;
- 01–08 dejan de estar en el directorio activo de forma atómica;
- ningún objeto persistente contiene `ppo03`/`ppo_03`;
- solo `cargas/v1` aparece en SQL Storage;
- cinco RPC upload y 13 RPC de negocio originales existen con firmas/grants exactos;
- control plane tiene RLS y cero CRUD directo;
- `anon` no inserta directamente en `solicitudes`/`archivos`;
- bucket/policies/MIME/hardening pasan contra el bundle self-hosted fijado;
- Auth Admin conserva triggers, auditorías y permisos;
- `public.archivos` y conversión mantienen su contrato;
- PPO-03E está integrado o existe una decisión explícita que impide activar la
  nueva baseline con la UI pública legacy;
- tipos generados, pruebas SQL, lint/build y QA aplicable pasan.
