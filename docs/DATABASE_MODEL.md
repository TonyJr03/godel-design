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
| `fecha_creacion` | `timestamptz` | Fecha operativa de creación del pedido. |
| `fecha_entrega_estimada` | `date nullable` | Fecha estimada de entrega. |
| `fecha_entrega_real` | `date nullable` | Fecha real de entrega. |
| `creado_por` | `uuid nullable` | Usuario interno que creó el pedido. |
| `supervisor_id` | `uuid nullable` | Supervisor responsable. |
| `created_at` | `timestamptz` | Fecha de creación del registro. |
| `updated_at` | `timestamptz` | Fecha de última actualización. |

**Claves foráneas:**

- `pedidos.cliente_id` -> `clientes.id`.
- `pedidos.solicitud_id` -> `solicitudes.id`.
- `pedidos.creado_por` -> `profiles.id`.
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
| `trabajador_id` | `uuid` | Usuario interno asignado. Conserva el nombre técnico original, pero puede apuntar a un perfil con rol `admin`, `supervisor` o `trabajador`. |
| `assigned_by` | `uuid nullable` | Usuario que realizó la asignación. |
| `assigned_at` | `timestamptz` | Fecha de asignación. |

**Claves foráneas:**

- `pedido_trabajadores.pedido_id` -> `pedidos.id`.
- `pedido_trabajadores.trabajador_id` -> `profiles.id`.
- `pedido_trabajadores.assigned_by` -> `profiles.id`.

**Reglas importantes:**

- Un pedido puede tener varios usuarios internos asignados.
- Un usuario interno puede estar asignado a varios pedidos.
- Se recomienda evitar duplicados para la misma combinación `pedido_id` + `trabajador_id`.

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
| `user_id` | `uuid` | Usuario interno autor del comentario. |
| `contenido` | `text` | Texto del comentario. |
| `created_at` | `timestamptz` | Fecha de creación. |
| `updated_at` | `timestamptz` | Fecha de última actualización. |

**Claves foráneas:**

- `pedido_comentarios.pedido_id` -> `pedidos.id`.
- `pedido_comentarios.user_id` -> `profiles.id`.

**Reglas importantes:**

- Los comentarios son internos.
- Un pedido puede tener muchos comentarios.
- Agregar un comentario puede registrar un evento `nota_agregada` en el historial.

**Notas de seguridad:**

- Solo usuarios internos autorizados pueden leer comentarios.
- Trabajadores solo deberían leer y crear comentarios en pedidos asignados.

### `pedido_historial`

**Propósito:** Registra eventos importantes ocurridos sobre un pedido para trazabilidad básica.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `id` | `uuid` | Identificador único del evento. |
| `pedido_id` | `uuid` | Pedido relacionado. |
| `user_id` | `uuid nullable` | Usuario que ejecutó la acción, si aplica. |
| `action` | `pedido_historial_action` | Tipo de evento registrado. |
| `old_value` | `text nullable` | Valor anterior si aplica. |
| `new_value` | `text nullable` | Valor nuevo si aplica. |
| `metadata` | `jsonb nullable` | Datos adicionales del evento. |
| `created_at` | `timestamptz` | Fecha del evento. |

**Claves foráneas:**

- `pedido_historial.pedido_id` -> `pedidos.id`.
- `pedido_historial.user_id` -> `profiles.id`.

**Reglas importantes:**

- El historial no debe editarse manualmente desde la aplicación.
- Debe registrar cambios relevantes de estado, asignaciones, archivos, fechas y cierre del pedido.
- Debe mantenerse simple en la primera versión.

**Notas de seguridad:**

- Usuarios internos autorizados pueden leer historial según permisos sobre el pedido.
- La inserción debería ocurrir mediante acciones controladas de la aplicación o funciones seguras.
- No se debería permitir actualización o eliminación manual desde el cliente.

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
| `pedido_trabajadores` | `trabajador_id` |
| `archivos` | `pedido_id` |
| `archivos` | `solicitud_id` |
| `pedido_comentarios` | `pedido_id` |
| `pedido_historial` | `pedido_id` |

## Nota de Fase 11

El diagnóstico y diseño actualizado para comentarios internos e historial operativo se documenta en `docs/COMMENTS_AND_HISTORY_MODEL.md`. Ese documento debe usarse como referencia antes de crear nuevas migraciones relacionadas con comentarios o historial.

## Pendiente para la siguiente tarea

El próximo paso será crear la migración SQL inicial de Supabase basada en este documento, incluyendo enums, tablas, claves foráneas, restricciones, índices, campos de auditoría y la estrategia inicial de Row Level Security.
