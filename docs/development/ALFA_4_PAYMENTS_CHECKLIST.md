# Alfa 4 Payments Checklist

## Resumen arquitectonico

- `pedidos` conserva el dominio operativo: flujo, estado, cliente, fechas, tareas, archivos y asignaciones.
- `pedido_pagos` conserva el dominio financiero en una relacion 1:1 con `pedidos`.
- `pedido_pagos.payment_status` se calcula en base de datos desde total, efectivo y transferencia.
- `total_amount = 0` esta permitido y queda como `pagado`.
- La entrega queda bloqueada si `pedido_pagos.payment_status` no es `pagado`.
- La informacion de pago es interna y no se expone en `/estado`.

## Subfases completadas

- [x] Alfa 4.1 Modelo financiero separado.
- [x] Alfa 4.2 Precio en pedido manual.
- [x] Alfa 4.3 Precio en conversion solicitud a pedido.
- [x] Alfa 4.4 Gestion interna de pagos acumulados.
- [x] Alfa 4.5 Bloqueo de entrega sin pago completo.
- [x] Alfa 4.6 Listados, filtros y cierre financiero.

## Modulos afectados

- [x] Migraciones de Supabase.
- [x] `src/lib/pedidos`.
- [x] Formularios de creacion manual.
- [x] Conversion de solicitudes.
- [x] Detalle interno de pedido.
- [x] Listado interno de pedidos.
- [x] Historial de pedido.
- [x] Documentacion.

## Checklist funcional

- [x] Pedido manual con precio positivo crea `pedido_pagos`.
- [x] Pedido manual con precio cero queda `pagado`.
- [x] Conversion con precio positivo crea `pedido_pagos`.
- [x] Conversion con precio cero queda `pagado`.
- [x] Actualizacion de pago en efectivo.
- [x] Actualizacion de pago por transferencia.
- [x] Estado `sin_pago`.
- [x] Estado `parcial`.
- [x] Estado `pagado`.
- [x] Bloqueo de entrega sin pago completo.
- [x] Entrega permitida con pago completo.
- [x] Listado muestra estado de pago.
- [x] Filtro por estado de pago funciona.

## Checklist de seguridad

- [x] Sin acceso anonimo a pagos internos.
- [x] Sin `service_role`.
- [x] Sin `SUPABASE_SERVICE_ROLE_KEY`.
- [x] Sin consultas a `auth.users` desde codigo de aplicacion.
- [x] Sin Supabase desde Client Components para pagos.
- [x] Actualizacion de pagos limitada a `admin` y `supervisor`.
- [x] Entrega valida pago completo en RPC.
- [x] Public tracking no expone pagos.

## Deuda tecnica

- Movimientos de pago o abonos individuales.
- Comprobantes de transferencia.
- Recibos.
- Edicion controlada del total.
- Cierre de caja.
- Dashboard financiero.
- Exportes financieros.
- Filtros avanzados por deuda o monto pendiente.
