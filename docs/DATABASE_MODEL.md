# Modelo de Datos Inicial — Godel Diseño

## Propósito del documento

Este documento define el modelo de datos inicial del sistema web de gestión operativa de Godel Diseño. Su objetivo es servir como base técnica para crear, en una tarea posterior, las migraciones SQL iniciales de Supabase.

Este archivo no implementa todavía SQL, políticas RLS, buckets de Storage, autenticación ni lógica de aplicación. Solo describe las entidades principales, sus relaciones, reglas de negocio y criterios de seguridad esperados.

## Principios del modelo

- Claridad antes que complejidad.
- Separación entre solicitudes y pedidos.
- Clientes sin cuenta de usuario en la primera versión.
- Archivos privados por defecto.
- Trazabilidad básica para cambios relevantes.
- Seguridad mediante Row Level Security.
- Evitar funciones fuera de alcance para el MVP inicial.

## Enums iniciales

### `app_role`

| Valor | Uso |
|---|---|
| `admin` | Administración completa del sistema. |
| `supervisor` | Gestión operativa de solicitudes y pedidos. |
| `trabajador` | Ejecución y seguimiento de pedidos asignados. |

### `solicitud_estado`

| Valor |
|---|
| `nueva` |
| `en_revision` |
| `contactada` |
| `aprobada` |
| `rechazada` |
| `convertida` |

### `pedido_estado`

| Valor |
|---|
| `solicitud_recibida` |
| `en_revision` |
| `en_produccion` |
| `listo_entrega` |
| `entregado` |
| `cancelado` |

### `pedido_prioridad`

| Valor |
|---|
| `baja` |
| `normal` |
| `alta` |
| `urgente` |

### `pedido_tarea_tipo`

| Valor | Uso |
|---|---|
| `simple` | Tarea sin cantidades, como diseñar una pieza o revisar un archivo. |
| `cuantificada` | Tarea con cantidad objetivo y avance numérico. |

### `archivo_visibility`

| Valor | Uso |
|---|---|
| `cliente_solicitud` | Archivo enviado por un cliente junto a una solicitud pública. |
| `interno_pedido` | Archivo interno asociado a un pedido. |
| `avance` | Archivo de avance del trabajo. |
| `final_entrega` | Archivo final preparado para entrega. |

### `pedido_historial_action`

| Valor |
|---|
| `pedido_creado` |
| `estado_cambiado` |
| `trabajador_asignado` |
| `trabajador_removido` |
| `archivo_subido` |
| `nota_agregada` |
| `fecha_entrega_actualizada` |
| `pedido_entregado` |
| `pedido_cancelado` |

### `solicitud_historial_action`

| Valor |
|---|
| `solicitud_creada` |
| `archivos_adjuntados` |
| `estado_cambiado` |
| `cliente_asociado` |
| `cliente_creado_desde_solicitud` |
| `convertida_a_pedido` |

## Tablas iniciales

### `perfiles`

**Propósito:** Representa a los usuarios internos del sistema y extiende la información de `auth.users`.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `id` | `uuid` | Relacionado con `auth.users.id`. |
| `full_name` | `text` | Nombre completo del usuario interno. |
| `role` | `app_role` | Rol operativo del usuario. |
| `phone` | `text nullable` | Teléfono de contacto. |
| `avatar_url` | `text nullable` | URL o ruta de avatar si aplica. |
| `is_active` | `boolean` | Permite desactivar usuarios sin eliminarlos. |
| `created_at` | `timestamptz` | Fecha de creación del perfil. |
| `updated_at` | `timestamptz` | Fecha de última actualización. |

**Claves foráneas:**

- `perfiles.id` -> `auth.users.id`.

**Reglas importantes:**

- Cada usuario autenticado interno debe tener un perfil.
- El rol debe controlarse desde el backend o mediante reglas seguras, nunca solo desde el frontend.
- `is_active` debe considerarse en permisos y consultas internas.

**Notas de seguridad:**

- Solo `admin` debería poder gestionar roles y activar o desactivar usuarios.
- Los usuarios autenticados podrían leer su propio perfil.
- El acceso a perfiles de otros usuarios debe depender del rol.
- En el modelo vigente de RLS, `admin` y `supervisor` pueden leer perfiles internos; `trabajador` puede leer su propio perfil y datos básicos de perfiles asignados a pedidos que puede acceder.
- La Fase 12 recomienda gestionar inicialmente solo `perfiles`, sin crear usuarios Auth desde la app y sin usar service role key.

### `clientes`

**Propósito:** Almacena datos básicos de clientes externos sin crear cuentas de usuario para ellos.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `id` | `uuid` | Identificador único del cliente. |
| `name` | `text` | Nombre del cliente o contacto. |
| `phone` | `text` | Teléfono principal. |
| `email` | `text nullable` | Correo opcional. |
| `notes` | `text nullable` | Notas internas simples. |
| `created_at` | `timestamptz` | Fecha de creación. |
| `updated_at` | `timestamptz` | Fecha de última actualización. |

**Claves foráneas:**

- No requiere claves foráneas directas.

**Reglas importantes:**

- Un cliente puede estar asociado a varias solicitudes y pedidos.
- La primera versión no contempla panel ni cuenta de cliente.
- Debe evitarse convertir esta tabla en un CRM complejo.

**Notas de seguridad:**

- Los clientes no deben poder leer esta tabla directamente.
- Usuarios internos autorizados pueden consultar clientes según su rol.
- Trabajadores solo deberían ver datos de clientes relacionados con pedidos asignados.

### `solicitudes`

**Propósito:** Registra solicitudes públicas recibidas antes de convertirse en pedidos oficiales.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `id` | `uuid` | Identificador único de la solicitud. |
| `cliente_id` | `uuid nullable` | Cliente asociado si ya existe o se crea uno. |
| `client_name` | `text` | Nombre capturado desde el formulario público. |
| `client_phone` | `text` | Teléfono capturado desde el formulario público. |
| `client_email` | `text nullable` | Correo opcional capturado desde el formulario público. |
| `service_type` | `text` | Tipo de servicio solicitado. |
| `description` | `text` | Descripción del trabajo solicitado. |
| `desired_date` | `date nullable` | Fecha deseada por el cliente. |
| `notes` | `text nullable` | Observaciones adicionales. |
| `status` | `solicitud_estado` | Estado operativo de la solicitud. |
| `reviewed_by` | `uuid nullable` | Usuario interno que revisó la solicitud. |
| `converted_order_id` | `uuid nullable` | Pedido creado a partir de la solicitud. |
| `created_at` | `timestamptz` | Fecha de recepción. |
| `updated_at` | `timestamptz` | Fecha de última actualización. |

**Claves foráneas:**

- `solicitudes.cliente_id` -> `clientes.id`.
- `solicitudes.reviewed_by` -> `perfiles.id`.
- `solicitudes.converted_order_id` -> `pedidos.id`.

**Reglas importantes:**

- Una solicitud no se convierte automáticamente en pedido.
- Solo `admin` o `supervisor` pueden aprobar, rechazar o convertir solicitudes.
- Al convertirse, el estado debería pasar a `convertida` y registrar el pedido generado.
- Los cambios manuales de estado se validan mediante `public.actualizar_estado_solicitud`.
- Transiciones manuales permitidas: `nueva` -> `en_revision` o `rechazada`; `en_revision` -> `contactada` o `rechazada`; `contactada` -> `aprobada` o `rechazada`; `aprobada` -> `rechazada`.
- `rechazada` y `convertida` son estados cerrados. `convertida` solo se asigna desde el flujo formal de conversión a pedido.
- `quantity` fue eliminado del modelo de solicitudes. Las cantidades, medidas y requisitos se deben explicar dentro de `description` o `notes`.
- `service_type` sigue siendo una referencia inicial del tipo de trabajo solicitado.
- La conversión a pedido exige `title`, `description` y `priority` definidos por el usuario interno. `priority` inicia visualmente en `normal` y se valida contra el enum real. `estimated_delivery_date` es opcional y no puede ser anterior al día actual si se informa. `service_type` no se usa como título automático.

**Notas de seguridad:**

- Usuarios no autenticados solo deberían poder insertar solicitudes públicas.
- Usuarios no autenticados no deben poder leer solicitudes existentes.
- La lectura y gestión interna debe quedar protegida por RLS.

### `pedidos`

**Propósito:** Representa trabajos oficiales que la empresa gestiona internamente.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `id` | `uuid` | Identificador único del pedido. |
| `order_number` | `text unique` | Número visible y único para operación interna, con formato `P-YY-XXXX`. |
| `cliente_id` | `uuid nullable` | Cliente asociado; opcional en pedidos manuales y requerido en pedidos convertidos desde solicitud. |
| `solicitud_id` | `uuid nullable` | Solicitud origen si el pedido fue convertido. |
| `title` | `text` | Nombre breve del pedido. |
| `description` | `text` | Detalle del trabajo. |
| `status` | `pedido_estado` | Estado operativo del pedido. |
| `priority` | `pedido_prioridad` | Prioridad del pedido. |
| `estimated_delivery_date` | `date nullable` | Fecha estimada de entrega. |
| `actual_delivery_date` | `date nullable` | Fecha real de entrega. |
| `created_by` | `uuid nullable` | Usuario interno que creó el pedido. |
| `created_at` | `timestamptz` | Fecha de creación del registro. |
| `updated_at` | `timestamptz` | Fecha de última actualización. |

**Claves foráneas:**

- `pedidos.cliente_id` -> `clientes.id`.
- `pedidos.solicitud_id` -> `solicitudes.id`.
- `pedidos.created_by` -> `perfiles.id`.

**Reglas importantes:**

- `order_number` debe ser único y cumplir el formato `P-YY-XXXX`.
- `order_number` se genera en base de datos al insertar el pedido. La secuencia reinicia cada año y se controla con `pedido_contadores` para proteger la concurrencia.
- Un pedido puede crearse manualmente o a partir de una solicitud.
- Un pedido manual puede quedar sin cliente asociado (`cliente_id = null`).
- La conversión desde solicitud exige que la solicitud tenga `cliente_id` asociado.
- Un pedido manual inicia en `en_revision`; un pedido convertido desde solicitud inicia en `solicitud_recibida`.
- La conversión desde solicitud guarda la prioridad definida por el usuario interno y una fecha estimada opcional validada server-side. Usa la numeración generada por base de datos y mantiene el estado inicial `solicitud_recibida`.
- Los estados de pedido solo representan fases generales. Las tareas de pedido modelan el progreso real y condicionan el avance operativo mediante `public.actualizar_estado_pedido`.
- Los cambios importantes de estado deben registrarse en `pedido_historial`.

**Notas de seguridad:**

- `admin` puede acceder a todos los pedidos.
- `supervisor` puede gestionar pedidos.
- `trabajador` solo debe leer pedidos donde esté asignado.

### `pedido_contadores`

**Propósito:** Controla la secuencia anual de números visibles de pedido.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `year` | `smallint` | Año de la secuencia. Clave primaria. |
| `last_number` | `integer` | Último número asignado dentro del año. |
| `updated_at` | `timestamptz` | Fecha de última actualización del contador. |

**Reglas importantes:**

- La numeración visible de pedidos usa el formato `P-YY-XXXX`.
- La secuencia reinicia por año.
- La función privada `private.generar_numero_pedido()` incrementa el contador dentro de la transacción.
- Si la secuencia anual supera `9999`, la función debe fallar para evitar generar un formato inválido.
- La aplicación no acepta ni envía `order_number` desde formularios.

**Notas de seguridad:**

- La tabla no tiene UI ni acceso directo desde la aplicación.
- No se conceden permisos directos a usuarios anónimos o autenticados.
- La asignación del número ocurre mediante trigger de base de datos al insertar en `pedidos`.

### `pedido_trabajadores`

**Propósito:** Tabla intermedia para asignar uno o varios usuarios internos a cada pedido.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `id` | `uuid` | Identificador único de la asignación. |
| `pedido_id` | `uuid` | Pedido asignado. |
| `assigned_profile_id` | `uuid` | Perfil interno asignado. Puede tener rol `admin`, `supervisor` o `trabajador`. |
| `assigned_by` | `uuid nullable` | Usuario que realizó la asignación. |
| `assigned_at` | `timestamptz` | Fecha de asignación. |

**Claves foráneas:**

- `pedido_trabajadores.pedido_id` -> `pedidos.id`.
- `pedido_trabajadores.assigned_profile_id` -> `perfiles.id`.
- `pedido_trabajadores.assigned_by` -> `perfiles.id`.

**Reglas importantes:**

- Un pedido puede tener varios usuarios internos asignados.
- Un usuario interno puede estar asignado a varios pedidos.
- Se recomienda evitar duplicados para la misma combinación `pedido_id` + `assigned_profile_id`.

**Notas de seguridad:**

- Solo `admin` o `supervisor` deberían asignar o remover personal.
- La tabla es clave para permitir que trabajadores vean solo pedidos asignados y el personal asignado a esos pedidos.

### `pedido_tareas`

**Propósito:** Registra tareas operativas asociadas a un pedido. El progreso real del pedido se modela con estas tareas, no con estados finos de pedido.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `id` | `uuid` | Identificador único de la tarea. |
| `pedido_id` | `uuid` | Pedido al que pertenece la tarea. |
| `title` | `text` | Texto escrito por el usuario interno. |
| `task_type` | `pedido_tarea_tipo` | `simple` o `cuantificada`. |
| `target_quantity` | `integer nullable` | Cantidad objetivo para tareas cuantificadas. |
| `completed_quantity` | `integer nullable` | Avance numérico de tareas cuantificadas. |
| `is_completed` | `boolean` | Indica si la tarea está completada. |
| `sort_order` | `integer` | Orden manual dentro del pedido. |
| `created_by` | `uuid nullable` | Perfil que creó la tarea. |
| `updated_by` | `uuid nullable` | Perfil que actualizó la tarea. |
| `completed_by` | `uuid nullable` | Perfil que completó la tarea. |
| `completed_at` | `timestamptz nullable` | Fecha de completado. |
| `created_at` | `timestamptz` | Fecha de creación. |
| `updated_at` | `timestamptz` | Fecha de última actualización. |

**Claves foráneas:**

- `pedido_tareas.pedido_id` -> `pedidos.id`.
- `pedido_tareas.created_by` -> `perfiles.id`.
- `pedido_tareas.updated_by` -> `perfiles.id`.
- `pedido_tareas.completed_by` -> `perfiles.id`.

**Reglas importantes:**

- `title` no puede estar vacío.
- `sort_order` no puede ser negativo.
- Las tareas `simple` no guardan cantidades.
- Las tareas `cuantificada` requieren `target_quantity > 0`, `completed_quantity >= 0` y `completed_quantity <= target_quantity`.
- La detección automática de tipo por números en el título se implementa en servicios TypeScript server-side.
- La UI del detalle permite gestionar tareas y la RPC de cambio de estado exige tareas para pasar a producción y tareas completas para marcar listo para entrega.

**Notas de seguridad:**

- RLS está activo.
- `admin`, `supervisor` y personal asignado pueden gestionar tareas de pedidos accesibles.
- El acceso se basa en `private.can_access_pedido(pedido_id)`.
- Usuarios anónimos no acceden.

### `archivos`

**Propósito:** Registra metadatos de archivos asociados a solicitudes o pedidos.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `id` | `uuid` | Identificador único del archivo. |
| `pedido_id` | `uuid nullable` | Pedido asociado si aplica. |
| `solicitud_id` | `uuid nullable` | Solicitud asociada si aplica. |
| `uploaded_by` | `uuid nullable` | Usuario interno que subió el archivo, si aplica. |
| `file_name` | `text` | Nombre visible del archivo. |
| `file_path` | `text` | Ruta dentro del bucket de Storage. |
| `file_type` | `text nullable` | MIME type o tipo de archivo. |
| `file_size` | `bigint nullable` | Tamaño del archivo en bytes. |
| `bucket` | `text` | Bucket de Supabase Storage. |
| `visibility` | `archivo_visibility` | Categoría o contexto de visibilidad. |
| `created_at` | `timestamptz` | Fecha de subida o registro. |

**Claves foráneas:**

- `archivos.pedido_id` -> `pedidos.id`.
- `archivos.solicitud_id` -> `solicitudes.id`.
- `archivos.uploaded_by` -> `perfiles.id`.

**Reglas importantes:**

- Un archivo puede pertenecer a una solicitud o a un pedido.
- Debe evitarse que un archivo quede sin contexto salvo decisión explícita.
- Los archivos son privados por defecto.

**Notas de seguridad:**

- No deben usarse URLs públicas permanentes.
- El acceso debe resolverse mediante reglas de Storage, RLS y URLs firmadas.
- Trabajadores solo deberían acceder a archivos de pedidos asignados.

### `pedido_comentarios`

**Propósito:** Almacena notas o comentarios internos asociados a pedidos.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `id` | `uuid` | Identificador único del comentario. |
| `pedido_id` | `uuid` | Pedido comentado. |
| `content` | `text` | Texto del comentario. |
| `author_id` | `uuid` | Usuario interno autor del comentario. |
| `created_at` | `timestamptz` | Fecha de creación. |

**Claves foráneas:**

- `pedido_comentarios.pedido_id` -> `pedidos.id`.
- `pedido_comentarios.author_id` -> `perfiles.id`.

**Reglas importantes:**

- Los comentarios son internos.
- Un pedido puede tener muchos comentarios.
- Agregar un comentario puede registrar un evento `nota_agregada` en el historial.

**Notas de seguridad:**

- Solo usuarios internos autorizados pueden leer comentarios.
- Trabajadores solo deberían leer y crear comentarios en pedidos asignados.
- La subfase 11.2 deja los comentarios de pedido como append-only: sin actualización ni eliminación desde la aplicación.

### `pedido_historial`

**Propósito:** Registra eventos importantes ocurridos sobre un pedido para trazabilidad básica.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `id` | `uuid` | Identificador único del evento. |
| `pedido_id` | `uuid` | Pedido relacionado. |
| `actor_id` | `uuid nullable` | Usuario que ejecutó la acción, si aplica. |
| `action` | `pedido_historial_action` | Tipo de evento registrado. |
| `summary` | `text` | Resumen breve visible. |
| `old_value` | `text nullable` | Valor anterior si aplica. |
| `new_value` | `text nullable` | Valor nuevo si aplica. |
| `metadata` | `jsonb` | Datos adicionales mínimos del evento. |
| `created_at` | `timestamptz` | Fecha del evento. |

**Claves foráneas:**

- `pedido_historial.pedido_id` -> `pedidos.id`.
- `pedido_historial.actor_id` -> `perfiles.id`.

**Reglas importantes:**

- El historial no debe editarse manualmente desde la aplicación.
- Debe registrar cambios relevantes de estado, asignaciones, archivos, fechas y cierre del pedido.
- Debe mantenerse simple en la primera versión.

**Notas de seguridad:**

- Usuarios internos autorizados pueden leer historial según permisos sobre el pedido.
- La inserción debería ocurrir mediante acciones controladas de la aplicación o funciones seguras.
- No se debería permitir actualización o eliminación manual desde el cliente.
- La subfase 11.2 deja la inserción directa por tabla deshabilitada; la RPC `actualizar_estado_pedido` mantiene el registro de cambios de estado.

### `solicitud_comentarios`

**Propósito:** Almacena comentarios internos asociados a solicitudes.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `id` | `uuid` | Identificador único del comentario. |
| `solicitud_id` | `uuid` | Solicitud comentada. |
| `content` | `text` | Texto del comentario. |
| `author_id` | `uuid` | Usuario interno autor del comentario. |
| `created_at` | `timestamptz` | Fecha de creación. |

**Claves foráneas:**

- `solicitud_comentarios.solicitud_id` -> `solicitudes.id`.
- `solicitud_comentarios.author_id` -> `perfiles.id`.

**Reglas importantes:**

- Los comentarios son internos.
- Una solicitud puede tener muchos comentarios.
- El content no puede estar vacío.
- El content tiene un límite inicial de 2000 caracteres.
- No hay edición ni eliminación inicial.

**Notas de seguridad:**

- Solo `admin` y `supervisor` pueden leer o insertar comentarios de solicitudes.
- `trabajador` no accede a comentarios de solicitudes.
- Usuarios anónimos no acceden.

### `solicitud_historial`

**Propósito:** Registra eventos importantes ocurridos sobre una solicitud para trazabilidad operativa básica.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `id` | `uuid` | Identificador único del evento. |
| `solicitud_id` | `uuid` | Solicitud relacionada. |
| `actor_id` | `uuid nullable` | Usuario que ejecutó la acción, si aplica. |
| `action` | `solicitud_historial_action` | Tipo de evento registrado. |
| `summary` | `text` | Resumen breve visible. |
| `old_value` | `text nullable` | Valor anterior si aplica. |
| `new_value` | `text nullable` | Valor nuevo si aplica. |
| `metadata` | `jsonb` | Datos adicionales mínimos del evento. |
| `created_at` | `timestamptz` | Fecha del evento. |

**Claves foráneas:**

- `solicitud_historial.solicitud_id` -> `solicitudes.id`.
- `solicitud_historial.actor_id` -> `perfiles.id`.

**Reglas importantes:**

- El historial es append-only.
- `summary` no puede estar vacío.
- `metadata` debe ser un objeto JSON.
- Los eventos automáticos se conectarán en subfases posteriores.

**Notas de seguridad:**

- Solo `admin` y `supervisor` pueden leer historial de solicitudes.
- La inserción queda limitada a `admin` y `supervisor` autenticados para flujos internos futuros.
- `trabajador` no accede al historial de solicitudes.
- Usuarios anónimos no acceden.
- No se permite actualización ni eliminación manual desde el cliente.

## Relaciones principales

- Un cliente puede tener muchas solicitudes.
- Un cliente puede tener muchos pedidos.
- Una solicitud puede convertirse en un pedido.
- Un pedido puede tener varios usuarios internos asignados.
- Un usuario interno puede estar asignado a varios pedidos.
- Un pedido puede tener muchas tareas.
- Un pedido puede tener muchos archivos.
- Una solicitud puede tener muchos archivos.
- Un pedido puede tener muchos comentarios.
- Un pedido puede tener muchos eventos de historial.
- Una solicitud puede tener muchos comentarios.
- Una solicitud puede tener muchos eventos de historial.

## Reglas de negocio iniciales

- Una solicitud no se convierte automáticamente en pedido.
- Solo `admin` o `supervisor` podrán convertir solicitudes en pedidos.
- Trabajadores solo podrán ver pedidos asignados.
- Trabajadores asignados pueden gestionar tareas de sus pedidos asignados.
- Los archivos serán privados por defecto.
- El historial no será editable manualmente.
- Los clientes no tendrán cuenta de usuario en la primera versión.

## Estrategia inicial de RLS

La estrategia de Row Level Security debe definirse desde el inicio y reforzarse en las migraciones SQL.

| Rol o contexto | Acceso conceptual |
|---|---|
| `admin` | Puede acceder a todo el sistema. |
| `supervisor` | Puede gestionar solicitudes, clientes operativos, pedidos, asignaciones, archivos, comentarios e historial. |
| `trabajador` | Solo puede ver pedidos asignados y datos relacionados necesarios para trabajar. |
| Cliente externo | Solo puede insertar solicitudes públicas y archivos de solicitud cuando el flujo lo permita. |
| Usuario no autenticado | No puede leer información interna. |

Para archivos, los buckets deben ser privados y el acceso debe protegerse mediante reglas de Storage, validación de permisos y URLs firmadas de duración limitada.

## Índices sugeridos

| Tabla | Campo |
|---|---|
| `solicitudes` | `status` |
| `solicitudes` | `cliente_id` |
| `solicitudes` | `created_at` |
| `pedidos` | `status` |
| `pedidos` | `cliente_id` |
| `pedidos` | `solicitud_id` |
| `pedidos` | `estimated_delivery_date` |
| `pedido_trabajadores` | `pedido_id` |
| `pedido_trabajadores` | `assigned_profile_id` |
| `archivos` | `pedido_id` |
| `archivos` | `solicitud_id` |
| `pedido_comentarios` | `pedido_id` |
| `pedido_historial` | `pedido_id` |
| `solicitud_comentarios` | `solicitud_id, created_at` |
| `solicitud_comentarios` | `author_id` |
| `solicitud_historial` | `solicitud_id, created_at` |
| `solicitud_historial` | `actor_id` |
| `solicitud_historial` | `action` |

## Nota de Fase 11

El diagnóstico y diseño actualizado para comentarios internos e historial operativo se documenta en `docs/COMMENTS_AND_HISTORY_MODEL.md`. Ese documento debe usarse como referencia antes de crear nuevas migraciones relacionadas con comentarios o historial.

## Pendiente para la siguiente tarea

El próximo paso será crear la migración SQL inicial de Supabase basada en este documento, incluyendo enums, tablas, claves foráneas, restricciones, índices, campos de auditoría y la estrategia inicial de Row Level Security.
