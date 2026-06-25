# Beta 1.1 - Plan de Consolidacion de Migraciones

## 1. Objetivo

Esta subfase define el plan exacto para consolidar las 19 migraciones actuales
en un set limpio de 5 migraciones nuevas, sin ejecutar todavia la
consolidacion.

El resultado esperado es una guia revisable y ejecutable para Beta 1.2-Beta
1.9. No se eliminan migraciones, no se reemplaza SQL historico, no se modifican
RPCs, RLS, Storage, app code ni tipos generados.

## 2. Estado de partida

El estado actual detectado en Beta 1.0 parte de 19 migraciones:

- Las migraciones `20260529090000_01_core_schema.sql` a
  `20260529090400_05_storage_current_state.sql` forman el bloque inicial:
  schema, helpers, RLS, RPCs, historial y Storage.
- Las migraciones `20260613090000_06_workflow_type.sql` a
  `20260624090400_19_block_delivery_without_full_payment.sql` son parches
  incrementales de workflow, tracking publico, plantillas de tareas y pagos.
- El modelo final efectivo incluye `workflow_type`, `public_reference`,
  plantillas de tareas, `pedido_pagos`, tracking publico y bloqueo de entrega
  sin pago completo.

Riesgos principales detectados en Beta 1.0:

- `anon` conserva grants SQL efectivos amplios sobre varias tablas internas
  antiguas, aunque RLS limita la exposicion funcional.
- Hay varias RPCs `security definer` criticas que deben consolidarse solo en su
  version final y con grants minimos.
- `/solicitud` depende de permisos publicos controlados para insertar solicitud
  y, cuando aplica, archivos.
- `/estado` depende de `public.consultar_estado_publico(text)` con DTO publico
  minimo.
- `godel-files` debe seguir siendo un bucket privado.
- `convertir_solicitud_a_pedido` requiere una decision de contrato para
  `workflow_type = impresion`: hoy la app normaliza titulo/descripcion y la RPC
  valida valores no vacios.

## 3. Decision de consolidacion

El nuevo set consolidado sera:

| Orden | Archivo consolidado | Responsabilidad |
| --- | --- | --- |
| 01 | `01_core_schema.sql` | Schema, enums, tablas, constraints, indices, triggers estructurales e historial |
| 02 | `02_security_rls_grants.sql` | Helpers privados de seguridad, RLS, policies y grants base |
| 03 | `03_business_rpcs.sql` | RPCs transaccionales finales y RPC publica de tracking |
| 04 | `04_storage.sql` | Bucket privado, helpers y policies de Storage |
| 05 | `05_final_hardening.sql` | Revokes finales, grants finales, comments y checks defensivos |

Decision corregida para historial:

- Tablas, funciones y triggers de historial van en `01_core_schema.sql`.
- Policies y grants sobre historial van en `02_security_rls_grants.sql`.
- Revokes finales o comentarios finales sobre historial pueden ir en
  `05_final_hardening.sql`.

El historial es comportamiento estructural del modelo, no hardening final.

## 4. Reglas generales de consolidacion

- No conservar versiones intermedias de RPCs.
- Crear enums ya en su estado final.
- Crear tablas ya con sus columnas finales.
- Evitar backfills incrementales innecesarios porque la base consolidada se
  reconstruira desde cero.
- Mantener RLS activo en tablas sensibles.
- No abrir acceso anonimo directo a tablas internas.
- Mantener `/solicitud` funcionando con permisos publicos estrictamente
  necesarios.
- Mantener `/estado` funcionando solo mediante RPC publica controlada.
- Mantener Storage privado.
- No exponer `file_path`.
- No exponer pagos en tracking publico.
- No usar `service_role`.
- No agregar `SUPABASE_SERVICE_ROLE_KEY`.
- No consultar `auth.users` desde app code.
- Conceder `execute` de RPCs solo a los roles requeridos.
- Mantener los helpers privados como superficie interna siempre que sea posible.
- Documentar de forma explicita cualquier helper privado que deba seguir siendo
  ejecutable por `anon`.
- Mantener el orden de dependencias: enums, tablas, funciones base, triggers,
  policies, RPCs, Storage y hardening final.

## 5. Diseno de `01_core_schema.sql`

`01_core_schema.sql` debe contener el modelo estructural final completo.

Debe incluir:

- Extensiones necesarias, por ejemplo `pgcrypto` si se mantiene como requisito
  para UUIDs o generacion de referencias.
- Schema `private`.
- Funcion comun `public.set_updated_at()`.
- Enums finales:
  - `app_role`.
  - `workflow_type`.
  - `solicitud_estado`.
  - `pedido_estado`.
  - `pedido_pago_estado`.
  - `pedido_prioridad`.
  - `pedido_tarea_tipo`.
  - `archivo_visibility`.
  - `pedido_historial_action`, incluyendo `pago_actualizado` desde el inicio.
  - `solicitud_historial_action`.
- Tablas finales:
  - `perfiles`.
  - `clientes`.
  - `solicitudes`.
  - `pedido_contadores`.
  - `pedidos`.
  - `pedido_trabajadores`.
  - `pedido_tareas`.
  - `archivos`.
  - `pedido_comentarios`.
  - `pedido_historial`.
  - `solicitud_comentarios`.
  - `solicitud_historial`.
  - `trabajo_plantillas`.
  - `trabajo_plantilla_tareas`.
  - `pedido_pagos`.
- Columnas finales de cada tabla, incluyendo:
  - `solicitudes.workflow_type`.
  - `solicitudes.public_reference`.
  - `pedidos.workflow_type`.
  - `pedidos.public_reference`.
  - todas las columnas finales de `pedido_pagos`.
  - todas las columnas finales de plantillas de tareas.
- Constraints:
  - checks de textos obligatorios.
  - checks de formato de `order_number`.
  - checks de formato de `public_reference`.
  - uniques de `order_number` y `public_reference`.
  - uniques parciales para conversion solicitud/pedido.
  - checks de tareas simples y cuantificadas.
  - checks de metadata de historial como objeto JSON.
  - checks de montos y estado de pago en `pedido_pagos`.
  - checks de plantillas y tareas de plantilla.
- Foreign keys:
  - `perfiles.id` hacia `auth.users.id`.
  - relaciones solicitudes/clientes/pedidos.
  - relaciones de asignaciones, tareas, archivos, comentarios, historial,
    plantillas y pagos.
- Indices finales:
  - indices de listados por estado/fecha.
  - indices de relaciones frecuentes.
  - indices de tareas por pedido/orden/progreso.
  - indices de archivos por entidad, visibilidad y fecha.
  - indices de historial y comentarios.
  - indices de workflow.
  - indices de plantillas.
  - indice de `pedido_pagos.payment_status`.
- Triggers `updated_at`:
  - perfiles, clientes, solicitudes, pedido_contadores, pedidos,
    pedido_tareas, trabajo_plantillas, trabajo_plantilla_tareas y
    pedido_pagos.
- Generacion de `order_number`:
  - `private.current_business_date()`.
  - `private.generar_numero_pedido()`.
  - `private.set_pedido_order_number()`.
  - trigger `set_pedido_order_number`.
- Generacion de `public_reference`:
  - `private.generate_public_reference()`.
  - `private.generate_public_reference_candidate()`.
  - `private.set_solicitud_public_reference()`.
  - `private.set_pedido_public_reference()`.
  - triggers `set_solicitud_public_reference` y
    `set_pedido_public_reference`.
- Calculo de `pedido_pagos.payment_status`:
  - `private.calculate_pedido_payment_status()`.
  - `private.set_pedido_payment_status()`.
  - trigger `set_pedido_pagos_payment_status`.
- Historial estructural:
  - tablas `pedido_historial` y `solicitud_historial`.
  - funciones privadas `insert_pedido_historial_*`.
  - funciones privadas `insert_solicitud_historial_*`.
  - funcion auxiliar `private.solicitud_estado_label()`.
  - triggers de historial de pedido y solicitud.
- Integridad basica si aplica:
  - `private.ensure_perfil_admin_integrity()`.
  - `private.ensure_active_order_assignment_profile()`.
  - triggers asociados.

Aclaraciones obligatorias:

- `workflow_type` debe nacer como parte del schema final, no como alter
  incremental.
- `public_reference` debe nacer como parte del schema final, no como backfill.
- `pedido_pagos` debe nacer como parte del schema final, no como parche de
  pagos.
- Plantillas de tareas deben nacer como parte del schema final.
- No debe haber backfills propios de migraciones incrementales, por ejemplo
  backfills de `workflow_type`, `public_reference` o `pedido_pagos` para datos
  historicos.
- Los triggers de historial deben ir aqui, no en `05_final_hardening.sql`.

## 6. Diseno de `02_security_rls_grants.sql`

`02_security_rls_grants.sql` debe contener seguridad base de tablas y helpers de
autorizacion.

Debe incluir:

- Revokes iniciales defensivos sobre schema `private` y sobre tablas internas.
- Helpers privados de rol:
  - `private.current_user_role()`.
  - `private.current_user_is_active()`.
  - `private.is_admin()`.
  - `private.is_supervisor()`.
  - `private.is_admin_or_supervisor()`.
- Helpers privados de acceso a pedidos:
  - `private.is_assigned_to_pedido(uuid)`.
  - `private.can_access_pedido(uuid)`.
- Helpers privados de acceso a solicitudes:
  - `private.solicitud_has_accessible_pedido(uuid)`.
  - `private.can_access_solicitud(uuid)`.
- Helpers de permisos de tareas:
  - `private.can_manage_pedido_tasks(uuid)`.
- Helpers de metadata de archivos de pedido si se mantienen en seguridad base:
  - `private.pedido_file_visibility_for_status(pedido_estado)`.
  - `private.pedido_file_path_matches(text, uuid, archivo_visibility)`.
  - `private.can_insert_pedido_file_metadata(...)`.
- RLS enabled en todas las tablas publicas sensibles.
- Policies finales por tabla:
  - `perfiles`: lectura visible e insert/update admin.
  - `clientes`: lectura accesible e insert/update manager.
  - `solicitudes`: insert publico, select interno/accesible, update manager,
    delete admin.
  - `pedidos`: select accesible, insert/update manager, delete admin.
  - `pedido_trabajadores`: select accesible, insert/update/delete manager.
  - `pedido_tareas`: select accesible y mutaciones con
    `can_manage_pedido_tasks`.
  - `archivos`: select accesible, insert interno validado, update/delete
    manager.
  - `pedido_comentarios`: select/insert accesible.
  - `pedido_historial`: select accesible.
  - `solicitud_comentarios`: select/insert admin o supervisor.
  - `solicitud_historial`: select admin o supervisor.
  - `trabajo_plantillas`: lectura de activas para internos activos y todas
    para admin; mutaciones admin.
  - `trabajo_plantilla_tareas`: lectura segun plantilla visible; mutaciones
    admin.
  - `pedido_pagos`: lectura por acceso al pedido; mutaciones admin o
    supervisor.
- Grants minimos a `anon`.
- Grants minimos a `authenticated`.

Decision obligatoria:

```txt
anon no debe tener grants SQL amplios sobre tablas internas.
```

`anon` debe conservar exactamente lo necesario para:

- Insertar solicitud publica si el flujo actual lo requiere.
- Insertar metadata de archivos publicos en `archivos` solo bajo policy
  estricta.
- Ejecutar `public.consultar_estado_publico(text)`.
- Insertar objetos en Storage bajo policy estricta, definido en `04_storage.sql`.

`anon` no debe poder:

- Hacer `select` en `pedidos`.
- Hacer `select` en `solicitudes`.
- Hacer `select` en `clientes`.
- Hacer `select` en `perfiles`.
- Hacer `select` en `archivos`.
- Hacer `select` en `pedido_pagos`.
- Ejecutar RPCs internas.
- Leer Storage.
- Actualizar o borrar tablas internas.

Notas sobre `authenticated`:

- Debe tener grants suficientes para que RLS y servicios internos funcionen.
- La politica final de grants de `authenticated` queda como decision pendiente:
  mantener grants amplios protegidos por RLS o reducirlos tabla por tabla.
- En ambos casos, RLS debe seguir siendo la defensa final.

## 7. Diseno de `03_business_rpcs.sql`

`03_business_rpcs.sql` debe contener solo las versiones finales de las RPCs.

| RPC final | Proposito | Roles autorizados | Security definer | Validaciones internas obligatorias | Grants finales | Riesgos |
| --- | --- | --- | --- | --- | --- | --- |
| `actualizar_estado_pedido(uuid, pedido_estado)` | Cambiar estado de pedido con reglas operativas, tareas, pago e historial. | `authenticated` con perfil activo y permiso efectivo `pedidos.change_status`; trabajador solo asignados. | Si | `auth.uid()`, perfil activo, acceso al pedido, transiciones validas, bloqueo `FOR UPDATE`, tareas para `encargo`, pago completo para `entregado`, fecha real al entregar. | Revoke `public`/`anon`; grant execute a `authenticated`. | Critica; consolidar version final de migracion 19. |
| `actualizar_estado_solicitud(uuid, solicitud_estado)` | Cambiar estado manual de solicitud. | `authenticated` admin/supervisor. | Si | `auth.uid()`, perfil activo, rol, solicitud existente, transiciones validas, no permitir `convertida` manual. | Revoke `public`/`anon`; grant execute a `authenticated`. | No debe permitir cerrar estados de forma inconsistente. |
| `actualizar_pago_pedido(uuid, numeric, numeric)` | Actualizar pagos acumulados y registrar historial. | `authenticated` admin/supervisor. | Si | `auth.uid()`, perfil activo, rol, pedido existente, resumen financiero existente, montos no negativos, maximo 2 decimales, suma no mayor que total. | Revoke `public`/`anon`; grant execute a `authenticated`. | Pagos no deben quedar disponibles para trabajador ni anon. |
| `aplicar_plantilla_tareas_pedido(uuid, uuid)` | Copiar tareas de plantilla activa a pedido `encargo`. | `authenticated` que puede gestionar tareas del pedido. | Si | `auth.uid()`, perfil activo, `can_manage_pedido_tasks`, pedido `encargo`, estado editable, plantilla activa, tareas existentes, orden final estable. | Revoke `public`/`anon`; grant execute a `authenticated`. | Permite duplicados por decision vigente; debe ser consciente. |
| `consultar_estado_publico(text)` | Devolver estado publico por `public_reference`. | `anon` y `authenticated`. | Si | Normalizar/validar referencia, buscar solicitud/pedido, preferir pedido si solicitud fue convertida, devolver DTO minimo. | Revoke all y grant execute a `anon`, `authenticated`. | No debe exponer `order_number`, pagos, cliente, contacto, archivos, historial, comentarios, personal ni UUIDs. |
| `convertir_solicitud_a_pedido(uuid, text, text, pedido_prioridad, date, numeric)` | Convertir solicitud aprobada en pedido con pago y herencia de archivos. | `authenticated` admin/supervisor. | Si | `auth.uid()`, perfil activo, rol, solicitud aprobada, cliente asociado, no convertida, bloqueo `FOR UPDATE`, prioridad valida, fecha no pasada, total valido, crear pedido, pago, actualizar solicitud y asociar archivos atomicamente. | Revoke `public`/`anon`; grant execute a `authenticated`. | Requiere refuerzo DB para `impresion`; ver decision abajo. |
| `crear_cliente_desde_solicitud(uuid)` | Crear cliente desde datos de solicitud y asociarlo. | `authenticated` admin/supervisor. | Si | `auth.uid()`, perfil activo, rol, solicitud existente, sin cliente previo o regla definida, datos validos, historial. | Revoke `public`/`anon`; grant execute a `authenticated`. | Debe evitar clientes duplicados no deseados segun contrato vigente. |
| `crear_pedido_manual(workflow_type, uuid, text, text, pedido_prioridad, date, numeric)` | Crear pedido manual y resumen financiero en una transaccion. | `authenticated` admin/supervisor. | Si | `auth.uid()`, perfil activo, rol, workflow valido, cliente opcional existente si se informa, titulo/descripcion validos, prioridad, fecha, total, crear `pedido_pagos`. | Revoke `public`/`anon`; grant execute a `authenticated`. | No debe aceptar `order_number`, `public_reference`, status ni campos tecnicos desde UI. |
| `listar_pedido_comentarios(uuid)` | Listar comentarios internos de pedido con autor minimo. | `authenticated` con acceso al pedido. | Si | `auth.uid()`, perfil activo, `can_access_pedido`, DTO minimo de autor. | Revoke `public`/`anon`; grant execute a `authenticated`. | No abrir lectura global de perfiles. |
| `listar_pedido_historial(uuid)` | Listar historial interno de pedido con actor minimo. | `authenticated` con acceso al pedido. | Si | `auth.uid()`, perfil activo, `can_access_pedido`, metadata segura. | Revoke `public`/`anon`; grant execute a `authenticated`. | No exponer metadata sensible ni actores fuera de alcance. |
| `listar_solicitud_comentarios(uuid)` | Listar comentarios internos de solicitud. | `authenticated` admin/supervisor. | Si | `auth.uid()`, perfil activo, rol, solicitud accesible. | Revoke `public`/`anon`; grant execute a `authenticated`. | Trabajador no debe acceder. |
| `listar_solicitud_historial(uuid)` | Listar historial interno de solicitud. | `authenticated` admin/supervisor. | Si | `auth.uid()`, perfil activo, rol, solicitud accesible, actor minimo. | Revoke `public`/`anon`; grant execute a `authenticated`. | Trabajador no debe acceder. |

Decision obligatoria para `convertir_solicitud_a_pedido`:

- Para `workflow_type = impresion`, la RPC final debe reforzar el contrato en
  base de datos:
  - si `p_title` viene vacio, usar fallback seguro `Pedido de impresion`;
  - si `p_description` viene vacio, usar la descripcion de la solicitud;
  - seguir validando limites de longitud despues del fallback.
- Para `workflow_type = encargo`, mantener validacion estricta de titulo y
  descripcion no vacios.
- Esta decision se planifica aqui; no se implementa todavia en Beta 1.1.

## 8. Diseno de `04_storage.sql`

`04_storage.sql` debe contener todo lo relacionado con Supabase Storage.

Debe incluir:

- Verificaciones defensivas de existencia de `storage.buckets` y
  `storage.objects` si se mantiene el patron actual.
- Bucket `godel-files`.
- `public = false` siempre.
- Configuracion final de limites nativos del bucket si aplica.
- Helpers de Storage:
  - `private.storage_path_has_exact_parts(text, integer)`.
  - `private.storage_order_id(text)`.
  - `private.storage_order_category(text)`.
  - `private.storage_request_id(text)`.
  - `private.is_allowed_public_request_file_type(text, text)`.
  - `private.is_allowed_public_request_file(text, bigint, text)`.
  - `private.can_read_storage_object(text, text)`.
  - `private.can_insert_storage_object(text, text)`.
  - `private.can_manage_storage_object(text, text)`.
  - `private.can_insert_public_request_storage_object(text, text, jsonb)`.
  - `private.can_insert_public_request_file_metadata(...)` si se decide dejarlo
    con Storage en vez de seguridad base.
- Policies de `storage.objects`:
  - lectura autenticada y autorizada.
  - insercion interna autenticada y autorizada.
  - update manager.
  - delete manager.
  - insercion publica controlada para archivos de solicitud.
- Relacion con tabla `archivos`:
  - `archivos.bucket = 'godel-files'`.
  - `archivos.file_path` debe coincidir con ruta y entidad.
  - metadata publica solo para `visibility = cliente_solicitud`, `pedido_id`
    null, `uploaded_by` null y objeto existente.
- Limites de tipo/tamano si estan implementados en DB:
  - extensiones/MIME permitidos: PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX, ZIP.
  - maximo 20 MB por archivo.
  - maximo 5 archivos por solicitud en metadata; conteo de objetos como defensa
    adicional.
- Riesgos documentados:
  - objetos huerfanos si Storage sube y falla metadata.
  - Storage y DB no son transaccionales entre si.
  - concurrencia de subidas publicas puede requerir rate limiting y monitoreo.

Decision a documentar para fases posteriores:

- Evaluar si `anon` debe conservar `USAGE` sobre schema `private` para helpers
  de Storage o si conviene reducir esa superficie.
- No implementar esa reduccion en Beta 1.1. Dejarla como decision tecnica para
  Beta 1.3/Beta 1.5, porque puede afectar `/solicitud` con archivos.

## 9. Diseno de `05_final_hardening.sql`

`05_final_hardening.sql` debe cerrar permisos y dejar el estado final auditable.
No debe crear logica de negocio principal.

Debe incluir:

- Revokes finales defensivos sobre tablas internas.
- Grants finales explicitos para `anon`.
- Grants finales explicitos para `authenticated`.
- Revokes finales de RPCs internas a `public` y `anon`.
- Grants finales de RPCs internas solo a `authenticated`.
- Grant final de `consultar_estado_publico(text)` a `anon` y
  `authenticated`.
- Revokes finales de funciones privadas no necesarias para roles de app.
- Comments SQL de funciones criticas:
  - RPCs transaccionales.
  - tracking publico.
  - helpers de Storage publicos.
  - helpers de permisos.
  - funciones/triggers de historial.
- Checks SQL recomendados para verificar:
  - `anon` no tiene grants amplios sobre tablas internas.
  - `anon` no puede ejecutar RPCs internas.
  - `anon` no puede leer `storage.objects`.
  - `anon` solo puede ejecutar `consultar_estado_publico(text)` entre RPCs
    publicas.
  - `pedido_pagos` no tiene acceso anonimo.
  - `file_path` no se expone por RPC publica de tracking.

Ejemplos de checks planificados:

```sql
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon'
  and table_schema = 'public'
order by table_name, privilege_type;
```

```sql
select routine_schema, routine_name, privilege_type
from information_schema.routine_privileges
where grantee = 'anon'
  and routine_schema in ('public', 'private')
order by routine_schema, routine_name;
```

```sql
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;
```

## 10. Mapeo exacto desde migraciones actuales hacia migraciones consolidadas

| Migracion actual | Elementos que aporta | Destino consolidado | Accion |
| ---------------- | -------------------- | ------------------- | ------ |
| `20260529090000_01_core_schema.sql` | Extensiones, schema `private`, enums base, tablas base, constraints, FKs, indices, RLS enabled, `updated_at`, numeracion de pedido, tablas de comentarios e historial. | `01_core_schema.sql` | fusionar |
| `20260529090100_02_rls_policies.sql` | Helpers privados de rol/acceso, RLS policies, grants iniciales, triggers de integridad de perfiles/asignaciones. | `02_security_rls_grants.sql` y `01_core_schema.sql` para triggers/funciones de integridad estructural | fusionar / revisar manualmente |
| `20260529090200_03_public_rpcs.sql` | Version inicial de RPCs de estado, conversion, cliente, comentarios e historial. | `03_business_rpcs.sql` | descartar version intermedia para RPCs reemplazadas; conservar RPCs no reemplazadas |
| `20260529090300_04_history_triggers.sql` | Funciones privadas y triggers de historial automatico de pedidos, tareas, archivos y solicitudes. | `01_core_schema.sql` | mover |
| `20260529090400_05_storage_current_state.sql` | Bucket `godel-files`, helpers de Storage, grants de Storage, policies `storage.objects`, policy publica de metadata en `archivos`. | `04_storage.sql` y parte de grants finales en `05_final_hardening.sql` | fusionar / revisar manualmente |
| `20260613090000_06_workflow_type.sql` | Enum `workflow_type`, columnas en solicitudes/pedidos e indices. | `01_core_schema.sql` | fusionar |
| `20260613090100_07_preserve_workflow_type_on_conversion.sql` | Version de `convertir_solicitud_a_pedido` que conserva `workflow_type`. | `03_business_rpcs.sql` | descartar version intermedia |
| `20260613090200_08_print_orders_advance_without_tasks.sql` | Version de `actualizar_estado_pedido` que permite impresiones sin tareas. | `03_business_rpcs.sql` | descartar version intermedia |
| `20260616090000_09_public_reference.sql` | Columnas `public_reference`, generadores, constraints, triggers y version de conversion que hereda referencia. | `01_core_schema.sql` para estructura; `03_business_rpcs.sql` para contrato final de conversion | fusionar / descartar version intermedia |
| `20260616090100_10_public_tracking_status_rpc.sql` | Primera version de `consultar_estado_publico(text)`. | `03_business_rpcs.sql` | descartar version intermedia |
| `20260616090200_11_remove_order_number_from_public_tracking.sql` | Version final actual de `consultar_estado_publico(text)` sin `order_number`. | `03_business_rpcs.sql` | conservar version final |
| `20260622090000_12_add_task_template_model.sql` | Tablas de plantillas, constraints, triggers `updated_at`, indices, RLS, policies y grants. | `01_core_schema.sql` para modelo/triggers; `02_security_rls_grants.sql` para policies/grants | fusionar |
| `20260622090100_13_apply_task_template_to_pedido.sql` | RPC `aplicar_plantilla_tareas_pedido`. | `03_business_rpcs.sql` | conservar version final |
| `20260622090200_14_pedido_pagos.sql` | Enum `pedido_pago_estado`, tabla `pedido_pagos`, helpers de calculo, triggers, backfill, RLS, policies y grants. | `01_core_schema.sql` para enum/tabla/helpers/triggers; `02_security_rls_grants.sql` para RLS/policies/grants | fusionar |
| `20260624090000_15_create_manual_pedido_rpc.sql` | RPC `crear_pedido_manual`. | `03_business_rpcs.sql` | conservar version final |
| `20260624090100_16_convert_solicitud_payment_amount.sql` | Version de conversion que crea `pedido_pagos` con `total_amount`. | `03_business_rpcs.sql` | reescribir contrato |
| `20260624090200_17_add_payment_history_action.sql` | Agrega `pago_actualizado` al enum `pedido_historial_action`. | `01_core_schema.sql` | fusionar |
| `20260624090300_18_update_pedido_payment_rpc.sql` | RPC `actualizar_pago_pedido`. | `03_business_rpcs.sql` | conservar version final |
| `20260624090400_19_block_delivery_without_full_payment.sql` | Version final actual de `actualizar_estado_pedido` con bloqueo por pago completo. | `03_business_rpcs.sql` | conservar version final |

Notas del mapeo:

- Las versiones viejas de `actualizar_estado_pedido`,
  `convertir_solicitud_a_pedido` y `consultar_estado_publico` no deben
  migrarse como pasos intermedios.
- `public_reference`, `workflow_type`, plantillas y pagos deben nacer
  directamente en `01_core_schema.sql`.
- `pedido_historial_action` debe nacer ya con `pago_actualizado`.
- Los triggers de historial deben ir a `01_core_schema.sql`, no a
  `05_final_hardening.sql`.
- Los backfills incrementales deben eliminarse o convertirse en comentarios
  tecnicos si hace falta explicar origen historico.

## 11. Plan de ejecucion para Beta 1.2-1.6

### Beta 1.2 - Crear `01_core_schema.sql`

- Objetivo: crear el schema final reproducible desde cero.
- Archivos que podra modificar:
  - nuevas migraciones consolidadas en una ubicacion acordada o reemplazo
    controlado del set de migraciones, segun instruccion de esa subfase.
  - documentacion de apoyo si cambia el plan.
- Pruebas minimas:
  - aplicar migracion en base limpia.
  - validar enums, tablas, constraints, FKs, indices y triggers estructurales.
  - probar generacion de `order_number`, `public_reference` y
    `payment_status` con `BEGIN`/`ROLLBACK`.
- Riesgos:
  - orden incorrecto por FKs circulares entre solicitud y pedido.
  - olvidar `pago_actualizado` en enum final.
  - ubicar historial fuera del core.

### Beta 1.3 - Crear `02_security_rls_grants.sql`

- Objetivo: definir helpers de permisos, RLS, policies y grants base finales.
- Archivos que podra modificar:
  - migracion consolidada de seguridad.
  - plan/documentacion si se decide politica final de grants.
- Pruebas minimas:
  - confirmar RLS enabled en todas las tablas sensibles.
  - probar acceso `anon`, `authenticated`, `admin`, `supervisor` y
    `trabajador`.
  - confirmar que `anon` no tiene grants amplios sobre tablas internas.
- Riesgos:
  - romper `/solicitud` por revocar insert necesario.
  - romper tareas/asignaciones por helpers mal ordenados.
  - depender de grants amplios accidentales.

### Beta 1.4 - Crear `03_business_rpcs.sql`

- Objetivo: crear solo las RPCs finales con contratos transaccionales.
- Archivos que podra modificar:
  - migracion consolidada de RPCs.
  - tipos generados solo si esa subfase lo autoriza.
- Pruebas minimas:
  - conversion encargo.
  - conversion impresion con fallback DB.
  - pedido manual.
  - cambio de estado con tareas y pago.
  - actualizacion de pago.
  - tracking publico seguro.
- Riesgos:
  - portar una version intermedia de RPC.
  - exponer `order_number` o pagos en tracking.
  - olvidar revokes de RPCs internas a `anon`.

### Beta 1.5 - Crear `04_storage.sql`

- Objetivo: consolidar bucket privado, helpers y policies de Storage.
- Archivos que podra modificar:
  - migracion consolidada de Storage.
  - documentacion de Storage si se toma decision nueva.
- Pruebas minimas:
  - confirmar bucket privado.
  - subida publica controlada.
  - subida interna por usuario autorizado.
  - lectura interna mediante permisos.
  - bloqueo de lectura anonima.
- Riesgos:
  - romper `/solicitud` con archivos.
  - exponer `storage.objects` a `anon`.
  - dejar helpers privados mas expuestos de lo necesario.

### Beta 1.6 - Crear `05_final_hardening.sql`

- Objetivo: cerrar revokes, grants, comments y checks defensivos finales.
- Archivos que podra modificar:
  - migracion final de hardening.
  - documentacion de cierre si aplica.
- Pruebas minimas:
  - consultas de catalogo de grants y routines.
  - confirmar RPCs internas no ejecutables por `anon`.
  - confirmar que `anon` conserva solo `/solicitud`, `/estado` y Storage
    publico controlado.
- Riesgos:
  - revocar demasiado tarde o demasiado poco.
  - romper helpers requeridos por policies.
  - dejar comentarios desactualizados.

### Beta 1.7 - Regenerar types y ajustar app

- Objetivo: regenerar `src/types/database.types.ts` y ajustar app solo si el
  contrato consolidado lo requiere.
- Archivos que podra modificar:
  - `src/types/database.types.ts`.
  - `src/lib` o `src/app` solo si hay cambios de contrato aprobados.
- Pruebas minimas:
  - typecheck/build.
  - servicios que llaman RPCs.
  - tracking y solicitud publica.
- Riesgos:
  - diferencias de firma en RPCs.
  - DTOs publicos desalineados.

### Beta 1.8 - QA DB completo

- Objetivo: ejecutar QA funcional y SQL de la base consolidada.
- Archivos que podra modificar:
  - documentacion de resultados o fixes aprobados.
- Pruebas minimas:
  - `supabase db reset`.
  - pruebas SQL con `BEGIN`/`ROLLBACK`.
  - RLS/grants por rol.
  - flujos publicos e internos principales.
- Riesgos:
  - falsos positivos por harness.
  - datos de prueba persistidos.

### Beta 1.9 - Cierre documental

- Objetivo: actualizar documentacion final y registrar decisiones.
- Archivos que podra modificar:
  - documentos de modelo, permisos, storage, flujos y deuda tecnica.
- Pruebas minimas:
  - auditorias informativas.
  - diff-check.
  - revision de consistencia documental.
- Riesgos:
  - documentar como final algo no implementado.
  - dejar deuda critica sin decision.

## 12. Checklist de QA para la consolidacion

- [ ] `supabase db reset`.
- [ ] Generacion de types.
- [ ] `npm.cmd run diff:check`.
- [ ] `npm.cmd run audit:security`.
- [ ] `npm.cmd run audit:client-supabase`.
- [ ] `npm.cmd run audit:public-tracking`.
- [ ] `/solicitud` sin archivos.
- [ ] `/solicitud` con archivos.
- [ ] `/estado` con referencia valida.
- [ ] `/estado` con referencia invalida.
- [ ] `/estado` con referencia inexistente.
- [ ] Conversion encargo.
- [ ] Conversion impresion.
- [ ] Pedido manual.
- [ ] Asignacion trabajador.
- [ ] Trabajador solo ve asignados.
- [ ] Encargo exige tareas.
- [ ] Impresion avanza sin tareas.
- [ ] Entrega bloqueada sin pago completo.
- [ ] Entrega permitida con pago completo.
- [ ] Archivos internos sin exponer `file_path`.
- [ ] Pagos no visibles para `anon`.
- [ ] `anon` sin select directo sobre tablas internas.
- [ ] `anon` sin execute sobre RPCs internas.
- [ ] `authenticated` limitado por RLS y perfil activo.
- [ ] Historial se escribe por triggers/RPCs controladas.
- [ ] `pedido_historial_action` incluye `pago_actualizado` desde el schema base.
- [ ] Storage mantiene `godel-files` privado.

## 13. Decisiones pendientes antes de implementar SQL

Antes de Beta 1.2 se deben revisar contigo:

- Politica final de grants de `authenticated`: grants amplios con RLS o grants
  mas minimos por tabla.
- Estrategia final para helpers privados usados por `anon` en Storage.
- Si el refuerzo de `convertir_solicitud_a_pedido` para `impresion` se
  implementa en la primera version de `03_business_rpcs.sql` o en una subfase
  controlada dentro de Beta.
- Si se agregan checks SQL auxiliares ejecutables en `05_final_hardening.sql` o
  solo se documentan para QA.
- Como se haran pruebas de usuario `anon`, `admin`, `supervisor` y
  `trabajador` sin exponer credenciales ni dejar datos basura.
- Ubicacion fisica final del set consolidado mientras convive o reemplaza las
  19 migraciones historicas durante desarrollo.
- Si los comments SQL finales seran exhaustivos o solo para funciones criticas.
