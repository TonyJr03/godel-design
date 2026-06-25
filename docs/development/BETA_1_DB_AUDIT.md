# Beta 1.0 - Auditoria de Base de Datos

## 1. Objetivo

Documentar el estado actual de base de datos, Supabase, migraciones, RLS,
grants, RPCs, Storage y contratos TypeScript antes de iniciar la consolidacion
Beta 1.1.

Esta subfase es solo auditoria. No se consolidaron migraciones, no se editaron
migraciones historicas, no se modificaron RPCs, no se tocaron tipos generados y
no se cambio UI.

## 2. Alcance de la auditoria

Se revisaron:

- `supabase/migrations/`.
- Estado efectivo de la base local mediante catalogos PostgreSQL.
- `src/types/database.types.ts`.
- Servicios `src/lib/**/*`.
- Server Actions y route handlers en `src/app`.
- Scripts `scripts/audit-*.mjs`.
- Documentacion funcional y tecnica vigente.

Tambien se revisaron las reglas permanentes del proyecto y la skill local de QA
de migraciones Supabase.

## 3. Migraciones actuales

| Archivo | Proposito | Tipo | Notas importantes |
| --- | --- | --- | --- |
| `20260529090000_01_core_schema.sql` | Crea enums, tablas principales, helpers basicos, triggers `updated_at`, numeracion de pedidos, indices y RLS enabled. | core | Es la base estructural. Incluye `private` schema, `set_updated_at`, `pedido_contadores`, solicitudes, pedidos, archivos, comentarios e historial. |
| `20260529090100_02_rls_policies.sql` | Define helpers privados de permisos, policies RLS y grants iniciales. | seguridad | Es estructural de seguridad, pero contiene grants amplios a `authenticated` y el estado efectivo conserva grants amplios a `anon` por privilegios heredados/no revocados. |
| `20260529090200_03_public_rpcs.sql` | Crea RPCs internas para cambios de estado, conversion de solicitud, creacion de cliente e historial/comentarios. | RPC | Muchas RPCs son `security definer` y luego fueron reemplazadas por parches incrementales. |
| `20260529090300_04_history_triggers.sql` | Crea triggers y funciones privadas de historial automatico. | seguridad / otro | Registra eventos de pedidos, tareas, archivos y solicitudes. Las funciones son `security definer` y sin grants directos de ejecucion. |
| `20260529090400_05_storage_current_state.sql` | Crea/asegura bucket `godel-files`, helpers privados de Storage, grants y policies sobre `storage.objects`. | storage | Bucket privado. Habilita inserts anonimos controlados para archivos de solicitud. Concede helpers privados especificos a `anon`. |
| `20260613090000_06_workflow_type.sql` | Agrega enum `workflow_type`, columnas e indices en solicitudes/pedidos. | parche | Backfill implicito por default `encargo`. |
| `20260613090100_07_preserve_workflow_type_on_conversion.sql` | Reemplaza `convertir_solicitud_a_pedido` para conservar `workflow_type`. | RPC / parche | Mantiene grant solo a `authenticated`. |
| `20260613090200_08_print_orders_advance_without_tasks.sql` | Reemplaza `actualizar_estado_pedido` para que `impresion` avance sin tareas obligatorias. | RPC / parche | Mantiene reglas de tareas para `encargo`. |
| `20260616090000_09_public_reference.sql` | Agrega `public_reference`, funciones privadas de generacion, constraints, triggers y adapta conversion. | tracking / parche | Hereda `public_reference` al convertir solicitud a pedido. Agrega constraints de formato `GD-XXXX-XXXX`. |
| `20260616090100_10_public_tracking_status_rpc.sql` | Crea RPC publica `consultar_estado_publico`. | tracking / RPC | Ejecutable por `anon` y `authenticated`; devuelve DTO publico. |
| `20260616090200_11_remove_order_number_from_public_tracking.sql` | Reemplaza `consultar_estado_publico` para no exponer `order_number`. | tracking / parche | Alineado con regla de no exponer numeracion interna en `/estado`. |
| `20260622090000_12_add_task_template_model.sql` | Crea tablas de plantillas de tareas, triggers, indices, RLS, policies y grants. | core / parche | Modelo nuevo incremental; revoca `anon` explicitamente para estas tablas. |
| `20260622090100_13_apply_task_template_to_pedido.sql` | Crea RPC para aplicar plantilla a pedido. | RPC | `security definer`, grant solo a `authenticated`, valida pedido, flujo, estado y plantilla. |
| `20260622090200_14_pedido_pagos.sql` | Crea enum y tabla `pedido_pagos`, helpers, triggers, backfill, RLS, policies y grants. | pagos | Revoca `anon` explicitamente; backfill de pedidos existentes como total 0 / `pagado`. |
| `20260624090000_15_create_manual_pedido_rpc.sql` | Crea RPC para pedido manual transaccional con pago inicial. | RPC / pagos | Evita insertar pedido y pago por separado desde la app. |
| `20260624090100_16_convert_solicitud_payment_amount.sql` | Reemplaza conversion para incluir `total_amount` y crear `pedido_pagos`. | RPC / pagos | Ajusta contrato de conversion usado por `src/lib/pedidos/create-pedido-from-solicitud.ts`. |
| `20260624090200_17_add_payment_history_action.sql` | Agrega accion `pago_actualizado` al enum de historial de pedido. | pagos / parche | Requisito para registrar cambios de pago. |
| `20260624090300_18_update_pedido_payment_rpc.sql` | Crea RPC `actualizar_pago_pedido`. | RPC / pagos | `security definer`; valida admin/supervisor, montos y registra historial. |
| `20260624090400_19_block_delivery_without_full_payment.sql` | Reemplaza `actualizar_estado_pedido` para bloquear entrega sin pago completo. | RPC / pagos | Exige `pedido_pagos.payment_status = 'pagado'` antes de `entregado`. |

Lectura general: las migraciones 01-05 son el bloque estructural inicial; 06-19
son parches incrementales de flujo, tracking, plantillas y pagos.

## 4. Modelo actual detectado

### 4.1 Enums

- `app_role`: `admin`, `supervisor`, `trabajador`.
- `archivo_visibility`: `cliente_solicitud`, `interno_pedido`, `avance`, `final_entrega`.
- `pedido_estado`: `creado`, `solicitud_recibida`, `en_revision`, `en_produccion`, `listo_entrega`, `entregado`, `cancelado`.
- `pedido_historial_action`: `pedido_creado`, `estado_cambiado`, `trabajador_asignado`, `trabajador_removido`, `archivo_subido`, `nota_agregada`, `fecha_entrega_actualizada`, `pedido_entregado`, `pedido_cancelado`, `tarea_creada`, `tarea_actualizada`, `tarea_eliminada`, `tarea_completada`, `tarea_reabierta`, `tarea_progreso_actualizado`, `pago_actualizado`.
- `pedido_pago_estado`: `sin_pago`, `parcial`, `pagado`.
- `pedido_prioridad`: `baja`, `normal`, `alta`, `urgente`.
- `pedido_tarea_tipo`: `simple`, `cuantificada`.
- `solicitud_estado`: `nueva`, `en_revision`, `contactada`, `aprobada`, `rechazada`, `convertida`.
- `solicitud_historial_action`: `solicitud_creada`, `archivos_adjuntados`, `estado_cambiado`, `cliente_asociado`, `cliente_creado_desde_solicitud`, `convertida_a_pedido`.
- `workflow_type`: `encargo`, `impresion`.

### 4.2 Tablas

- `perfiles`: usuarios internos vinculados a Auth.
- `clientes`: clientes externos sin cuenta.
- `solicitudes`: solicitudes publicas antes de convertirse en pedidos.
- `pedido_contadores`: secuencia anual de `order_number`.
- `pedidos`: trabajos oficiales internos.
- `pedido_trabajadores`: asignaciones de personal a pedidos.
- `pedido_tareas`: tareas operativas de pedidos.
- `archivos`: metadata de archivos de solicitudes y pedidos.
- `pedido_comentarios`: comentarios internos de pedido.
- `pedido_historial`: eventos de pedido.
- `solicitud_comentarios`: comentarios internos de solicitud.
- `solicitud_historial`: eventos de solicitud.
- `trabajo_plantillas`: cabecera de plantillas de tareas.
- `trabajo_plantilla_tareas`: tareas definidas dentro de plantillas.
- `pedido_pagos`: resumen financiero 1:1 por pedido.

Todas las tablas publicas de negocio tienen RLS activo.

### 4.3 Relaciones principales

- `perfiles.id` referencia `auth.users.id`.
- `solicitudes.cliente_id` referencia `clientes.id`.
- `solicitudes.reviewed_by` referencia `perfiles.id`.
- `solicitudes.converted_order_id` referencia `pedidos.id`.
- `pedidos.cliente_id` referencia `clientes.id`.
- `pedidos.solicitud_id` referencia `solicitudes.id`.
- `pedidos.created_by` referencia `perfiles.id`.
- `pedido_trabajadores.pedido_id` referencia `pedidos.id`.
- `pedido_trabajadores.assigned_profile_id` y `assigned_by` referencian `perfiles.id`.
- `pedido_tareas.pedido_id` referencia `pedidos.id`.
- `pedido_tareas.created_by`, `updated_by`, `completed_by` referencian `perfiles.id`.
- `pedido_pagos.pedido_id` referencia `pedidos.id` con `on delete cascade`.
- `pedido_pagos.created_by` y `updated_by` referencian `perfiles.id`.
- `archivos.pedido_id` referencia `pedidos.id`.
- `archivos.solicitud_id` referencia `solicitudes.id`.
- `archivos.uploaded_by` referencia `perfiles.id`.
- Comentarios e historial referencian su entidad padre y el perfil actor/autor.
- `trabajo_plantilla_tareas.template_id` referencia `trabajo_plantillas.id` con cascada.

### 4.4 Constraints relevantes

- `pedidos.order_number` unico y formato `P-YY-XXXX`.
- `pedidos.public_reference` unico y formato `GD-XXXX-XXXX`.
- `solicitudes.public_reference` unico y formato `GD-XXXX-XXXX`.
- `solicitudes.converted_order_id` unico parcial cuando no es `null`.
- `pedidos.solicitud_id` unico parcial cuando no es `null`.
- `pedido_trabajadores` evita duplicados por `pedido_id` + `assigned_profile_id`.
- Checks de texto no vacio en perfiles, clientes, solicitudes, pedidos, comentarios e historial.
- Checks de tareas simples/cuantificadas: cantidades solo cuando aplican, avance no negativo y no mayor al objetivo.
- `archivos_has_context`: cada archivo debe pertenecer a solicitud o pedido.
- `pedido_pagos`: montos no negativos, suma pagada no mayor que total, coherencia de `payment_status` y `paid_at`.
- Plantillas: nombre entre 2 y 120, descripcion max 2000, tareas con titulo no vacio, max 200 y cantidades coherentes.

### 4.5 Indices relevantes

- Listados y filtros: `solicitudes_status_created_at_idx`, `pedidos_status_created_at_idx`, `pedidos_active_created_at_idx`, `pedidos_active_estimated_delivery_date_idx`.
- Tracking: indices unicos de `public_reference` en solicitudes y pedidos.
- Numeracion interna: `pedidos_order_number_key`.
- Relaciones: indices por `cliente_id`, `solicitud_id`, `converted_order_id`, `assigned_profile_id`.
- Tareas: `pedido_tareas_pedido_sort_order_idx`, `pedido_tareas_pedido_created_at_idx`, `pedido_tareas_pedido_completed_idx`.
- Archivos: indices por `pedido_id/visibility/created_at` y `solicitud_id/visibility/created_at`.
- Historial/comentarios: indices por entidad y fecha; `solicitud_historial_action_idx`.
- Plantillas: indices por activo, nombre, fecha y orden de tareas.
- Pagos: `pedido_pagos_payment_status_idx`.

### 4.6 Triggers

`updated_at`:

- `set_perfiles_updated_at`.
- `set_clientes_updated_at`.
- `set_solicitudes_updated_at`.
- `set_pedido_contadores_updated_at`.
- `set_pedidos_updated_at`.
- `set_pedido_tareas_updated_at`.
- `set_trabajo_plantillas_updated_at`.
- `set_trabajo_plantilla_tareas_updated_at`.
- `set_pedido_pagos_updated_at`.

Negocio:

- `set_pedido_order_number` antes de insertar pedidos.
- `set_solicitud_public_reference` antes de insertar solicitudes.
- `set_pedido_public_reference` antes de insertar pedidos.
- `set_pedido_pagos_payment_status` antes de insertar/actualizar pagos.
- `ensure_perfil_admin_integrity` antes de update/delete de perfiles.
- `ensure_active_order_assignment_profile` antes de insert/update de asignaciones.

Historial:

- Pedido creado, trabajador asignado/removido, archivo de pedido subido.
- Tarea creada, actualizada, completada, reabierta, progreso actualizado o eliminada.
- Solicitud creada, archivo adjuntado, estado cambiado, cliente asociado y convertida a pedido.

## 5. Seguridad actual

### 5.1 Helpers privados

Helpers privados principales:

- Perfil y rol: `current_user_role`, `current_user_is_active`, `is_admin`, `is_supervisor`, `is_admin_or_supervisor`.
- Pedidos: `is_assigned_to_pedido`, `can_access_pedido`, `can_manage_pedido_tasks`.
- Solicitudes: `solicitud_has_accessible_pedido`, `can_access_solicitud`.
- Archivos: `pedido_file_visibility_for_status`, `pedido_file_path_matches`, `can_insert_pedido_file_metadata`.
- Storage: `storage_path_has_exact_parts`, `storage_order_id`, `storage_order_category`, `storage_request_id`, `can_read_storage_object`, `can_insert_storage_object`, `can_manage_storage_object`, `can_insert_public_request_storage_object`, `can_insert_public_request_file_metadata`.
- Validacion de archivos publicos: `is_allowed_public_request_file_type`, `is_allowed_public_request_file`.
- Numeracion y tracking: `current_business_date`, `generar_numero_pedido`, `set_pedido_order_number`, `generate_public_reference`, `generate_public_reference_candidate`, `set_solicitud_public_reference`, `set_pedido_public_reference`.
- Pagos: `calculate_pedido_payment_status`, `set_pedido_payment_status`.
- Integridad e historial: `ensure_*`, `insert_*_historial_*`, `solicitud_estado_label`.

### 5.2 RLS por tabla

- `perfiles`: lectura visible segun usuario propio, admin/supervisor y perfiles asignados a pedidos accesibles; insert/update admin.
- `clientes`: lectura segun admin/supervisor o pedidos accesibles; insert/update manager.
- `solicitudes`: insert publico; select interno/accesible; update manager; delete admin.
- `pedidos`: select accesible; insert/update manager; delete admin.
- `pedido_trabajadores`: select accesible; insert/update/delete manager.
- `pedido_tareas`: select por pedido accesible; insert/update/delete por `can_manage_pedido_tasks`.
- `archivos`: select accesible; insert interno validado; insert publico de archivos de solicitud; update/delete manager.
- `pedido_comentarios`: select/insert por pedido accesible.
- `pedido_historial`: select por pedido accesible.
- `solicitud_comentarios`: select/insert admin o supervisor.
- `solicitud_historial`: select admin o supervisor.
- `trabajo_plantillas`: select para internos activos con visibilidad de activas, admin para todas; mutaciones admin.
- `trabajo_plantilla_tareas`: select segun plantilla visible; mutaciones admin.
- `pedido_pagos`: select por acceso al pedido; insert/update/delete admin o supervisor.

### 5.3 Grants por rol

Estado efectivo observado en base local:

- `anon` conserva privilegios SQL amplios (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`) sobre tablas antiguas: `perfiles`, `clientes`, `solicitudes`, `pedidos`, `pedido_trabajadores`, `pedido_tareas`, `archivos`, `pedido_comentarios`, `pedido_historial`.
- `anon` no aparece con grants efectivos sobre `pedido_pagos`, `solicitud_comentarios`, `solicitud_historial`, `trabajo_plantillas` ni `trabajo_plantilla_tareas`.
- `authenticated` conserva privilegios SQL amplios sobre las tablas internas, con RLS como control real.
- `anon` y `authenticated` tienen `USAGE` sobre schemas `public`, `private` y `storage`.
- `anon` tiene `EXECUTE` sobre `public.consultar_estado_publico(text)` y sobre helpers privados de insercion publica de archivos.
- `authenticated` tiene `EXECUTE` sobre las RPCs publicas internas y varios helpers privados.

Riesgo principal: los grants efectivos de `anon` sobre tablas internas contradicen
la regla de minimo privilegio del proyecto. RLS parece limitar la exposicion
funcional, pero Beta 1.1 debe revocar privilegios directos innecesarios y probar
`/solicitud` y `/estado` despues del hardening.

### 5.4 Accesos de anon

Accesos esperados:

- Insertar solicitudes publicas mediante tabla `solicitudes` y policy controlada.
- Insertar objetos y metadata de archivos de solicitud bajo reglas estrictas.
- Ejecutar `consultar_estado_publico(text)`.

Accesos riesgosos detectados:

- Grants SQL amplios efectivos sobre tablas internas antiguas, aunque no hay
policies RLS de lectura/escritura directa que los habiliten funcionalmente.
- `USAGE` de schema `private` para `anon`, necesario hoy para helpers publicos
de Storage, pero conviene aislarlo o minimizarlo durante hardening.

### 5.5 Accesos de authenticated

`authenticated` tiene grants amplios sobre tablas internas y ejecucion sobre RPCs.
La separacion real depende de:

- RLS.
- Helpers privados.
- Validaciones server-side.
- Matriz de permisos de aplicacion.
- RPCs `security definer`.

Esto es funcional para desarrollo, pero la consolidacion debe decidir si se
mantienen grants amplios con RLS o si se endurecen grants tabla por tabla.

### 5.6 Security definer functions

RPCs publicas `security definer`:

- `actualizar_estado_pedido`.
- `actualizar_estado_solicitud`.
- `actualizar_pago_pedido`.
- `aplicar_plantilla_tareas_pedido`.
- `consultar_estado_publico`.
- `convertir_solicitud_a_pedido`.
- `crear_cliente_desde_solicitud`.
- `crear_pedido_manual`.
- `listar_pedido_comentarios`.
- `listar_pedido_historial`.
- `listar_solicitud_comentarios`.
- `listar_solicitud_historial`.

Helpers privados `security definer` relevantes:

- Helpers de rol/acceso: `current_user_role`, `current_user_is_active`, `is_*`, `can_access_*`, `can_manage_pedido_tasks`.
- Helpers de Storage con validaciones de ruta y metadata.
- Generacion de `order_number` y `public_reference`.
- Triggers de historial.
- Triggers de integridad y pago.

Riesgo: el conjunto es amplio y depende de `search_path` y grants correctos. En
consolidacion conviene revisar cada `security definer`, su `search_path`, su
grant final y si valida `auth.uid()` cuando aplica.

## 6. RPCs actuales

| Funcion | Proposito | Rol esperado | Security definer | Riesgos o notas |
| --- | --- | --- | --- | --- |
| `actualizar_estado_pedido(uuid, pedido_estado)` | Cambia estado de pedido con reglas de transicion, tareas, pago e historial. | `authenticated` interno | Si | Critica. Reemplazada varias veces; consolidar solo version final de migracion 19. |
| `actualizar_estado_solicitud(uuid, solicitud_estado)` | Cambia estado manual de solicitud con transiciones validas. | `authenticated` admin/supervisor | Si | No debe permitir `convertida` manual. |
| `convertir_solicitud_a_pedido(uuid, text, text, pedido_prioridad, date, numeric)` | Convierte solicitud aprobada en pedido, crea pago y hereda archivos. | `authenticated` admin/supervisor | Si | Critica y transaccional. La app normaliza titulo/descripcion para `impresion`; DB exige no vacios. |
| `crear_cliente_desde_solicitud(uuid)` | Crea cliente desde solicitud y lo asocia. | `authenticated` admin/supervisor | Si | Debe conservar atomicidad e historial. |
| `listar_pedido_comentarios(uuid)` | Lista comentarios de pedido con autor minimo. | `authenticated` con acceso al pedido | Si | Evita abrir perfiles globalmente. |
| `listar_pedido_historial(uuid)` | Lista historial de pedido con actor minimo. | `authenticated` con acceso al pedido | Si | Debe evitar metadata sensible. |
| `listar_solicitud_comentarios(uuid)` | Lista comentarios de solicitud. | `authenticated` admin/supervisor | Si | Trabajador no debe acceder. |
| `listar_solicitud_historial(uuid)` | Lista historial de solicitud. | `authenticated` admin/supervisor | Si | Trabajador no debe acceder. |
| `consultar_estado_publico(text)` | Consulta publica por `public_reference`. | `anon`, `authenticated` | Si | Debe seguir sin `order_number`, pagos, archivos, cliente, contacto, UUIDs ni personal. |
| `aplicar_plantilla_tareas_pedido(uuid, uuid)` | Copia tareas de plantilla activa a pedido `encargo`. | `authenticated` con gestion de tareas | Si | Bloquea `impresion`; revisar duplicados como deuda funcional aceptada. |
| `crear_pedido_manual(workflow_type, uuid, text, text, pedido_prioridad, date, numeric)` | Crea pedido manual y `pedido_pagos` en una transaccion. | `authenticated` admin/supervisor | Si | Debe conservar validacion de total y cliente opcional. |
| `actualizar_pago_pedido(uuid, numeric, numeric)` | Actualiza pagos acumulados e historial. | `authenticated` admin/supervisor | Si | Critica para bloqueo de entrega; no debe ser ejecutable por trabajador ni anon. |

Funciones usadas por la app:

- `/solicitud`: insercion en `solicitudes`; subidas publicas usan Storage y metadata en `archivos`.
- `/estado`: `consultar_estado_publico`.
- Pedidos: `crear_pedido_manual`, `convertir_solicitud_a_pedido`, `actualizar_estado_pedido`, `actualizar_pago_pedido`, `aplicar_plantilla_tareas_pedido`, RPCs de comentarios e historial.
- Solicitudes internas: `actualizar_estado_solicitud`, `crear_cliente_desde_solicitud`, RPCs de comentarios e historial.

## 7. Storage actual

### 7.1 Bucket

- Bucket: `godel-files`.
- Visibilidad: privado (`public = false`).
- Uso: archivos de solicitudes, pedidos, avances y entregas finales.

### 7.2 Policies

Policies sobre `storage.objects`:

- `godel_files_select_accessible` para `authenticated`.
- `godel_files_insert_accessible` para `authenticated`.
- `godel_files_update_manager` para `authenticated`.
- `godel_files_delete_manager` para `authenticated`.
- `godel_files_insert_public_request_files` para `anon`.

Policy adicional en `archivos`:

- `archivos_insert_public_request_files` para metadata de archivos de solicitud publica.

### 7.3 Acceso publico

No hay lectura publica del bucket. `anon` solo puede insertar objetos bajo rutas
validas de solicitudes y metadata controlada. La consulta publica `/estado` no
usa Storage ni devuelve archivos.

### 7.4 Riesgos detectados

- `anon` tiene grants efectivos amplios sobre `archivos`, aunque RLS restringe
la operacion funcional a la policy de insercion publica.
- Los helpers publicos de Storage requieren `USAGE` de `private` para `anon`.
Debe revisarse si puede aislarse en una superficie menor.
- Se mantiene la deuda documentada de objetos huerfanos si falla la metadata
despues de subir el objeto.
- La concurrencia en cupo de objetos publicos queda mitigada en metadata, pero
requiere rate limiting/monitoreo antes de produccion.

## 8. Flujos criticos dependientes de DB

### 8.1 Solicitud publica

Usa insercion server-side en `solicitudes` con `public_reference` generado por
la app y reforzado por trigger/constraint. Archivos opcionales/obligatorios
segun flujo se suben al bucket privado y registran metadata en `archivos`.
Riesgo a vigilar: no romper el insert anonimo necesario al revocar grants.

### 8.2 Consulta publica de estado

Usa `consultar_estado_publico(text)`. La version final no expone
`order_number`, pagos, cliente, contacto, archivos, tareas nominales, historial,
comentarios ni UUIDs internos.

### 8.3 Conversion solicitud a pedido

Usa `convertir_solicitud_a_pedido`. Bloquea solicitud, exige aprobada y cliente,
copia `workflow_type` y `public_reference`, crea pedido, crea `pedido_pagos`,
actualiza solicitud y hereda archivos por metadata.

Punto a decidir: para `impresion`, la app hace fallback de titulo/descripcion,
pero la RPC conserva contrato de no aceptar vacios.

### 8.4 Pedido manual

Usa `crear_pedido_manual`. Crea pedido y resumen financiero en una sola
transaccion. Permite `cliente_id = null`, genera `order_number` y
`public_reference`.

### 8.5 Encargo con tareas

`workflow_type = encargo` exige tareas para avanzar a produccion y tareas
completas para `listo_entrega`. Tareas e historial se protegen por RLS y
triggers.

### 8.6 Impresion sin tareas

`workflow_type = impresion` puede avanzar de revision a produccion y listo sin
tareas obligatorias. No puede saltar directo a entregado.

### 8.7 Pagos y bloqueo de entrega

`pedido_pagos` calcula `payment_status` por trigger. `actualizar_estado_pedido`
exige `payment_status = pagado` para entregar. `/estado` no expone pagos.

### 8.8 Archivos privados

Metadata en `archivos`; objetos en `godel-files`. Descargas internas usan URL
firmada despues de validar con RLS. La UI no debe recibir `file_path`; los route
handlers internos lo usan server-side.

### 8.9 Comentarios e historial

Comentarios son append-only desde la app. Historial se escribe por triggers y
RPCs controladas. Insercion directa de historial desde roles de app no aparece
como flujo esperado.

## 9. Inconsistencias detectadas

- La documentacion y las migraciones pretenden evitar acceso anonimo directo a
tablas internas, pero el estado efectivo conserva grants amplios de `anon` sobre
varias tablas publicas antiguas. RLS reduce el riesgo funcional, pero el grant
contradice minimo privilegio.
- La migracion 02 concede a `authenticated` privilegios amplios sobre muchas
tablas; la seguridad real depende de RLS y helpers. Esto esta alineado con el
funcionamiento actual, pero debe revisarse en hardening.
- `src/types/database.types.ts` contiene tablas, enums y RPCs recientes
(`pedido_pagos`, plantillas, `workflow_type`, `public_reference`, pagos y
tracking). No se detecto desalineacion evidente en tipos generados.
- La documentacion de deuda ya registra el riesgo de grants `anon`; esta
auditoria lo confirma con introspeccion local.
- El contrato de `convertir_solicitud_a_pedido` para `impresion` depende de
normalizacion previa en TypeScript para titulo/descripcion, aunque DB valida no
vacio. Esto esta documentado como decision pendiente.

## 10. Riesgos para la consolidacion

1. Consolidar solo el SQL "limpio" sin replicar el estado final efectivo podria
romper `/solicitud`, `/estado`, Storage o pagos.
2. Mantener grants amplios de `anon` perpetua un riesgo de seguridad aunque RLS
bloquee la mayoria de operaciones.
3. Revocar `anon` sin pruebas puede romper creacion publica de solicitudes o
subidas publicas.
4. Revocar `USAGE` sobre `private` a `anon` puede romper helpers de Storage si
no se redisena la superficie publica.
5. Las RPCs reemplazadas varias veces deben consolidarse en su version final,
no en versiones intermedias.
6. `security definer` requiere `search_path` consistente y grants minimos.
7. La relacion circular conceptual solicitud/pedido por `converted_order_id` y
`solicitud_id` exige orden cuidadoso de constraints.
8. Storage depende de extensiones/tablas de Supabase (`storage.buckets`,
`storage.objects`) y de columnas esperadas; el reset debe aplicarse en entorno
Supabase real.
9. Los triggers de historial dependen de enums completos. Agregar actions tarde
puede romper funciones si se ordena mal.
10. Pagos dependen de enum, tabla, backfill, trigger y RPCs. El orden debe
preservar `pedido_pagos` antes de RPCs que lo consultan.
11. `public_reference` debe existir y estar backfilled antes de constraints
`not null`, unique y RPC publica.
12. Las policies de trabajadores dependen de `pedido_trabajadores` y helpers
privados; mover helpers de orden puede romper RLS.

## 11. Propuesta inicial de mapeo hacia migraciones consolidadas

| Elemento actual | Migracion actual de origen | Migracion consolidada destino | Notas |
| --- | --- | --- | --- |
| Schemas, extensiones, enums base | 01, 06, 14, 17 | `01_core_schema.sql` | Crear enums finales de una vez. |
| Tablas de negocio base | 01, 12, 14 | `01_core_schema.sql` | Incluir plantillas y pagos como parte del modelo final. |
| Columnas `workflow_type` | 06 | `01_core_schema.sql` | Crear columnas finales sin parche. |
| Columnas `public_reference` | 09 | `01_core_schema.sql` | Crear como columnas finales con constraints. |
| Constraints e indices estructurales | 01, 06, 09, 12, 14 | `01_core_schema.sql` | Evitar backfills innecesarios en reset limpio. |
| Helpers de permisos y RLS | 02, 05, 12, 14 | `02_security_rls_grants.sql` | Incluir revokes finales de `anon` y grants minimos. |
| Policies de tablas publicas | 02, 05, 12, 14 | `02_security_rls_grants.sql` | Separar policies de Storage si se prefiere en 04. |
| RPCs internas finales | 03, 07, 08, 09, 13, 15, 16, 18, 19 | `03_business_rpcs.sql` | Solo versiones finales de cada RPC. |
| RPC publica tracking final | 10, 11 | `03_business_rpcs.sql` | Mantener grant a `anon` y DTO publico minimo. |
| Bucket `godel-files` | 05 | `04_storage.sql` | Crear/asegurar bucket privado. |
| Helpers y policies Storage | 05 | `04_storage.sql` | Revisar necesidad de helpers ejecutables por `anon`. |
| Triggers de historial | 04 | `05_final_hardening.sql` | Pueden ir al final despues de tablas/enums/RPCs. |
| Triggers de `updated_at`, order number, public reference, payment status | 01, 09, 12, 14 | `01_core_schema.sql` o `05_final_hardening.sql` | Decidir si mantener junto a tablas o hardening final. |
| Grants finales y revokes extra | 02, 05, 12, 14 + hallazgos Beta 1.0 | `05_final_hardening.sql` | Debe corregir grants amplios efectivos de `anon`. |
| Comentarios SQL | Varias | `05_final_hardening.sql` | Utiles para mantenimiento, no deben ocultar orden de dependencias. |

## 12. Checklist recomendada para Beta 1.1

- Decidir politica final de grants: minimo privilegio por tabla/RPC o grants
amplios con RLS. Recomendacion: revocar `anon` en tablas internas.
- Definir lista exacta de privilegios que `anon` necesita para `/solicitud` y
Storage publico.
- Decidir si `anon` debe conservar `USAGE` sobre `private` o si se mueven
helpers publicos a otra superficie controlada.
- Confirmar version final de cada RPC reemplazada por parches.
- Revisar todos los `security definer`: `search_path`, validacion de
`auth.uid()`, permisos internos y grants.
- Probar `/solicitud` con y sin archivos despues de revokes.
- Probar `/estado` con solicitud, pedido, solicitud convertida, referencia
invalida y referencia inexistente.
- Probar que pagos no son visibles para `anon`.
- Probar que `file_path` no sale de server-side.
- Probar que trabajador solo ve pedidos asignados, archivos, comentarios e
historial permitidos.
- Probar conversion de solicitud a pedido para `encargo` e `impresion`,
incluido contrato de titulo/descripcion.
- Probar entrega bloqueada con pago `sin_pago` y `parcial`, y permitida con
`pagado`.
- Validar `supabase db reset` desde cero despues de crear migraciones
consolidadas.
- Regenerar y comparar `src/types/database.types.ts` cuando exista el set
consolidado.
- Ejecutar auditorias `npm run audit:*` y SQL de grants/RLS antes de cerrar.
