# Pedidos internos

`src/lib/pedidos` agrupa la lógica server-side del módulo interno de pedidos.

## `listInternalPedidos`

`listInternalPedidos` carga el listado de pedidos desde Server Components usando el cliente de Supabase configurado en `src/lib/supabase/server.ts`.

El servicio valida `pedidos.view`, permite filtrar por `pedido_estado`, ordena por `created_at`, limita la carga y respeta RLS como defensa final. No usa service role key.

## `getInternalPedidoById`

`getInternalPedidoById` carga el detalle interno de un pedido para `/dashboard/pedidos/[id]`.

Valida UUID, obtiene el perfil actual, valida `pedidos.view`, carga pedido, cliente, solicitud y personal asignado. Usa la relación explícita `solicitudes!pedidos_solicitud_id_fkey` para evitar ambigüedades.

El trabajador no accede a los módulos generales de clientes o solicitudes, pero RLS permite leer el cliente y la solicitud relacionados con pedidos que tiene asignados.

El trabajador tampoco accede al módulo general de usuarios. RLS de `profiles` solo le permite leer su propio perfil y datos básicos del personal asignado a pedidos que puede acceder, para que el detalle muestre nombres y roles del equipo asignado sin abrir un listado general de perfiles.

## Creación Manual

`/dashboard/pedidos/nuevo` permite crear pedidos manuales asociados a clientes existentes.

La action `createPedidoAction` lee únicamente `cliente_id`, `titulo`, `descripcion`, `prioridad` y `fecha_entrega_estimada`, y delega en `createInternalPedido`.

`createInternalPedido` requiere `pedidos.manage`, valida el input, valida el cliente, genera `numero_pedido`, crea el pedido con estado inicial `en_revision`, guarda `solicitud_id` como `null` y no asigna personal.

## Conversión Desde Solicitud

`createPedidoFromSolicitud` convierte una solicitud aprobada en pedido desde el detalle de solicitud.

La action del detalle de solicitud lee únicamente `solicitud_id`. El servicio requiere `solicitudes.manage` y `pedidos.manage`, exige estado `aprobada`, exige `cliente_id`, evita solicitudes ya convertidas, crea el pedido con `solicitud_id`, usa estado inicial `solicitud_recibida` y actualiza la solicitud a `convertida` con `converted_order_id`.

## Cambio de Estado

`/dashboard/pedidos/[id]` incluye `PedidoStatusForm`.

La action `updatePedidoStatusAction` lee únicamente `pedido_id` y `estado`, y delega en `updateInternalPedidoStatus`. El servicio valida `pedidos.change_status`, UUID y estado real, verifica acceso al pedido y usa la RPC segura existente `public.actualizar_estado_pedido`.

La RPC permite a `admin` y `supervisor` cambiar cualquier pedido y a `trabajador` cambiar solo pedidos asignados, sin conceder a trabajadores un `UPDATE` amplio sobre `pedidos`. Con asignaciones múltiples, cualquier trabajador asignado al pedido puede cambiar el estado porque la validación usa `private.is_assigned_to_order`, que comprueba la existencia de una relación en `pedido_trabajadores`.

Un `admin` o `supervisor` asignado a un pedido conserva sus permisos reales. La asignación operativa no cambia roles ni permisos, y un trabajador no asignado no puede cambiar el estado porque no pasa la validación de acceso del servicio ni la validación de la RPC.

## Asignación de Personal

`/dashboard/pedidos/[id]` incluye `PedidoWorkerAssignmentForm` para mostrar el personal asignado. Los usuarios con `pedidos.manage` ven controles para agregar y remover asignaciones; `trabajador` lo ve en modo lectura.

La action `assignPedidoWorkerAction` lee únicamente `pedido_id` y `trabajador_id`, y delega en `assignInternalPedidoWorker`.

La action `removePedidoWorkerAction` lee únicamente `pedido_id` y `trabajador_id`, y delega en `removeInternalPedidoWorker` para remover una asignación concreta.

La UI de detalle muestra múltiples usuarios asignados con su rol visible. El selector de alta oculta usuarios ya asignados cuando están en la lista de personal asignable; la restricción única `(pedido_id, trabajador_id)` y el servicio server-side siguen evitando duplicados.

`listAssignableWorkers` mantiene su nombre histórico, pero carga server-side personal interno activo con rol `admin`, `supervisor` o `trabajador`, ordenado por nombre. También se exporta el alias `listAssignableOrderUsers`.

`assignInternalPedidoWorker`:

- requiere `pedidos.manage`;
- valida UUID de pedido y usuario asignable;
- valida que el pedido exista;
- valida que el usuario destino exista, esté activo y tenga rol `admin`, `supervisor` o `trabajador`;
- no modifica el rol real ni los permisos del usuario asignado;
- usa las policies seguras existentes de `pedido_trabajadores`, que permiten insertar/eliminar solo a `admin` o `supervisor`;
- permite múltiples usuarios internos por pedido: inserta el usuario elegido si hace falta y no reemplaza ni elimina a los demás;
- evita duplicados comprobando primero la asignación y apoyándose en la restricción única `(pedido_id, trabajador_id)`;
- guarda `assigned_by` con el perfil que realiza la asignación y usa el default de `assigned_at`;
- no modifica estado, solicitud, `converted_order_id`, archivos ni datos generales del pedido.

`removeInternalPedidoWorker`:

- requiere `pedidos.manage`;
- valida UUID de pedido y usuario asignado;
- valida que el pedido exista;
- valida que la asignación exista;
- elimina solo la relación concreta `(pedido_id, trabajador_id)`;
- no elimina pedidos, perfiles, solicitudes ni modifica `converted_order_id`.

No se creó RPC nueva porque las policies existentes ya restringen inserción, actualización y eliminación de asignaciones a admin/supervisor. No se usa service role key. Trabajadores no pueden asignar ni remover personal.

## Comentarios Internos

`/dashboard/pedidos/[id]` incluye `PedidoCommentsSection` para listar y agregar comentarios internos del pedido.

`listPedidoComments` carga comentarios server-side desde `pedido_comentarios`, valida UUID, perfil interno, permiso `pedidos.view` y acceso al pedido. La consulta respeta RLS y ordena por `created_at` ascendente para lectura tipo conversación.

`createPedidoComment` valida UUID, perfil interno, permiso `pedidos.view`, acceso al pedido y contenido. El comentario es obligatorio, se guarda con `contenido` recortado y tiene límite de 2000 caracteres.

La action `createPedidoCommentAction` lee únicamente `pedido_id` y `contenido`. No acepta `user_id`, autor ni fechas desde el formulario. El autor se toma del perfil autenticado y se guarda como `pedido_comentarios.user_id`.

Los comentarios son append-only. No hay edición, eliminación, menciones, notificaciones, adjuntos ni registro automático adicional de historial en esta subfase.

## Alcance por Rol

- `admin` y `supervisor` ven todos los pedidos.
- `admin` y `supervisor` pueden ver el detalle de cualquier pedido.
- `admin` y `supervisor` pueden crear pedidos manuales.
- `admin` y `supervisor` pueden convertir solicitudes aprobadas en pedidos.
- `admin` y `supervisor` pueden cambiar el estado de cualquier pedido.
- `admin` y `supervisor` pueden asignar o remover personal interno activo de un pedido.
- `admin` y `supervisor` pueden ver y agregar comentarios internos en cualquier pedido.
- `admin` o `supervisor` asignados a un pedido siguen conservando sus permisos reales.
- `trabajador` ve solo pedidos asignados mediante `pedido_trabajadores`.
- `trabajador` solo puede ver el detalle si está asignado al pedido.
- `trabajador` puede ver cliente y solicitud asociados a pedidos asignados.
- `trabajador` puede cambiar el estado solo de pedidos asignados.
- `trabajador` puede ver y agregar comentarios internos solo en pedidos asignados.
- `trabajador` no puede crear, convertir, asignar ni remover asignaciones de pedidos.
- usuarios anónimos no pueden leer ni crear pedidos.

## Fuera de Esta Subfase

La edición general, la eliminación, notificaciones, comentarios de solicitudes e historial avanzado quedan para próximas subfases.
