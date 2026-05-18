# Pedidos internos

`src/lib/pedidos` agrupa la lógica server-side del módulo interno de pedidos.

## `listInternalPedidos`

`listInternalPedidos` carga el listado de pedidos desde Server Components usando el cliente de Supabase configurado en `src/lib/supabase/server.ts`.

El servicio valida `pedidos.view`, permite filtrar por `pedido_estado`, ordena por `created_at`, limita la carga y respeta RLS como defensa final. No usa service role key.

## `getInternalPedidoById`

`getInternalPedidoById` carga el detalle interno de un pedido para `/dashboard/pedidos/[id]`.

Valida UUID, obtiene el perfil actual, valida `pedidos.view`, carga pedido, cliente, solicitud y trabajadores asignados. Usa la relación explícita `solicitudes!pedidos_solicitud_id_fkey` para evitar ambigüedades.

## Creación Manual

`/dashboard/pedidos/nuevo` permite crear pedidos manuales asociados a clientes existentes.

La action `createPedidoAction` lee únicamente `cliente_id`, `titulo`, `descripcion`, `prioridad` y `fecha_entrega_estimada`, y delega en `createInternalPedido`.

`createInternalPedido` requiere `pedidos.manage`, valida el input, valida el cliente, genera `numero_pedido`, crea el pedido con estado inicial `en_revision`, guarda `solicitud_id` como `null` y no asigna trabajadores.

## Conversión Desde Solicitud

`createPedidoFromSolicitud` convierte una solicitud aprobada en pedido desde el detalle de solicitud.

La action del detalle de solicitud lee únicamente `solicitud_id`. El servicio requiere `solicitudes.manage` y `pedidos.manage`, exige estado `aprobada`, exige `cliente_id`, evita solicitudes ya convertidas, crea el pedido con `solicitud_id`, usa estado inicial `solicitud_recibida` y actualiza la solicitud a `convertida` con `converted_order_id`.

## Cambio de Estado

`/dashboard/pedidos/[id]` incluye `PedidoStatusForm`.

La action `updatePedidoStatusAction` lee únicamente `pedido_id` y `estado`, y delega en `updateInternalPedidoStatus`. El servicio valida `pedidos.change_status`, UUID y estado real, verifica acceso al pedido y usa la RPC segura existente `public.actualizar_estado_pedido`.

La RPC permite a `admin` y `supervisor` cambiar cualquier pedido y a `trabajador` cambiar solo pedidos asignados, sin conceder a trabajadores un `UPDATE` amplio sobre `pedidos`.

## Asignación de Trabajador

`/dashboard/pedidos/[id]` incluye `PedidoWorkerAssignmentForm` solo para usuarios con `pedidos.manage`.

La action `assignPedidoWorkerAction` lee únicamente `pedido_id` y `trabajador_id`, y delega en `assignInternalPedidoWorker`.

`listAssignableWorkers` carga server-side perfiles activos con rol `trabajador`, ordenados por nombre.

`assignInternalPedidoWorker`:

- requiere `pedidos.manage`;
- valida UUID de pedido y trabajador;
- valida que el pedido exista;
- valida que el trabajador destino exista, esté activo y tenga rol `trabajador`;
- usa las policies seguras existentes de `pedido_trabajadores`, que permiten insertar/eliminar solo a `admin` o `supervisor`;
- para esta subfase mantiene una asignación responsable simple: inserta el trabajador elegido si hace falta y elimina otras asignaciones del pedido;
- no modifica estado, solicitud, `converted_order_id`, archivos ni datos generales del pedido.

No se creó RPC nueva porque las policies existentes ya restringen inserción, actualización y eliminación de asignaciones a admin/supervisor. Trabajadores no pueden asignar trabajadores.

## Alcance por Rol

- `admin` y `supervisor` ven todos los pedidos.
- `admin` y `supervisor` pueden ver el detalle de cualquier pedido.
- `admin` y `supervisor` pueden crear pedidos manuales.
- `admin` y `supervisor` pueden convertir solicitudes aprobadas en pedidos.
- `admin` y `supervisor` pueden cambiar el estado de cualquier pedido.
- `admin` y `supervisor` pueden asignar o cambiar el trabajador responsable.
- `trabajador` ve solo pedidos asignados mediante `pedido_trabajadores`.
- `trabajador` solo puede ver el detalle si está asignado al pedido.
- `trabajador` puede cambiar el estado solo de pedidos asignados.
- `trabajador` no puede crear, convertir ni asignar pedidos.
- usuarios anónimos no pueden leer ni crear pedidos.

## Fuera de Esta Subfase

La edición general, la eliminación, archivos, notificaciones, comentarios internos e historial avanzado quedan para próximas subfases.
