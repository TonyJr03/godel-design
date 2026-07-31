# Inventario Final de Migraciones de Base de Datos

Fecha de auditoría: 2026-07-30

Rama de trabajo: `refactor/final-database-baseline`

SHA inicial: `07cbaa0ac937bc4f81e26bb3f9b78d0439b734e1`

Alcance: inventario, análisis, clasificación, dependencias y diseño del set consolidado. No se modifican migraciones históricas, no se ejecuta `supabase db reset`, no se toca Supabase remoto y no se redactan aún las seis migraciones definitivas.

## Estado Inicial

| Item | Valor |
| --- | --- |
| Rama inicial local | `main` |
| Rama de trabajo | `refactor/final-database-baseline` |
| SHA inicial | `07cbaa0ac937bc4f81e26bb3f9b78d0439b734e1` |
| Árbol antes de crear rama | Limpio |
| `git pull --ff-only origin main` | `Already up to date.` |
| Últimos commits | `07cbaa0 merge: integrar ajustes responsive de configuracion`; `38b404f fix: ajustar cards moviles de configuracion`; `b45af01 merge: integrar gestion segura de usuarios`; `28e016b feat: mejorar experiencia de los campos de contrasena`; `f1db0d9 fix: manejar resultados inciertos de Auth Admin` |
| Supabase CLI | `2.109.1` |
| CLI disponible | Hay aviso de version nueva `2.110.0`; no se actualizo |
| PostgreSQL local configurado | `major_version = 17` en `supabase/config.toml` |
| Supabase local | Base local accesible; auxiliares detenidos: imgproxy, edge runtime, analytics, vector, pooler |

Nota: la primera ejecución del CLI dentro del sandbox falló al intentar escribir telemetría en `C:\Users\oscar\.supabase`; se repitió con aprobación. No se deben reportar claves, passwords ni URLs con credenciales.

## Inventario Fisico de Migraciones

Total real de archivos SQL en `supabase/migrations`: **21**.

El comando `npx.cmd supabase migration list --local` devolvió también 21 versiones, todas presentes como `local` y `remote` en el historial local del CLI:

`20260625000100`, `20260625000200`, `20260625000300`, `20260625000400`, `20260625000500`, `20260625000600`, `20260625000700`, `20260727163202`, `20260728015355`, `20260728034617`, `20260728090000`, `20260728120000`, `20260729232826`, `20260729235400`, `20260730013011`, `20260730015353`, `20260730030404`, `20260730143435`, `20260730150845`, `20260730165326`, `20260730174544`.

| Orden | Migración actual | Timestamp | Tamaño | Propósito aparente |
| --- | --- | --- | ---: | --- |
| 1 | `20260625000100_01_core_schema.sql` | `20260625000100` | 45430 | Baseline estructural inicial: schema `private`, extensión `pgcrypto`, enums, tablas principales, constraints, FKs, triggers estructurales, historial automático e índices |
| 2 | `20260625000200_02_security_rls_grants.sql` | `20260625000200` | 26287 | Helpers de autorización, grants base, RLS y policies iniciales |
| 3 | `20260625000300_03_business_rpcs.sql` | `20260625000300` | 38955 | RPCs transaccionales iniciales de solicitudes, pedidos, pagos, tareas, comentarios, historial y tracking público |
| 4 | `20260625000400_04_storage.sql` | `20260625000400` | 17994 | Bucket privado, helpers de Storage, policies de `storage.objects`, grants y validaciones de archivos públicos |
| 5 | `20260625000500_05_final_hardening.sql` | `20260625000500` | 14528 | Hardening inicial: revokes/grants, comments y assertions defensivas |
| 6 | `20260625000600_06_add_pedido_actualizado_history_action.sql` | `20260625000600` | 90 | Agrega valor enum `pedido_actualizado` |
| 7 | `20260625000700_07_actualizar_datos_pedido_rpc.sql` | `20260625000700` | 8354 | Primera RPC de edición de datos/precio de pedido, antes de `service_id` |
| 8 | `20260727163202_configurable_service_types_expand.sql` | `20260727163202` | 12390 | Introduce `tipos_servicio`, `service_id`, sync de `workflow_type`, backfills y RLS inicial de catálogo |
| 9 | `20260728015355_public_service_types_integration.sql` | `20260728015355` | 937 | Reemplaza policies públicas para catálogo y creación pública de solicitudes con `service_id` |
| 10 | `20260728034617_internal_service_types_orders.sql` | `20260728034617` | 12082 | Reemplaza `crear_pedido_manual` y `convertir_solicitud_a_pedido` con firma basada en `service_id` |
| 11 | `20260728090000_actualizar_servicio_pedido_rpc.sql` | `20260728090000` | 9970 | Reemplaza `actualizar_datos_pedido` para editar servicio y proteger workflow |
| 12 | `20260728120000_service_types_contract.sql` | `20260728120000` | 10022 | Cierra contrato de servicios: `service_id` obligatorio, policies finales, elimina columna legacy y ajusta historial |
| 13 | `20260729232826_secure_admin_user_creation_foundation.sql` | `20260729232826` | 6079 | Fundacion Auth Admin: `must_change_password`, `created_by`, provisioning Auth -> perfil y RPC inicial de cambio de password |
| 14 | `20260729235400_secure_admin_user_creation_privilege_hardening.sql` | `20260729235400` | 534 | Endurece grants de `perfiles`: retira update completo y concede updates por columnas |
| 15 | `20260730013011_secure_admin_user_creation_app_metadata_update_trigger.sql` | `20260730013011` | 527 | Agrega trigger `AFTER UPDATE OF raw_app_meta_data` para provisioning local cuando metadata llega después |
| 16 | `20260730015353_secure_internal_user_creation_audit_rate_limit.sql` | `20260730015353` | 8664 | Tabla privada y RPCs de auditoría/rate limit para creación administrativa |
| 17 | `20260730030404_remove_legacy_internal_profile_creation.sql` | `20260730030404` | 130 | Retira policy/grant legacy de inserción directa en `perfiles` |
| 18 | `20260730143435_make_initial_password_completion_idempotent.sql` | `20260730143435` | 1243 | Hace idempotente `complete_initial_password_change`; luego queda reemplazada |
| 19 | `20260730150845_harden_initial_password_completion_concurrency.sql` | `20260730150845` | 1779 | Versión final vigente de `complete_initial_password_change` con `FOR UPDATE` |
| 20 | `20260730165326_secure_internal_user_password_reset.sql` | `20260730165326` | 13548 | Tabla privada y RPCs iniciales de reset administrativo de password |
| 21 | `20260730174544_harden_internal_user_password_reset_recovery.sql` | `20260730174544` | 14371 | Versión final vigente de reset con idempotencia, recovery y `get_internal_user_password_reset_state` |

## Matriz de Consolidación

| Orden | Migración actual | Categoría | Objetos afectados | Estado intermedio? | Sustituida por | Destino 01-06 | Acción consolidada |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `20260625000100_01_core_schema.sql` | Core inicial | schemas, extensión, enums, tablas, constraints, FKs, triggers, historial, índices | Parcial | Migraciones de servicios y Auth Admin agregan estado final | 01 | REESCRIBIR_COMO_ESTADO_INICIAL |
| 2 | `20260625000200_02_security_rls_grants.sql` | Seguridad inicial | helpers privados, RLS, policies, grants/revokes | Parcial | Servicios, perfiles operativos y hardening posterior | 02, 06 | INTEGRAR_ESTADO_FINAL |
| 3 | `20260625000300_03_business_rpcs.sql` | RPCs iniciales | RPCs de negocio y tracking | Parcial | RPCs con `service_id` y Auth Admin posteriores | 03 | INTEGRAR_ESTADO_FINAL |
| 4 | `20260625000400_04_storage.sql` | Storage | bucket `godel-files`, helpers, policies de `storage.objects` | No, salvo hardening final | Hardening 06 debe verificar | 04, 06 | INTEGRAR_ESTADO_FINAL |
| 5 | `20260625000500_05_final_hardening.sql` | Hardening inicial | revokes/grants/comments/assertions | Si | Nuevo contrato 01-05 | 06 | MOVER_A_HARDENING |
| 6 | `20260625000600_06_add_pedido_actualizado_history_action.sql` | Patch enum | `pedido_historial_action` | Si | Estado inicial final del enum | 01 | REESCRIBIR_COMO_ESTADO_INICIAL |
| 7 | `20260625000700_07_actualizar_datos_pedido_rpc.sql` | RPC incremental | `public.actualizar_datos_pedido` sin `service_id` | Si | `20260728090000` | 03 | DESCARTAR_VERSION_INTERMEDIA |
| 8 | `20260727163202_configurable_service_types_expand.sql` | Catálogo servicios | `tipos_servicio`, `service_id`, triggers sync, backfills, policies | Si | `20260728120000` cierra contrato | 01, 02, 06 | INTEGRAR_ESTADO_FINAL |
| 9 | `20260728015355_public_service_types_integration.sql` | RLS catálogo/público | `tipos_servicio_select_public`, `solicitudes_insert_public` | Si | `20260728120000` | 02 | DESCARTAR_VERSION_INTERMEDIA |
| 10 | `20260728034617_internal_service_types_orders.sql` | RPCs de servicios | `convertir_solicitud_a_pedido`, `crear_pedido_manual` | No para las firmas vigentes | Estado final actual | 03 | INTEGRAR_ESTADO_FINAL |
| 11 | `20260728090000_actualizar_servicio_pedido_rpc.sql` | RPC de edición pedido | `actualizar_datos_pedido` con `service_id` | No | Estado final actual | 03 | INTEGRAR_ESTADO_FINAL |
| 12 | `20260728120000_service_types_contract.sql` | Contrato final servicios | `service_id not null`, policy final, columna legacy, historial | Parcial: backfills son históricos | Estado final actual | 01, 02, 06 | INTEGRAR_ESTADO_FINAL |
| 13 | `20260729232826_secure_admin_user_creation_foundation.sql` | Auth Admin foundation | `perfiles.must_change_password`, `perfiles.created_by`, helpers operativos, trigger Auth, `complete_initial_password_change` inicial | Parcial | `20260730150845` para RPC; migraciones posteriores para lifecycle | 01, 02, 05 | INTEGRAR_ESTADO_FINAL |
| 14 | `20260729235400_secure_admin_user_creation_privilege_hardening.sql` | Grants perfiles | Grants por columna en `perfiles` | No | Estado final actual | 02, 06 | INTEGRAR_ESTADO_FINAL |
| 15 | `20260730013011_secure_admin_user_creation_app_metadata_update_trigger.sql` | Trigger Auth complementario | trigger update metadata en `auth.users` | No | Estado final actual | 05 | INTEGRAR_ESTADO_FINAL |
| 16 | `20260730015353_secure_internal_user_creation_audit_rate_limit.sql` | Auditoría alta | `private.internal_user_creation_audit`, begin/complete creation | No | Estado final actual | 05 | INTEGRAR_ESTADO_FINAL |
| 17 | `20260730030404_remove_legacy_internal_profile_creation.sql` | Retiro legacy | policy `perfiles_insert_admin`, grant insert perfiles | No como estado final; es eliminación | Estado final de 02 no debe crear legacy | 02, 06 | DESCARTAR_VERSION_INTERMEDIA |
| 18 | `20260730143435_make_initial_password_completion_idempotent.sql` | RPC intermedia | `complete_initial_password_change` idempotente | Si | `20260730150845` | 05 | DESCARTAR_VERSION_INTERMEDIA |
| 19 | `20260730150845_harden_initial_password_completion_concurrency.sql` | RPC final cambio inicial | `complete_initial_password_change` con bloqueo/concurrencia | No | Estado final actual | 05 | INTEGRAR_ESTADO_FINAL |
| 20 | `20260730165326_secure_internal_user_password_reset.sql` | Reset inicial | audit reset, begin/complete reset iniciales | Parcial | `20260730174544` reemplaza funciones | 05 | INTEGRAR_ESTADO_FINAL |
| 21 | `20260730174544_harden_internal_user_password_reset_recovery.sql` | Reset final | begin reset final, get state, complete reset final | No | Estado final actual | 05 | INTEGRAR_ESTADO_FINAL |

## Objetos Efectivos Detectados

### Schemas y Extensiones

Schemas relevantes: `auth`, `private`, `public`, `storage`.

Extensiones instaladas detectadas: `pgcrypto`, `uuid-ossp`, `pg_net`, `pg_stat_statements`, `supabase_vault`, `plpgsql`.

### Enums Finales

| Enum | Valores finales |
| --- | --- |
| `public.app_role` | `admin`, `supervisor`, `trabajador` |
| `public.workflow_type` | `encargo`, `impresion` |
| `public.solicitud_estado` | `nueva`, `en_revision`, `contactada`, `aprobada`, `rechazada`, `convertida` |
| `public.pedido_estado` | `creado`, `solicitud_recibida`, `en_revision`, `en_produccion`, `listo_entrega`, `entregado`, `cancelado` |
| `public.pedido_pago_estado` | `sin_pago`, `parcial`, `pagado` |
| `public.pedido_prioridad` | `baja`, `normal`, `alta`, `urgente` |
| `public.pedido_tarea_tipo` | `simple`, `cuantificada` |
| `public.archivo_visibility` | `cliente_solicitud`, `interno_pedido`, `avance`, `final_entrega` |
| `public.pedido_historial_action` | `pedido_creado`, `estado_cambiado`, `trabajador_asignado`, `trabajador_removido`, `archivo_subido`, `nota_agregada`, `fecha_entrega_actualizada`, `pedido_entregado`, `pedido_cancelado`, `tarea_creada`, `tarea_actualizada`, `tarea_eliminada`, `tarea_completada`, `tarea_reabierta`, `tarea_progreso_actualizado`, `pago_actualizado`, `pedido_actualizado` |
| `public.solicitud_historial_action` | `solicitud_creada`, `archivos_adjuntados`, `estado_cambiado`, `cliente_asociado`, `cliente_creado_desde_solicitud`, `convertida_a_pedido` |

### Tablas Finales

| Tabla | Columnas finales resumidas |
| --- | --- |
| `private.internal_user_creation_audit` | `id uuid pk default gen_random_uuid()`, `actor_profile_id uuid`, `target_role app_role`, `target_auth_user_id uuid null`, `status text`, `error_code text null`, `created_at timestamptz default now()`, `completed_at timestamptz null` |
| `private.internal_user_password_reset_audit` | `id uuid pk default gen_random_uuid()`, `actor_profile_id uuid`, `target_profile_id uuid`, `status text`, `error_code text null`, `previous_is_active bool`, `previous_must_change_password bool`, `created_at timestamptz default now()`, `completed_at timestamptz null` |
| `public.perfiles` | `id uuid pk references auth.users`, `full_name text`, `role app_role default trabajador`, `phone text null`, `avatar_url text null`, `is_active bool default true`, `created_at`, `updated_at`, `must_change_password bool default false`, `created_by uuid null references perfiles` |
| `public.clientes` | `id uuid pk`, `name`, `phone`, `email null`, `notes null`, `created_at`, `updated_at` |
| `public.tipos_servicio` | `id uuid pk`, `name`, `description`, `workflow_type`, `is_publicly_available bool default true`, `created_by null`, `updated_by null`, `created_at`, `updated_at` |
| `public.solicitudes` | `id uuid pk`, `public_reference`, `cliente_id null`, `converted_order_id null`, `client_name`, `client_phone`, `client_email null`, `description`, `desired_date null`, `notes null`, `status default nueva`, `workflow_type default encargo`, `reviewed_by null`, `created_at`, `updated_at`, `service_id uuid not null` |
| `public.pedidos` | `id uuid pk`, `order_number`, `public_reference`, `cliente_id null`, `solicitud_id null`, `title`, `description`, `status default solicitud_recibida`, `workflow_type default encargo`, `priority default normal`, `estimated_delivery_date null`, `actual_delivery_date null`, `created_by null`, `created_at`, `updated_at`, `service_id uuid not null` |
| `public.pedido_contadores` | `year smallint pk`, `last_number int default 0`, `updated_at` |
| `public.pedido_trabajadores` | `id uuid pk`, `pedido_id`, `assigned_profile_id`, `assigned_by null`, `assigned_at` |
| `public.pedido_tareas` | `id uuid pk`, `pedido_id`, `title`, `task_type`, `target_quantity null`, `completed_quantity null`, `is_completed default false`, `sort_order default 0`, `created_by null`, `updated_by null`, `completed_by null`, `completed_at null`, `created_at`, `updated_at` |
| `public.archivos` | `id uuid pk`, `pedido_id null`, `solicitud_id null`, `file_name`, `file_path`, `file_type null`, `file_size null`, `bucket`, `visibility`, `uploaded_by null`, `created_at` |
| `public.pedido_comentarios` | `id uuid pk`, `pedido_id`, `content`, `author_id`, `created_at` |
| `public.pedido_historial` | `id uuid pk`, `pedido_id`, `action`, `summary`, `old_value null`, `new_value null`, `metadata jsonb default {}`, `actor_id null`, `created_at default clock_timestamp()` |
| `public.solicitud_comentarios` | `id uuid pk`, `solicitud_id`, `content`, `author_id`, `created_at` |
| `public.solicitud_historial` | `id uuid pk`, `solicitud_id`, `action`, `summary`, `old_value null`, `new_value null`, `metadata jsonb default {}`, `actor_id null`, `created_at default clock_timestamp()` |
| `public.trabajo_plantillas` | `id uuid pk`, `name`, `description null`, `is_active default true`, `created_by null`, `updated_by null`, `created_at`, `updated_at` |
| `public.trabajo_plantilla_tareas` | `id uuid pk`, `template_id`, `title`, `task_type`, `target_quantity null`, `sort_order default 0`, `created_at`, `updated_at` |
| `public.pedido_pagos` | `pedido_id uuid pk`, `total_amount numeric default 0`, `paid_cash_amount numeric default 0`, `paid_transfer_amount numeric default 0`, `payment_status default pagado`, `paid_at null`, `created_by null`, `updated_by null`, `created_at`, `updated_at` |

### Constraints, FKs e Indices Finales Relevantes

- `perfiles`: FK a `auth.users(id) on delete cascade`; self-FK `created_by on delete set null`; check `created_by <> id`; check `full_name` no vacío; índices `perfiles_full_name_idx`, `perfiles_active_role_full_name_idx`.
- `tipos_servicio`: checks de nombre 2-120, descripción no vacía y máximo 500; FKs `created_by`/`updated_by` a `perfiles`; índice único funcional `lower(btrim(name))`; índice único parcial `workflow_type` cuando `workflow_type = 'impresion'`.
- `solicitudes`: FK `service_id` a `tipos_servicio on delete restrict`; FKs a `clientes`, `perfiles`, `pedidos`; `public_reference` único y con formato `GD-XXXX-XXXX`; índice `service_id`; índice único parcial `converted_order_id` no null.
- `pedidos`: FK `service_id` a `tipos_servicio on delete restrict`; FKs a `clientes`, `solicitudes`, `perfiles`; `order_number` único con formato `P-YY-XXXX`; `public_reference` único; índice `service_id`; índice único parcial `solicitud_id` no null; índices parciales de activos por creación y fecha estimada.
- `pedido_pagos`: checks de montos no negativos, pagado no excede total, `paid_at` consistente y `payment_status = private.calculate_pedido_payment_status(...)`; PK/FK 1:1 con `pedidos`.
- `pedido_tareas` y `trabajo_plantilla_tareas`: checks de tarea simple/cuantificada, cantidades, progreso y orden no negativo; índices por pedido/template y orden.
- `archivos`: bucket fijo `godel-files`; `file_path`/`file_name` no vacíos; `file_size >= 0`; al menos `pedido_id` o `solicitud_id`; índices por pedido/solicitud, categoría y fecha.
- Auditorías privadas: checks de estados, terminalidad, `error_code`, rate limit y estados críticos; FKs restrict a `perfiles`; índice único parcial de reset para un `pending` por objetivo.

### Triggers Finales

| Tabla | Triggers vigentes |
| --- | --- |
| `auth.users` | `on_auth_user_created_provision_internal_profile` `AFTER INSERT`; `on_auth_user_app_metadata_provision_internal_profile` `AFTER UPDATE OF raw_app_meta_data`; ambos ejecutan `private.provision_internal_profile_from_auth_user()` |
| `public.perfiles` | `set_perfiles_updated_at`; `ensure_perfil_admin_integrity` |
| `public.tipos_servicio` | `set_tipos_servicio_updated_at`; `prevent_tipos_servicio_workflow_type_change` |
| `public.solicitudes` | `set_solicitudes_updated_at`; `set_solicitud_public_reference`; `sync_solicitudes_workflow_type_from_service`; triggers de historial de creación, estado, cliente y conversión |
| `public.pedidos` | `set_pedido_order_number`; `set_pedidos_updated_at`; `set_pedido_public_reference`; `sync_pedidos_workflow_type_from_service`; historial `pedido_creado` |
| `public.pedido_contadores` | `set_pedido_contadores_updated_at` |
| `public.pedido_trabajadores` | `ensure_active_order_assignment_profile`; historial de asignación/remocion |
| `public.pedido_tareas` | `set_pedido_tareas_updated_at`; historial de creación, actualización y eliminación |
| `public.pedido_pagos` | `set_pedido_pagos_payment_status` en insert/update; `set_pedido_pagos_updated_at` |
| `public.archivos` | historial de archivo de pedido y archivo de solicitud |
| `public.trabajo_plantillas` | `set_trabajo_plantillas_updated_at` |
| `public.trabajo_plantilla_tareas` | `set_trabajo_plantilla_tareas_updated_at` |

### Funciones y RPC Finales

RPC públicas finales:

- `public.actualizar_datos_pedido(p_pedido_id uuid, p_service_id uuid, p_title text, p_description text, p_priority pedido_prioridad, p_estimated_delivery_date date, p_total_amount numeric)` retorna tabla con datos editados de pedido/pago.
- `public.actualizar_estado_pedido(p_pedido_id uuid, p_nuevo_estado pedido_estado)` retorna `pedidos`.
- `public.actualizar_estado_solicitud(p_solicitud_id uuid, p_estado_nuevo solicitud_estado)` retorna `solicitudes`.
- `public.actualizar_pago_pedido(p_pedido_id uuid, p_paid_cash_amount numeric, p_paid_transfer_amount numeric)` retorna `pedido_pagos`.
- `public.aplicar_plantilla_tareas_pedido(p_pedido_id uuid, p_template_id uuid)` retorna `integer`.
- `public.begin_internal_user_creation_attempt(p_target_role app_role)` retorna `(allowed, attempt_id, limited_scope)`.
- `public.begin_internal_user_password_reset(p_target_profile_id uuid, p_attempt_id uuid)` retorna `(allowed, attempt_id, limited_scope, previous_is_active, previous_must_change_password)`.
- `public.complete_initial_password_change(p_user_id uuid)` retorna `uuid`.
- `public.complete_internal_user_creation_attempt(p_attempt_id uuid, p_status text, p_error_code text, p_target_auth_user_id uuid)` retorna `uuid`.
- `public.complete_internal_user_password_reset(p_attempt_id uuid, p_status text, p_error_code text)` retorna `uuid`.
- `public.consultar_estado_publico(p_public_reference text)` retorna DTO público mínimo.
- `public.convertir_solicitud_a_pedido(p_solicitud_id uuid, p_service_id uuid, p_title text, p_description text, p_priority pedido_prioridad, p_estimated_delivery_date date, p_total_amount numeric)` retorna `pedidos`.
- `public.crear_cliente_desde_solicitud(p_solicitud_id uuid)` retorna `clientes`.
- `public.crear_pedido_manual(p_service_id uuid, p_cliente_id uuid, p_title text, p_description text, p_priority pedido_prioridad, p_estimated_delivery_date date, p_total_amount numeric)` retorna `(pedido_id, order_number, public_reference)`.
- `public.get_internal_user_password_reset_state(p_attempt_id uuid)` retorna estado mínimo de intento propio.
- `public.listar_pedido_comentarios(p_pedido_id uuid)`, `public.listar_pedido_historial(p_pedido_id uuid)`, `public.listar_solicitud_comentarios(p_solicitud_id uuid)`, `public.listar_solicitud_historial(p_solicitud_id uuid)`.

Helpers privados efectivos: 51 funciones en `private`, incluyendo helpers de rol/acceso, numeración, public references, historial automático, Storage, catálogo de servicios y provisioning Auth. La baseline final corregida no debe incorporar helpers privados no usados que generen warnings. Todas las funciones `SECURITY DEFINER` detectadas tienen `search_path` configurado. Las funciones especializadas de Auth Admin usan `search_path = ''`.

## Correcciones Obligatorias de db lint

### `private.generate_public_reference()`

- Actualmente produce `control reached end of function without RETURN`.
- No se detectaron callers efectivos.
- Los triggers vigentes llaman a `private.generate_public_reference_candidate()`.
- No debe incorporarse a la nueva baseline salvo que la implementación descubra un caller real.
- Acción consolidada: `DESCARTAR_HELPER_PRIVADO_NO_USADO`.
- Si finalmente se conserva, debe reescribirse con loop acotado y `raise exception` terminal explícito.

### `private.generate_public_reference_candidate()`

- Debe eliminar la declaración explícita `v_index integer`.
- El `FOR v_index IN 0..7` crea automáticamente la variable.
- Debe conservar la generación y el formato actual.
- Acción consolidada: `INTEGRAR_ESTADO_FINAL_CORREGIDO`.

Criterio obligatorio de QA final: `npx.cmd supabase db lint --level warning --local` debe devolver un array vacío (`[]`). No se deben aceptar los warnings actuales como baseline definitiva.

Implicacion para equivalencia: si `private.generate_public_reference()` continua sin callers, no debe existir en la baseline consolidada; `private.generate_public_reference_candidate()` debe existir sin warnings.

### RLS y Policies Finales

RLS está habilitado en todas las tablas `public` del proyecto y en `storage.objects`. Las tablas privadas de auditoría no tienen RLS habilitado pero no tienen grants directos a `anon`, `authenticated`, `service_role` ni `supabase_auth_admin`; solo `postgres` conserva privilegios directos.

Policies finales principales:

- `perfiles`: `perfiles_select_visible` para propia fila/admin/supervisor/perfiles relacionados a pedidos accesibles; `perfiles_update_admin` para admin operativo. No hay insert legacy.
- `tipos_servicio`: lectura pública de filas públicas; lectura interna con perfil operativo; insert/update solo admin; insert limitado a `workflow_type = encargo`; sin delete.
- `solicitudes`: insert público controlado para `anon` y `authenticated` con `service_id` público y workflow consistente; manager insert/update; admin delete; select por helper.
- `pedidos`: select por `private.can_access_pedido`; insert/update manager; delete admin.
- `pedido_trabajadores`, `pedido_tareas`, `pedido_pagos`, comentarios e historial: acceso interno por pedido, rol y helpers.
- `archivos`: insert público de metadata solo para solicitudes públicas válidas; operaciones internas por acceso al pedido/manager.
- `trabajo_plantillas` y `trabajo_plantilla_tareas`: lectura interna activa/admin; mutación admin.
- `storage.objects`: insert anon solo para rutas válidas de solicitudes públicas en `godel-files`; select/insert/update/delete authenticated según helpers de Storage; sin lectura pública anónima por policy.

### Grants Finales Relevantes

- `anon`: `INSERT` en `public.solicitudes`, `INSERT` en `public.archivos`, `SELECT` en `public.tipos_servicio`; `EXECUTE` en `public.consultar_estado_publico`, `private.can_insert_public_request_storage_object`, `private.can_insert_public_request_file_metadata`.
- `authenticated`: grants de tabla para las tablas públicas operativas según necesidad de PostgREST/RLS; `SELECT` en `perfiles`; update en `perfiles` por columnas permitidas; `EXECUTE` en RPCs de negocio y helpers requeridos.
- `service_role`: `EXECUTE` solo en `public.complete_initial_password_change` dentro del contrato del proyecto; privilegios nativos amplios de Supabase aparecen en catálogos, pero no se usan desde app normal.
- `supabase_auth_admin`: `EXECUTE` técnico mínimo en `private.provision_internal_profile_from_auth_user`.

Advertencia: `information_schema.table_privileges` muestra grants nativos amplios sobre `storage.objects` para `anon`/`authenticated`; deben evaluarse junto con RLS y las policies efectivas. Los grants nativos de la plataforma no deben revocarse indiscriminadamente ni la baseline debe intentar redefinir internamente el schema administrado `storage`. La migración 06 debe verificar bucket privado, policies del proyecto, ausencia de lectura anónima, grants de funciones del proyecto y ausencia de uso general del cliente administrativo. El uso de `service_role` o secret key omite RLS y debe auditarse separadamente.

### Storage

Bucket final:

| Bucket | Público | Limite | MIME types |
| --- | --- | ---: | --- |
| `godel-files` | `false` | `20971520` bytes | PDF, JPEG, PNG, WEBP, DOC, DOCX, ZIP |

Helpers finales de Storage: `storage_path_has_exact_parts`, `storage_order_id`, `storage_order_category`, `storage_request_id`, `is_allowed_public_request_file_type`, `is_allowed_public_request_file`, `can_read_storage_object`, `can_insert_storage_object`, `can_manage_storage_object`, `can_insert_public_request_storage_object`, `can_insert_public_request_file_metadata`, ademas de helpers de metadata de pedido.

## Catálogo Configurable de Servicios

Estado final efectivo:

- Tabla `public.tipos_servicio` con `id`, `name`, `description`, `workflow_type`, `is_publicly_available`, `created_by`, `updated_by`, timestamps.
- No existen columnas `code` ni `sort_order` en el estado efectivo.
- `solicitudes.service_type` debe estar ausente desde 01; no debe existir en base limpia consolidada.
- `solicitudes.service_id` y `pedidos.service_id` deben nacer `not null` y referenciar `tipos_servicio(id) on delete restrict`.
- `workflow_type` permanece materializado en solicitudes/pedidos y se sincroniza por trigger desde `service_id`.
- Debe existir exactamente un servicio de `workflow_type = impresion`, protegido por índice único parcial.
- Nuevos servicios desde UI interna son `encargo`; no hay delete productivo.

DML obligatorio a conservar en migraciones:

- Servicios iniciales productivos: `Impresión` como `impresion` y `Otro` como `encargo`.
- Los dos servicios iniciales se insertan en `01_core_schema.sql`.
- Los dos forman parte del contrato productivo inicial y no pertenecen al seed.
- Sus IDs se generan normalmente con `default gen_random_uuid()`; no hay identificadores fijos para servicios.
- Ninguna capa de aplicación debe depender de IDs concretos de servicios.
- `Impresión` continua identificandose operativamente por `workflow_type = impresion`.
- `Otro` queda como alternativa inicial genérica de encargo.
- `Diseño gráfico`, `Personalización` y `Rotulación` pasan a configuración operativa posterior desde la administración de servicios.

DML local de desarrollo que no debe migrar:

- Filas `QA Publico ...` y `QA Servicio ...` detectadas en la base local actual.
- `supabase/seed.sql` no existe actualmente, aunque `supabase/config.toml` referencia `./seed.sql`; la decisión final es `CREAR_SEED_LOCAL_QA`, con contenido concreto para una fase posterior.

Backfills descartables para base limpia:

- Updates de `solicitudes` y `pedidos` para poblar `service_id`.
- Inserts compensatorios de servicios solo necesarios para datos históricos.
- Cualquier dependencia de UUIDs o filas QA locales.

Distribución final:

- 01: estructura de `tipos_servicio`, FKs `service_id`, constraints, índices, triggers sync, DML canónico.
- 02: RLS/policies/grants finales del catálogo y de `solicitudes_insert_public`.
- 03: RPCs finales con `p_service_id`.
- 06: assertions globales: ausencia de `solicitudes.service_type`, `service_id not null`, servicio único de impresión, grants/policies esperadas.

## Auth Admin User Lifecycle

Estado final efectivo:

- `perfiles` incluye `must_change_password bool not null default false` y `created_by uuid null`.
- `private.current_user_role()` y `private.current_user_is_active()` usan semántica de perfil operativo: `is_active = true` y `must_change_password = false`.
- Auth triggers finales sobre `auth.users`: insert y update de metadata, ambos hacia `private.provision_internal_profile_from_auth_user()`.
- Metadata esperada: `raw_app_meta_data.godel_provisioning` con `version = 1`, `source = "admin_dashboard"`, datos normalizados, rol válido y `created_by` admin operativo.
- Auditoría de creación: `private.internal_user_creation_audit` con estados `pending`, `succeeded`, `failed`, `rate_limited`, `compensation_failed`.
- Auditoría de reset: `private.internal_user_password_reset_audit` con estados `pending`, `succeeded`, `failed`, `rate_limited`, `attention_required`.
- Rate limits de alta: 5 intentos reales por actor en 10 min y 20 globales en 1 h.
- Rate limits de reset: 3 por actor en 10 min, 3 por objetivo en 1 h y 20 globales en 1 h.
- `complete_initial_password_change` final es idempotente, usa `FOR UPDATE`, está reservado a `service_role` y `search_path = ''`.
- Reset administrativo final usa `p_attempt_id` externo, idempotencia de inicio, bloqueo del objetivo, recovery de estado, confirmación por auditoría y `attention_required`.

Distribución final:

- 01: columnas estructurales minimas de `perfiles` (`must_change_password`, `created_by`) y constraints/FKs.
- 02: semántica de perfil operativo, RLS y grants por columnas; ausencia de insert legacy.
- 05: subsistema completo Auth Admin User Lifecycle: triggers Auth, tablas privadas de auditoría, funciones públicas/privadas, grants/revokes técnicos a `supabase_auth_admin` y `service_role` donde corresponda.
- 06: assertions de identidad, grants, ausencia de funciones legacy y búsqueda de exposiciones accidentales.

## DML y Seed

DML obligatorio en migraciones consolidadas:

- Dos servicios iniciales de `tipos_servicio`: `Impresión` y `Otro`.
- Bucket privado `godel-files` y sus límites/MIME.
- Grants/comments/assertions que forman parte del contrato de seguridad.

DML que no debe ir a migraciones:

- Usuarios QA, clientes QA, solicitudes QA, pedidos QA.
- Filas QA detectadas en `tipos_servicio`.
- Credenciales locales.

Estado de seed:

- `supabase/seed.sql` no existe en el árbol actual.
- La ausencia de seed no bloquea la baseline estructural.
- `supabase/config.toml` referencia `./seed.sql`.
- Decisión final: `CREAR_SEED_LOCAL_QA`.
- `seed.sql` se creará durante la fase de implementación/activación y se ejecutará después de las migraciones.
- No contendrá servicios iniciales, servicios operativos adicionales ni creación del bucket.
- Solo contendrá datos locales/QA idempotentes.
- No contendrá credenciales, contraseñas, secretos ni datos reales.
- El bootstrap de usuarios Auth con capacidad de login requiere una estrategia separada.
- No se insertaran directamente usuarios Auth login-capable sin una revisión especifica del contrato local de Auth.

## Comparación con Documentación y Aplicación

Documentación alineada:

- `docs/DATABASE_MODEL.md` refleja `tipos_servicio`, `service_id`, Auth Admin User Lifecycle, auditorías privadas, RPCs finales y `complete_initial_password_change`.
- `docs/USERS_MANAGEMENT_MODEL.md` y README de `src/lib/usuarios` reflejan el flujo productivo Auth Admin, auditoría/rate limits y reset administrativo.
- `docs/PUBLIC_REQUEST_FLOW.md`, `docs/INTERNAL_REQUESTS_FLOW.md`, `docs/ORDERS_FLOW.md` y `src/lib/service-types/README.md` reflejan `service_id` como contrato canónico.
- `src/types/database.types.ts` contiene `service_id`, `tipos_servicio`, `must_change_password`, `created_by` y las RPCs finales.

Contradicciones o correcciones posteriores:

- `docs/PERMISSIONS_MODEL.md` conserva texto histórico de subfase 12.5 donde la app no crea credenciales Auth y la creación de perfiles por UUID Auth existente seguia vigente. Debe actualizarse a Auth Admin User Lifecycle.
- `docs/development/ROADMAP.md` conserva referencias históricas a `service_type` y a la opción legacy de usuarios; no bloquea esta fase pero debe corregirse en fase documental.
- `supabase/seed.sql` falta aunque la configuración lo referencia; está decidido crear seed local QA durante implementación/activación.
- Las salidas de `information_schema` muestran grants nativos de Supabase sobre Storage que pueden parecer excesivos; el documento final debe explicar que el contrato efectivo depende de RLS/policies, que no se redefine internamente `storage` y que 06 verifica el estado de proyecto.

## Grafo Textual de Dependencias

```text
pgcrypto
  -> gen_random_uuid()
  -> tablas publicas y privadas con uuid default

auth.users
  -> public.perfiles.id
  -> trigger on_auth_user_created_provision_internal_profile
  -> trigger on_auth_user_app_metadata_provision_internal_profile
  -> private.provision_internal_profile_from_auth_user()

public.perfiles
  -> perfiles.created_by
  -> pedidos.created_by
  -> pedido_tareas created/updated/completed_by
  -> pedido_trabajadores assigned_profile_id/assigned_by
  -> comentarios e historial actor/author
  -> tipos_servicio created_by/updated_by
  -> private.internal_user_creation_audit
  -> private.internal_user_password_reset_audit
  -> helpers de autorización

public.workflow_type
  -> public.tipos_servicio.workflow_type
  -> public.solicitudes.workflow_type
  -> public.pedidos.workflow_type
  -> private.sync_workflow_type_from_service()

public.tipos_servicio
  -> public.solicitudes.service_id
  -> public.pedidos.service_id
  -> public.crear_pedido_manual()
  -> public.convertir_solicitud_a_pedido()
  -> public.actualizar_datos_pedido()
  -> public.solicitudes_insert_public policy

public.solicitudes
  -> public.pedidos.solicitud_id
  -> public.solicitudes.converted_order_id -> public.pedidos.id
  -> public.archivos.solicitud_id
  -> public.solicitud_comentarios
  -> public.solicitud_historial
  -> public.convertir_solicitud_a_pedido()
  -> Storage ruta solicitudes/{id}/originales

public.pedidos
  -> public.pedido_pagos
  -> public.pedido_trabajadores
  -> public.pedido_tareas
  -> public.archivos.pedido_id
  -> public.pedido_comentarios
  -> public.pedido_historial
  -> private.can_access_pedido()
  -> Storage ruta pedidos/{id}/...

private helpers de autorización
  -> policies RLS publicas
  -> RPCs de negocio
  -> policies storage.objects

storage.buckets godel-files
  -> storage.objects policies
  -> public.archivos.bucket/file_path
  -> helpers privados de rutas
```

Dependencias delicadas detectadas:

- Ciclo logico `solicitudes.converted_order_id -> pedidos.id` y `pedidos.solicitud_id -> solicitudes.id` requiere crear tablas antes de completar una FK o usar `alter table` después de ambas.
- Self-FK `perfiles.created_by` requiere crear `perfiles` antes de agregar esa constraint.
- `perfiles.id -> auth.users.id` depende del schema `auth` de Supabase.
- Triggers Auth dependen de `perfiles`, helpers de autorización y grants técnicos a `supabase_auth_admin`.
- Policies dependen de helpers privados; helpers dependen de `perfiles` y tablas operativas.
- RPCs dependen de tablas, enums, helpers y constraints finales.
- Storage policies dependen de helpers de pedidos/solicitudes y de bucket creado.

## Orden Interno Propuesto por Migración Consolidada

01 Core schema:

1. Extensiones y schema `private`.
2. Enums finales completos.
3. Tablas sin ciclos duros: `perfiles` sin self-FK, `clientes`, `tipos_servicio`, `solicitudes`, `pedido_contadores`, `pedidos` y resto de tablas operativas; las auditorías privadas de Auth Admin se crean integramente en 05.
4. Constraints/FKs después de crear tablas, resolviendo ciclos `solicitudes`/`pedidos` y self-FK `perfiles.created_by`.
5. DML canónico de servicios.
6. Funciones/triggers estructurales: timestamps, numeración, public references, pago, servicio sync, integridad admin, asignaciones activas, historial automático.
7. Indices finales.
8. Comments estructurales mínimos.

02 Security RLS grants:

1. Revoke base de schemas/tablas/tipos.
2. Helpers de autorización con semántica operativa final.
3. Grants de schema/tipos/tablas.
4. Enable RLS en tablas públicas.
5. Policies finales por tabla, incluyendo catálogo y bloqueo por `must_change_password`.
6. Grants EXECUTE a helpers estrictamente requeridos.
7. Grants por columnas en `perfiles`; ausencia de insert legacy.

03 Business RPCs:

1. Revoke/drop de firmas legacy si aplica en activación.
2. RPCs finales de solicitudes.
3. RPCs finales de pedidos, pagos, tareas y plantillas.
4. RPCs de comentarios/historial/tracking público.
5. Grants EXECUTE finales.
6. Comments de contrato.

04 Storage:

1. Bucket privado `godel-files` con límite/MIME.
2. Helpers de rutas y validación.
3. Grants/revokes de Storage de proyecto.
4. Policies `storage.objects`.
5. Assertions de privacidad y límites.

05 Auth Admin User Lifecycle:

1. Tablas privadas de auditoría y constraints/índices.
2. Revoke directo de auditorías.
3. Función `private.provision_internal_profile_from_auth_user()`.
4. Triggers sobre `auth.users`.
5. RPCs de alta: begin/complete.
6. RPC `complete_initial_password_change`.
7. RPCs de reset: begin/get state/complete.
8. Grants técnicos a `supabase_auth_admin`, `authenticated` y `service_role`.
9. Revokes propios del subsistema.
10. Assertions de identidad específicas.

06 Final hardening:

1. Revokes globales finales.
2. Grants finales esperados.
3. Comments de contrato.
4. Assertions: RLS, policies, grants, funciones expuestas, `SECURITY DEFINER`, `search_path`, Storage privado, Auth triggers, ausencia de legacy, `service_id` obligatorio.
5. Detección de funciones o grants accidentales.

## Riesgos Detectados

| Severidad | Riesgo | Evidencia | Acción propuesta |
| --- | --- | --- | --- |
| HIGH - reproducibilidad local y QA | `supabase/seed.sql` no existe aunque `config.toml` referencia `./seed.sql` | `Get-Content supabase/seed.sql` falló por archivo inexistente | `CREAR_SEED_LOCAL_QA` durante implementación/activación; no bloquea baseline estructural; solo datos QA/local idempotentes y sin secretos |
| HIGH | Datos QA presentes en base local, especialmente en `tipos_servicio`, no deben confundirse con DML obligatorio | Consulta local detecto 19 servicios, muchos `QA ...` ocultos | Consolidar solo los dos servicios iniciales productivos; los servicios operativos adicionales se configuran desde la aplicación y los datos QA se moveran a seed si se decide |
| HIGH | `PERMISSIONS_MODEL.md` conserva relato legacy de usuarios que contradice Auth Admin User Lifecycle | Secciones de Fase 12 dicen que la app no crea credenciales y usa UUID Auth existente | Corregir documentación en fase documental posterior |
| MEDIUM | Grants nativos de Storage aparecen amplios para `anon`/`authenticated` en `information_schema` | `storage.objects` muestra grants nativos amplios, pero el acceso efectivo debe evaluarse con RLS/policies | 06 debe verificar bucket privado, policies del proyecto, ausencia de lectura anónima, grants de funciones del proyecto y ausencia de uso general del cliente administrativo; no redefinir internamente `storage` |
| MEDIUM | El CLI de Supabase dentro del sandbox falla sin permisos por telemetría | Error EPERM en `.supabase/telemetry.json` | Ejecutar comandos CLI con aprobación o configurar telemetría local fuera de esta fase |
| MEDIUM | Muchas funciones `SECURITY DEFINER` usan `search_path=public, private`; es válido pero debe seguir auditado | Check detecto 0 definers sin search_path | 06 debe mantener assertion de search_path y revisar public-first caso por caso |
| MEDIUM | Migraciones históricas mezclan estado final, backfills y DML productivo | Bloque de servicios contiene inserts/backfills/updates históricos | Separar DML canónico de backfills descartables |
| LOW | Documentos históricos en `docs/development` contienen referencias a `service_type` y decisiones antiguas | `rg` detecto menciones en roadmap/deuda | Registrar para limpieza documental posterior |

## Criterio de Equivalencia Ajustado

La baseline consolidada será equivalente al estado final esperado si, además de conservar tablas, enums, constraints, índices, triggers, policies, grants, RPCs, Storage y Auth Admin User Lifecycle:

- no existe `private.generate_public_reference()` si continua sin callers;
- `private.generate_public_reference_candidate()` no genera warnings de PL/pgSQL;
- `npx.cmd supabase db lint --level warning --local` devuelve `[]`;
- los dos servicios iniciales tienen nombres y descripciones exactas, IDs generados por `gen_random_uuid()` y ningun UUID literal de servicio;
- el seed no participa en la definición del esquema productivo;
- los servicios iniciales y el bucket se crean por migraciones, no por seed.

## Confirmaciones de Fase

- No se modifico `supabase/migrations/**`.
- No se modifico `supabase/seed.sql`.
- No se modifico `src/types/database.types.ts`.
- No se modifico `src/**`.
- No se ejecuto `supabase db reset`.
- No se ejecuto `supabase db push`.
- No se ejecuto `supabase migration repair`.
- No se ejecuto `supabase link`.
- No se hizo commit ni push.
