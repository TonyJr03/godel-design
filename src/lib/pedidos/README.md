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

La conversión desde solicitud queda para una subfase posterior.

## Alcance por rol

- `admin` y `supervisor` ven todos los pedidos.
- `admin` y `supervisor` pueden ver el detalle de cualquier pedido.
- `admin` y `supervisor` pueden crear pedidos manuales.
- `trabajador` ve solo pedidos asignados mediante `pedido_trabajadores`.
- `trabajador` solo puede ver el detalle si está asignado al pedido.
- `trabajador` no puede crear pedidos.
- usuarios anónimos no pueden leer ni crear pedidos.

## Fuera de esta subfase

La conversión de solicitudes a pedidos, el cambio de estado, la asignación de trabajadores, la edición, la eliminación, archivos, notificaciones e historial avanzado quedan para próximas subfases.
