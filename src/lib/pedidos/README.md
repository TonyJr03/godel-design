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

## Alcance por rol

- `admin` y `supervisor` ven todos los pedidos.
- `trabajador` ve solo pedidos asignados mediante `pedido_trabajadores`.
- usuarios anónimos no pueden leer pedidos.

## Fuera de esta subfase

El detalle funcional, la creación manual, la conversión de solicitudes a pedidos, el cambio de estado, la asignación de trabajadores, archivos, notificaciones e historial avanzado quedan para próximas subfases.
