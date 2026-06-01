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
| `cotizado` |
| `aprobado_cliente` |
| `en_diseno` |
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

### `profiles`

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

- `profiles.id` -> `auth.users.id`.

**Reglas importantes:**

- Cada usuario autenticado interno debe tener un perfil.
- El rol debe controlarse desde el backend o mediante reglas seguras, nunca solo desde el frontend.
- `is_active` debe considerarse en permisos y consultas internas.

**Notas de seguridad:**

- Solo `admin` debería poder gestionar roles y activar o desactivar usuarios.
- Los usuarios autenticados podrían leer su propio perfil.
- El acceso a perfiles de otros usuarios debe depender del rol.
- En el modelo vigente de RLS, `admin` y `supervisor` pueden leer perfiles internos; `trabajador` puede leer su propio perfil y datos básicos de perfiles asignados a pedidos que puede acceder.
- La Fase 12 recomienda gestionar inicialmente solo `profiles`, sin crear usuarios Auth desde la app y sin usar service role key.

### `clientes`

**Propósito:** Almacena datos básicos de clientes externos sin crear cuentas de usuario para ellos.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `id` | `uuid` | Identificador único del cliente. |
| `nombre` | `text` | Nombre del cliente o contacto. |
| `telefono` | `text` | Teléfono principal. |
| `email` | `text nullable` | Correo opcional. |
| `notas` | `text nullable` | Notas internas simples. |
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
| `cliente_nombre` | `text` | Nombre capturado desde el formulario público. |
| `cliente_telefono` | `text` | Teléfono capturado desde el formulario público. |
| `cliente_email` | `text nullable` | Correo opcional capturado desde el formulario público. |
| `tipo_servicio` | `text` | Tipo de servicio solicitado. |
| `descripcion` | `text` | Descripción del trabajo solicitado. |
| `cantidad` | `integer nullable` | Cantidad solicitada si aplica. |
| `fecha_deseada` | `date nullable` | Fecha deseada por el cliente. |
| `observaciones` | `text nullable` | Observaciones adicionales. |
| `estado` | `solicitud_estado` | Estado operativo de la solicitud. |
| `reviewed_by` | `uuid nullable` | Usuario interno que revisó la solicitud. |
| `converted_order_id` | `uuid nullable` | Pedido creado a partir de la solicitud. |
| `created_at` | `timestamptz` | Fecha de recepción. |
| `updated_at` | `timestamptz` | Fecha de última actualización. |

**Claves foráneas:**

- `solicitudes.cliente_id` -> `clientes.id`.
- `solicitudes.reviewed_by` -> `profiles.id`.
- `solicitudes.converted_order_id` -> `pedidos.id`.

**Reglas importantes:**

- Una solicitud no se convierte automáticamente en pedido.
- Solo `admin` o `supervisor` pueden aprobar, rechazar o convertir solicitudes.
- Al convertirse, el estado debería pasar a `convertida` y registrar el pedido generado.

**Notas de seguridad:**

- Usuarios no autenticados solo deberían poder insertar solicitudes públicas.
- Usuarios no autenticados no deben poder leer solicitudes existentes.
- La lectura y gestión interna debe quedar protegida por RLS.

### `pedidos`

**Propósito:** Representa trabajos oficiales que la empresa gestiona internamente.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `id` | `uuid` | Identificador único del pedido. |
| `numero_pedido` | `text unique` | Número visible y único para operación interna. |
| `cliente_id` | `uuid nullable` | Cliente asociado. |
| `solicitud_id` | `uuid nullable` | Solicitud origen si el pedido fue convertido. |
| `titulo` | `text` | Nombre breve del pedido. |
| `descripcion` | `text` | Detalle del trabajo. |
| `estado` | `pedido_estado` | Estado operativo del pedido. |
| `prioridad` | `pedido_prioridad` | Prioridad del pedido. |
| `fecha_entrega_estimada` | `date nullable` | Fecha estimada de entrega. |
| `fecha_entrega_real` | `date nullable` | Fecha real de entrega. |
| `created_by` | `uuid nullable` | Usuario interno que creó el pedido. |
| `supervisor_id` | `uuid nullable` | Supervisor responsable. |
| `created_at` | `timestamptz` | Fecha de creación del registro. |
| `updated_at` | `timestamptz` | Fecha de última actualización. |

**Claves foráneas:**

- `pedidos.cliente_id` -> `clientes.id`.
- `pedidos.solicitud_id` -> `solicitudes.id`.
- `pedidos.created_by` -> `profiles.id`.
- `pedidos.supervisor_id` -> `profiles.id`.

**Reglas importantes:**

- `numero_pedido` debe ser único.
- Un pedido puede crearse manualmente o a partir de una solicitud.
- Los cambios importantes de estado deben registrarse en `pedido_historial`.

**Notas de seguridad:**

- `admin` puede acceder a todos los pedidos.
- `supervisor` puede gestionar pedidos.
- `trabajador` solo debe leer pedidos donde esté asignado.

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
- `pedido_trabajadores.assigned_profile_id` -> `profiles.id`.
- `pedido_trabajadores.assigned_by` -> `profiles.id`.

**Reglas importantes:**

- Un pedido puede tener varios usuarios internos asignados.
- Un usuario interno puede estar asignado a varios pedidos.
- Se recomienda evitar duplicados para la misma combinación `pedido_id` + `assigned_profile_id`.

**Notas de seguridad:**

- Solo `admin` o `supervisor` deberían asignar o remover personal.
- La tabla es clave para permitir que trabajadores vean solo pedidos asignados y el personal asignado a esos pedidos.

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
- `archivos.uploaded_by` -> `profiles.id`.

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
| `author_id` | `uuid` | Usuario interno autor del comentario. |
| `contenido` | `text` | Texto del comentario. |
| `created_at` | `timestamptz` | Fecha de creación. |
| `updated_at` | `timestamptz` | Fecha de última actualización. |

**Claves foráneas:**

- `pedido_comentarios.pedido_id` -> `pedidos.id`.
- `pedido_comentarios.author_id` -> `profiles.id`.

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
- `pedido_historial.actor_id` -> `profiles.id`.

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
| `author_id` | `uuid` | Usuario interno autor del comentario. |
| `contenido` | `text` | Texto del comentario. |
| `created_at` | `timestamptz` | Fecha de creación. |

**Claves foráneas:**

- `solicitud_comentarios.solicitud_id` -> `solicitudes.id`.
- `solicitud_comentarios.author_id` -> `profiles.id`.

**Reglas importantes:**

- Los comentarios son internos.
- Una solicitud puede tener muchos comentarios.
- El contenido no puede estar vacío.
- El contenido tiene un límite inicial de 2000 caracteres.
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
- `solicitud_historial.actor_id` -> `profiles.id`.

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
| `solicitudes` | `estado` |
| `solicitudes` | `cliente_id` |
| `solicitudes` | `created_at` |
| `pedidos` | `estado` |
| `pedidos` | `cliente_id` |
| `pedidos` | `solicitud_id` |
| `pedidos` | `fecha_entrega_estimada` |
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
