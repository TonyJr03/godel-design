# Pedidos internos

`src/lib/pedidos` agrupa la lógica server-side del módulo interno de pedidos.

## `listInternalPedidos`

`listInternalPedidos` carga el listado de pedidos desde Server Components usando el cliente de Supabase configurado en `src/lib/supabase/server.ts`.

El servicio:

- obtiene el perfil actual con `getCurrentProfile`;
- valida el permiso `pedidos.view`;
- permite filtrar por estado real del enum `pedido_estado`;
- ordena por `created_at` descendente;
- limita la carga a un máximo razonable;
- no usa service role key;
- devuelve mensajes seguros para la interfaz;
- respeta RLS como defensa final.

## `getInternalPedidoById`

`getInternalPedidoById` carga el detalle interno de un pedido para la ruta `/dashboard/pedidos/[id]`.

El servicio:

- valida que el identificador tenga formato UUID antes de consultar;
- obtiene el perfil actual con `getCurrentProfile`;
- valida el permiso `pedidos.view`;
- carga el pedido, cliente asociado, solicitud asociada y trabajadores asignados;
- usa la relación explícita `solicitudes!pedidos_solicitud_id_fkey` para evitar ambigüedades;
- no usa service role key;
- devuelve errores controlados sin exponer detalles técnicos;
- respeta RLS como defensa final.

## Creación manual

La ruta `/dashboard/pedidos/nuevo` permite crear pedidos manuales asociados a clientes existentes.

La action `createPedidoAction` lee únicamente `cliente_id`, `titulo`, `descripcion`, `prioridad` y `fecha_entrega_estimada` desde `FormData`, y delega la lógica en `createInternalPedido`.

El servicio `createInternalPedido`:

- requiere el permiso `pedidos.manage`;
- valida el input con `validatePedidoInput`;
- valida que el cliente exista y sea accesible;
- genera `numero_pedido` en servidor con `generatePedidoNumber`;
- crea el pedido con estado inicial `en_revision`;
- guarda `solicitud_id` como `null`;
- guarda `creado_por` con el perfil actual;
- no acepta estado desde el formulario;
- no acepta solicitud desde el formulario;
- no asigna trabajadores;
- no modifica solicitudes ni `converted_order_id`;
- no usa service role key.

## Conversión desde solicitud

`createPedidoFromSolicitud` convierte una solicitud aprobada en pedido desde el detalle de solicitud.

La action del detalle de solicitud lee únicamente `solicitud_id` desde `FormData` y delega la lógica en el servicio.

El servicio:

- requiere `solicitudes.manage` y `pedidos.manage`;
- valida UUID server-side;
- solo permite solicitudes con estado `aprobada`;
- requiere que la solicitud tenga `cliente_id`;
- impide convertir solicitudes con `converted_order_id`;
- crea el pedido con `solicitud_id`;
- usa estado inicial `solicitud_recibida`;
- genera `numero_pedido` en servidor con `generatePedidoNumber`;
- actualiza `solicitudes.estado` a `convertida`;
- actualiza `solicitudes.converted_order_id` con el pedido creado;
- no acepta datos de pedido desde el formulario;
- no crea ni modifica clientes;
- no asigna trabajadores;
- no usa service role key.

## Cambio de Estado

La ruta `/dashboard/pedidos/[id]` incluye el formulario `PedidoStatusForm` para cambiar el estado del pedido.

La action `updatePedidoStatusAction` lee únicamente `pedido_id` y `estado` desde `FormData`, y delega la lógica en `updateInternalPedidoStatus`.

El servicio `updateInternalPedidoStatus`:

- requiere el permiso `pedidos.change_status`;
- valida UUID server-side;
- valida el estado contra el enum real `pedido_estado`;
- verifica que el pedido exista y sea accesible para el usuario actual;
- usa la RPC segura existente `public.actualizar_estado_pedido`;
- no usa `update` directo desde el cliente de aplicación;
- no acepta ni modifica columnas distintas desde el formulario;
- no usa service role key.

La RPC `public.actualizar_estado_pedido` ya estaba definida en la migración inicial. Permite a `admin` y `supervisor` cambiar cualquier pedido y a `trabajador` cambiar solo pedidos asignados, sin conceder a trabajadores un `UPDATE` amplio sobre `pedidos`.

## Alcance por rol

- `admin` y `supervisor` ven todos los pedidos.
- `admin` y `supervisor` pueden ver el detalle de cualquier pedido.
- `admin` y `supervisor` pueden crear pedidos manuales.
- `admin` y `supervisor` pueden convertir solicitudes aprobadas en pedidos.
- `admin` y `supervisor` pueden cambiar el estado de cualquier pedido.
- `trabajador` ve solo pedidos asignados mediante `pedido_trabajadores`.
- `trabajador` solo puede ver el detalle si está asignado al pedido.
- `trabajador` puede cambiar el estado solo de pedidos asignados.
- `trabajador` no puede crear ni convertir pedidos.
- usuarios anónimos no pueden leer ni crear pedidos.

## Fuera de Esta Subfase

La asignación de trabajadores, la edición general, la eliminación, archivos, notificaciones e historial avanzado quedan para próximas subfases.
