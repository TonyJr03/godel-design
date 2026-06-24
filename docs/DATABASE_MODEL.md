# Modelo de Datos Vigente — Godel Diseño

## Propósito del documento

Este documento describe el modelo de datos consolidado del sistema web de
gestión operativa de Godel Diseño. El esquema, las políticas RLS, los helpers,
los triggers y las RPC principales están implementados en las migraciones de
`supabase/migrations/`; este archivo resume sus entidades, relaciones, reglas de
negocio y criterios de seguridad.

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

### `workflow_type`

| Valor | Uso |
|---|---|
| `encargo` | Trabajo personalizado o complejo. |
| `impresion` | Trabajo directo de impresión. |

`workflow_type` diferencia la variante del flujo operativo. No reemplaza
`service_type`, que sigue describiendo el servicio específico solicitado.

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
| `creado` |
| `solicitud_recibida` |
| `en_revision` |
| `en_produccion` |
| `listo_entrega` |
| `entregado` |
| `cancelado` |

### `pedido_pago_estado`

| Valor | Uso |
|---|---|
| `sin_pago` | Precio mayor que cero sin monto pagado. |
| `parcial` | Precio mayor que cero con pago menor al total. |
| `pagado` | No queda monto pendiente; incluye pedidos con `total_amount = 0`. |

El estado se calcula en base de datos a partir de `total_amount`,
`paid_cash_amount` y `paid_transfer_amount`; la aplicacion no lo decide
manualmente.

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
| `tarea_creada` |
| `tarea_actualizada` |
| `tarea_eliminada` |
| `tarea_completada` |
| `tarea_reabierta` |
| `tarea_progreso_actualizado` |
| `pago_actualizado` |

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
- La aplicación gestiona `public.perfiles`, sin crear usuarios Auth desde la app
  y sin usar service role key.

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
| `public_reference` | `text` | Codigo publico de seguimiento con formato `GD-XXXX-XXXX`. |
| `cliente_id` | `uuid nullable` | Cliente asociado si ya existe o se crea uno. |
| `client_name` | `text` | Nombre capturado desde el formulario público. |
| `client_phone` | `text` | Teléfono capturado desde el formulario público. |
| `client_email` | `text nullable` | Correo opcional capturado desde el formulario público. |
| `workflow_type` | `workflow_type` | Variante del flujo operativo; por defecto `encargo`. |
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
- Toda solicitud tiene `public_reference`, un codigo publico no secuencial con
  formato `GD-XXXX-XXXX`.
- `public_reference` no es el UUID interno, no deriva del `id` y no usa la
  numeracion interna de pedidos.
- El detalle interno puede mostrar `public_reference` como codigo copiable para
  compartir con el cliente; las referencias cortas derivadas del UUID quedan
  solo como identificadores internos.
- Solo `admin` o `supervisor` pueden aprobar, rechazar o convertir solicitudes.
- Al convertirse, el estado debería pasar a `convertida` y registrar el pedido generado.
- Los cambios manuales de estado se validan mediante `public.actualizar_estado_solicitud`.
- Transiciones manuales permitidas: `nueva` -> `en_revision` o `rechazada`; `en_revision` -> `contactada` o `rechazada`; `contactada` -> `aprobada` o `rechazada`; `aprobada` -> `rechazada`.
- `rechazada` y `convertida` son estados cerrados. `convertida` solo se asigna desde el flujo formal de conversión a pedido.
- `quantity` fue eliminado del modelo de solicitudes. Las cantidades, medidas y requisitos se deben explicar dentro de `description` o `notes`.
- `service_type` sigue siendo una referencia inicial del tipo de trabajo solicitado.
- `workflow_type` diferencia el flujo operativo general del servicio específico.
- Los registros existentes quedan como `encargo`.
- La conversión conserva el `workflow_type` de la solicitud.
- En encargos, la conversión exige `title` y `description` definidos por el usuario interno.
- En impresiones, la conversión usa el título operativo predeterminado `Pedido de impresión` y conserva la descripción estructurada de la solicitud.
- `priority` se valida contra el enum real. `estimated_delivery_date` es opcional y no puede ser anterior al día actual si se informa.
- `service_type` describe el servicio solicitado; no decide el flujo ni se usa como título automático.

**Notas de seguridad:**

- Usuarios no autenticados solo deberían poder insertar solicitudes públicas.
- Usuarios no autenticados no deben poder leer solicitudes existentes.
- La lectura y gestión interna debe quedar protegida por RLS.

### `pedidos`

**Propósito:** Representa trabajos oficiales que la empresa gestiona internamente.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `id` | `uuid` | Identificador único del pedido. |
| `order_number` | `text unique` | Número operativo interno y único, con formato `P-YY-XXXX`. |
| `public_reference` | `text` | Codigo publico de seguimiento con formato `GD-XXXX-XXXX`. |
| `cliente_id` | `uuid nullable` | Cliente asociado; opcional en pedidos manuales y requerido en pedidos convertidos desde solicitud. |
| `solicitud_id` | `uuid nullable` | Solicitud origen si el pedido fue convertido. |
| `workflow_type` | `workflow_type` | Variante del flujo operativo; por defecto `encargo`. |
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
- `order_number` se genera en base de datos al insertar el pedido. La secuencia reinicia cada año según `private.current_business_date()`, con zona `America/Havana`, y se controla con `pedido_contadores` para proteger la concurrencia.
- Todo pedido tiene `public_reference`, un codigo publico no secuencial con
  formato `GD-XXXX-XXXX`.
- `public_reference` no reemplaza `order_number`: `order_number` sigue siendo la
  numeracion interna operativa y `public_reference` queda reservado para
  seguimiento publico.
- El detalle interno del pedido muestra ambos conceptos separados:
  `order_number` como referencia operativa y `public_reference` como codigo
  copiable para el cliente.
- Un pedido puede crearse manualmente o a partir de una solicitud.
- `workflow_type` distingue encargos personalizados o complejos de trabajos directos de impresión, sin describir el servicio específico.
- Los registros existentes quedan como `encargo`.
- Un pedido manual puede quedar sin cliente asociado (`cliente_id = null`).
- La conversión desde solicitud exige que la solicitud tenga `cliente_id` asociado.
- Un pedido convertido desde solicitud hereda exactamente el
  `public_reference` de esa solicitud.
- Un pedido manual genera su propio `public_reference`.
- Un pedido manual inicia en `creado`; un pedido convertido desde solicitud inicia en `solicitud_recibida`.
- `creado` puede pasar únicamente a `en_revision` o `cancelado`. No permite avanzar directamente a producción, listo para entrega o entregado.
- La conversión desde solicitud guarda la prioridad definida por el usuario interno y una fecha estimada opcional validada server-side. Usa la numeración generada por base de datos y mantiene el estado inicial `solicitud_recibida`.
- Los dos flujos comparten los estados generales `creado`, `solicitud_recibida`, `en_revision`, `en_produccion`, `listo_entrega`, `entregado` y `cancelado`.
- En pedidos de tipo `encargo`, las tareas modelan el progreso real y condicionan el avance operativo mediante `public.actualizar_estado_pedido`.
- En pedidos de tipo `impresion`, las tareas no son obligatorias y el pedido puede avanzar por los mismos estados generales sin crearlas.
- `public.actualizar_estado_pedido` bloquea el pedido con `FOR UPDATE` y las tareas existentes con `FOR SHARE` durante la decisión.
- Para marcar `entregado`, `public.actualizar_estado_pedido` exige que
  `pedido_pagos.payment_status = 'pagado'`; los pedidos con total cero cumplen
  esta regla porque el resumen financiero queda `pagado`.
- Al marcar un pedido como `entregado`, `actual_delivery_date` usa la fecha local de negocio.
- Los cambios importantes de estado se registran en `pedido_historial`.
- La creación y la presentación se adaptan a cada `workflow_type`, pero no hay estados exclusivos de impresión.
- Los detalles específicos de impresión se guardan como descripción estructurada; no existen tablas normalizadas específicas de impresión.

**Notas de seguridad:**

- `admin` puede acceder a todos los pedidos.
- `supervisor` puede gestionar pedidos.
- `trabajador` solo debe leer pedidos donde esté asignado.

### `pedido_pagos`

**Proposito:** Guarda el resumen financiero 1:1 de un pedido. `pedidos`
mantiene el dominio operativo y `pedido_pagos` mantiene el dominio financiero.
No es una tabla de movimientos, abonos individuales ni comprobantes.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `pedido_id` | `uuid` | Clave primaria y FK al pedido. |
| `total_amount` | `numeric(12,2)` | Precio total del pedido. Puede ser `0`. |
| `paid_cash_amount` | `numeric(12,2)` | Monto pagado en efectivo. |
| `paid_transfer_amount` | `numeric(12,2)` | Monto pagado por transferencia. |
| `payment_status` | `pedido_pago_estado` | Estado calculado por trigger. |
| `paid_at` | `timestamptz nullable` | Fecha en que el resumen queda pagado. |
| `created_by` | `uuid nullable` | Perfil interno que creo el resumen si aplica. |
| `updated_by` | `uuid nullable` | Perfil interno que actualizo el resumen si aplica. |
| `created_at` | `timestamptz` | Fecha de creacion. |
| `updated_at` | `timestamptz` | Fecha de ultima actualizacion. |

**Claves foraneas:**

- `pedido_pagos.pedido_id` -> `pedidos.id` con `on delete cascade`.
- `pedido_pagos.created_by` -> `perfiles.id`.
- `pedido_pagos.updated_by` -> `perfiles.id`.

**Reglas importantes:**

- Cada pedido debe tener un unico resumen financiero.
- `total_amount >= 0`.
- `paid_cash_amount >= 0`.
- `paid_transfer_amount >= 0`.
- `paid_cash_amount + paid_transfer_amount <= total_amount`.
- Si `total_amount = 0`, el pedido se considera `pagado` y `paid_at` se setea.
- Si el total es mayor que cero y no hay monto pagado, el estado es `sin_pago`.
- Si el monto pagado es mayor que cero y menor que el total, el estado es `parcial`.
- Si el monto pagado coincide con el total, el estado es `pagado`.
- El trigger `private.set_pedido_payment_status()` recalcula siempre
  `payment_status` y mantiene `paid_at` coherente.
- Los pedidos existentes se rellenan con total cero y estado `pagado`.
- La creacion manual usa `public.crear_pedido_manual` para crear el pedido y su
  resumen financiero en una sola transaccion.
- La conversion desde solicitud usa `public.convertir_solicitud_a_pedido` para
  crear el pedido, su resumen financiero y asociar archivos en una sola
  transaccion.
- La actualizacion interna de pagos usa `public.actualizar_pago_pedido` para
  modificar solo efectivo y transferencia acumulados, mantener `updated_by` y
  registrar historial en una sola transaccion.
- El estado de pago `pagado` es condicion para que
  `public.actualizar_estado_pedido` pueda cerrar el pedido como `entregado`.

**Notas de seguridad:**

- RLS esta activo.
- Usuarios anonimos no acceden.
- Usuarios internos activos pueden leer el resumen si ya pueden acceder al pedido.
- Las modificaciones directas quedan restringidas a `admin` y `supervisor`.
- No se usa `service_role` ni se consulta `auth.users` para este modelo.

### `pedido_contadores`

**Propósito:** Controla la secuencia anual de números visibles de pedido.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `year` | `smallint` | Año de la secuencia. Clave primaria. |
| `last_number` | `integer` | Último número asignado dentro del año. |
| `updated_at` | `timestamptz` | Fecha de última actualización del contador. |

**Reglas importantes:**

- La numeración operativa interna de pedidos usa el formato `P-YY-XXXX`.
- La secuencia reinicia por año.
- La función privada `private.current_business_date()` devuelve la fecha de negocio para `America/Havana`.
- La función privada `private.generar_numero_pedido()` obtiene de esa fecha el año e incrementa el contador dentro de la transacción.
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
- La restricción única evita duplicados para la misma combinación `pedido_id` + `assigned_profile_id`.

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
- Las mutaciones solo se permiten en `creado`, `solicitud_recibida`,
  `en_revision` y `en_produccion`. En `listo_entrega`, `entregado` y
  `cancelado` las tareas quedan en modo lectura.

**Notas de seguridad:**

- RLS está activo.
- `admin`, `supervisor` y personal asignado pueden gestionar tareas de pedidos accesibles.
- El acceso se basa en `private.can_access_pedido(pedido_id)`.
- Usuarios anónimos no acceden.

### `trabajo_plantillas`

**Proposito:** Guarda la cabecera de plantillas de tareas para encargos, tambien llamadas trabajos predeterminados. Una plantilla no es un pedido real, no tiene estado operativo y no representa trabajo en curso.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `id` | `uuid` | Identificador unico de la plantilla. |
| `name` | `text` | Nombre visible de la plantilla. |
| `description` | `text nullable` | Descripcion interna opcional. |
| `is_active` | `boolean` | Permite ocultar plantillas sin eliminar su definicion historica. |
| `created_by` | `uuid nullable` | Perfil interno que creo la plantilla. |
| `updated_by` | `uuid nullable` | Perfil interno que actualizo la plantilla. |
| `created_at` | `timestamptz` | Fecha de creacion. |
| `updated_at` | `timestamptz` | Fecha de ultima actualizacion. |

**Claves foraneas:**

- `trabajo_plantillas.created_by` -> `perfiles.id`.
- `trabajo_plantillas.updated_by` -> `perfiles.id`.

**Reglas importantes:**

- El nombre no puede quedar vacio tras `trim` y debe medir entre 2 y 120 caracteres.
- La descripcion es opcional y tiene limite de 2000 caracteres.
- Las plantillas se usan como moldes para crear tareas nuevas en pedidos de tipo `encargo`.
- Aplicar una plantilla copia sus tareas a `pedido_tareas` mediante la RPC transaccional `public.aplicar_plantilla_tareas_pedido`.
- La copia agrega tareas al final del pedido y no reemplaza ni borra tareas existentes.
- Editar, desactivar o eliminar una plantilla no modifica pedidos existentes ni tareas ya copiadas.
- No hay sincronizacion viva entre plantilla y pedido.

**Notas de seguridad:**

- RLS esta activo.
- Usuarios internos autenticados y activos pueden leer plantillas activas.
- `admin` puede leer plantillas activas e inactivas y gestionarlas.
- Usuarios anonimos no acceden.

### `trabajo_plantilla_tareas`

**Proposito:** Guarda las tareas ordenadas de una plantilla. Estas filas describen tareas base para copiar a pedidos de tipo `encargo`, pero no guardan progreso real.

| Campo | Tipo sugerido | Notas |
|---|---|---|
| `id` | `uuid` | Identificador unico de la tarea de plantilla. |
| `template_id` | `uuid` | Plantilla a la que pertenece. |
| `title` | `text` | Texto de la tarea predeterminada. |
| `task_type` | `pedido_tarea_tipo` | Reutiliza el mismo enum que `pedido_tareas.task_type`. |
| `target_quantity` | `integer nullable` | Cantidad objetivo para tareas cuantificadas. |
| `sort_order` | `integer` | Orden dentro de la plantilla. |
| `created_at` | `timestamptz` | Fecha de creacion. |
| `updated_at` | `timestamptz` | Fecha de ultima actualizacion. |

**Claves foraneas:**

- `trabajo_plantilla_tareas.template_id` -> `trabajo_plantillas.id` con `on delete cascade`.

**Reglas importantes:**

- `title` no puede estar vacio y tiene limite de 200 caracteres.
- `sort_order` no puede ser negativo.
- Las tareas `simple` deben tener `target_quantity = null`.
- Las tareas `cuantificada` requieren `target_quantity > 0`.
- El orden visual se obtiene por `sort_order`, `created_at` e `id`; la gestion
  actual permite mover tareas arriba o abajo y normaliza el orden tras eliminar.
- La creacion y edicion desde Configuracion reutilizan el parseo de titulos de
  `pedido_tareas`: un entero positivo independiente crea una tarea
  `cuantificada`; sin cantidad crea una tarea `simple`.
- No existen `is_completed`, `completed_quantity`, `completed_at` ni `completed_by`, porque una plantilla no tiene avance.
- Al aplicar la plantilla, cada fila se copia como una tarea nueva e independiente en `pedido_tareas`.
- `pedido_tareas` sigue siendo la tabla real de tareas operativas y progreso del pedido.

**Notas de seguridad:**

- RLS esta activo.
- La lectura sigue la visibilidad de la plantilla padre: plantillas activas para usuarios internos activos y todas para `admin`.
- Crear, actualizar o eliminar tareas de plantilla queda reservado a `admin`, equivalente SQL del permiso `configuracion.manage`.
- Usuarios anonimos no acceden.

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
- En subidas internas de pedido, `visibility` se deriva del estado actual: revisión inicial usa `interno_pedido`, producción usa `avance` y listo para entrega usa `final_entrega`.
- Pedidos `entregado` o `cancelado` no aceptan nuevas subidas.
- Los archivos heredados desde una solicitud conservan `visibility = cliente_solicitud`, su ruta física y su relación de origen.

**Notas de seguridad:**

- No deben usarse URLs públicas permanentes.
- El acceso debe resolverse mediante reglas de Storage, RLS y URLs firmadas.
- Trabajadores solo deberían acceder a archivos de pedidos asignados.
- Un trabajador asignado puede subir la categoría derivada por el estado del pedido; RLS y Storage deben validar la misma correspondencia entre estado, categoría y carpeta.

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
- Los comentarios son append-only. No se editan ni eliminan desde la aplicación.

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
- Registra cambios relevantes de estado, asignaciones, archivos, tareas, pagos y
  cierre del pedido mediante RPCs y triggers controlados.

**Notas de seguridad:**

- Usuarios internos autorizados pueden leer historial según permisos sobre el pedido.
- La inserción debería ocurrir mediante acciones controladas de la aplicación o funciones seguras.
- No se debería permitir actualización o eliminación manual desde el cliente.
- La subfase 11.2 deja la inserción directa por tabla deshabilitada; las RPCs controladas, como `actualizar_estado_pedido` y `actualizar_pago_pedido`, mantienen el registro de cambios operativos.

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
- El contenido no puede estar vacío.
- El campo `content` tiene un límite inicial de 2000 caracteres.
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
- Los eventos automáticos se registran mediante triggers y RPCs para creación,
  archivos, cambios de estado, asociación o creación de cliente y conversión a
  pedido.

**Notas de seguridad:**

- Solo `admin` y `supervisor` pueden leer historial de solicitudes.
- La escritura se realiza mediante triggers y RPCs controlados; no hay inserción
  pública directa.
- `trabajador` no accede al historial de solicitudes.
- Usuarios anónimos no acceden.
- No se permite actualización ni eliminación manual desde el cliente.

## Relaciones principales

- Un cliente puede tener muchas solicitudes.
- Un cliente puede tener muchos pedidos.
- Una solicitud puede convertirse en un pedido.
- Una solicitud convertida y su pedido asociado comparten `public_reference`.
- Un pedido puede tener varios usuarios internos asignados.
- Un usuario interno puede estar asignado a varios pedidos.
- Un pedido tiene un resumen financiero unico en `pedido_pagos`.
- Un pedido puede tener muchas tareas.
- Una plantilla de trabajo puede tener muchas tareas predeterminadas.
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
- Todo pedido debe tener un resumen financiero 1:1 en `pedido_pagos`.
- El precio total puede ser cero y en ese caso el resumen queda `pagado`.
- Los archivos serán privados por defecto.
- El historial no será editable manualmente.
- Los clientes no tendrán cuenta de usuario en la primera versión.

## Estrategia de RLS

Row Level Security está activa en las tablas expuestas y se complementa con
policies de Storage y validaciones server-side.

| Rol o contexto | Acceso conceptual |
|---|---|
| `admin` | Puede acceder a todo el sistema. |
| `supervisor` | Puede gestionar solicitudes, clientes operativos, pedidos, asignaciones, archivos, comentarios e historial. |
| `trabajador` | Solo puede ver pedidos asignados y datos relacionados necesarios para trabajar. |
| Cliente externo | Solo puede insertar solicitudes públicas y hasta cinco archivos válidos mediante el flujo controlado. |
| Usuario no autenticado | No puede leer información interna. |

El bucket `godel-files` es privado. Las descargas internas validan permisos y
generan URLs firmadas de duración limitada; no hay lectura ni listado público.

## Índices principales

| Tabla | Campo |
|---|---|
| `solicitudes` | `cliente_id` |
| `solicitudes` | `created_at` |
| `solicitudes` | `status, created_at` |
| `solicitudes` | `public_reference` unico |
| `solicitudes` | `converted_order_id` único cuando no es `null` |
| `pedidos` | `cliente_id` |
| `pedidos` | `created_at` |
| `pedidos` | `status, created_at` |
| `pedidos` | `estimated_delivery_date` para pedidos activos |
| `pedidos` | `public_reference` unico |
| `pedidos` | `solicitud_id` único cuando no es `null` |
| `pedido_pagos` | `pedido_id` clave primaria |
| `pedido_pagos` | `payment_status` |
| `pedido_trabajadores` | `assigned_profile_id` |
| `pedido_tareas` | `pedido_id, sort_order` |
| `pedido_tareas` | `pedido_id, created_at` |
| `pedido_tareas` | `pedido_id, is_completed` |
| `trabajo_plantillas` | `is_active` |
| `trabajo_plantillas` | `name` |
| `trabajo_plantillas` | `created_at` |
| `trabajo_plantilla_tareas` | `template_id` |
| `trabajo_plantilla_tareas` | `template_id, sort_order` |
| `archivos` | `pedido_id, visibility, created_at` |
| `archivos` | `solicitud_id, visibility, created_at` |
| `pedido_comentarios` | `pedido_id, created_at` |
| `pedido_historial` | `pedido_id, created_at` |
| `solicitud_comentarios` | `solicitud_id, created_at` |
| `solicitud_comentarios` | `author_id` |
| `solicitud_historial` | `solicitud_id, created_at` |
| `solicitud_historial` | `actor_id` |
| `solicitud_historial` | `action` |

## Nota de Fase 11

El diagnóstico y diseño actualizado para comentarios internos e historial operativo se documenta en `docs/COMMENTS_AND_HISTORY_MODEL.md`. Ese documento debe usarse como referencia antes de crear nuevas migraciones relacionadas con comentarios o historial.

## Operaciones transaccionales principales

- `public.convertir_solicitud_a_pedido` crea el pedido, marca la solicitud como
  convertida y hereda sus archivos dentro de una sola transacción.
- En la conversion de solicitud a pedido, el pedido hereda exactamente el
  `public_reference` de la solicitud; no se genera un codigo nuevo.
- `public.crear_cliente_desde_solicitud` crea el cliente, registra historial y
  lo asocia a la solicitud de forma atómica.
- `public.actualizar_estado_pedido` serializa cambios de estado y valida tareas
  y pago completo antes de entregar.
- `public.actualizar_estado_solicitud` controla las transiciones manuales.

La evolución del esquema debe hacerse mediante nuevas migraciones y mantener
alineados los tipos generados de Supabase.
