# Public tracking contract

## Propósito

`src/lib/public-tracking` contiene el contrato server-side usado por la ruta
pública `/estado`. Su responsabilidad es consultar el estado público de una
solicitud o pedido mediante `public_reference`, mapear la respuesta de la RPC a
un DTO mínimo y devolver mensajes seguros para la UI pública.

La ruta pública no es una vista interna reducida. Es un contrato propio y debe
mantenerse por allowlist.

## Flujo actual

1. `/estado` recibe el parámetro `ref`.
2. `getPublicTrackingStatus` normaliza el valor con
   `normalizePublicReference`.
3. El servicio valida el formato `GD-XXXX-XXXX` con
   `isValidPublicReference`.
4. Si el formato es válido, llama la RPC `consultar_estado_publico`.
5. La fila de RPC se mapea explícitamente con `mapPublicTrackingRow`.
6. La UI recibe solo `PublicTrackingStatusResult`.

La consulta siempre usa `public_reference`. No debe aceptar UUIDs internos ni
códigos operativos internos como código público.

## DTO público permitido

`PublicTrackingStatusResult` puede exponer solo estos campos:

| Campo TypeScript | Origen RPC | Uso público |
|---|---|---|
| `kind` | `kind` | Indica si el resultado visible es `solicitud` o `pedido`. |
| `publicReference` | `public_reference` | Código público `GD-XXXX-XXXX`. |
| `workflowType` | `workflow_type` | Flujo operativo público: `encargo` o `impresion`. |
| `workflowLabel` | label local | Texto visible del flujo. |
| `status` | `status` | Estado técnico ya permitido por la RPC pública. |
| `statusLabel` | label local | Texto visible del estado. |
| `statusDescription` | description local | Descripción pública del estado. |
| `createdAt` | `created_at` | Fecha de recepción o creación. |
| `desiredDate` | `desired_date` | Fecha deseada para solicitudes, si existe. |
| `estimatedDeliveryDate` | `estimated_delivery_date` | Fecha estimada de entrega para pedidos, si existe. |
| `actualDeliveryDate` | `actual_delivery_date` | Fecha real de entrega para pedidos, si existe. |
| `progress` | `progress_percentage`, `progress_label` | Progreso agregado sin nombres de tareas. |

No se debe pasar una fila cruda de Supabase/RPC a componentes públicos.
El mapper debe construir el DTO campo por campo.

## Campos prohibidos

`/estado` nunca debe exponer:

- id interno de solicitud;
- id interno de pedido;
- id interno de cliente;
- `order_number`;
- cliente;
- teléfono;
- correo;
- descripción;
- notas;
- archivos;
- `file_path`;
- bucket;
- rutas privadas;
- signed URLs;
- comentarios internos;
- historial interno;
- pagos;
- deuda;
- estado financiero;
- tablas o datos de `pedido_pagos`;
- nombres de tareas;
- personal asignado;
- perfiles internos;
- metadata cruda;
- errores SQL, Postgres o Supabase.

## Reglas de seguridad

- La UI pública debe depender solo de `PublicTrackingStatusResult`.
- Los errores públicos deben ser genéricos y seguros.
- Cualquier dato nuevo en el DTO debe considerarse cambio de seguridad pública.
- Antes de ampliar el contrato hay que revisar RLS/RPC, este README,
  `docs/project-standards/checklists/CHECKLIST_PUBLIC_ROUTE_SECURITY.md` y
  ejecutar `npm.cmd run audit:public-tracking`.
- Si se toca la RPC, el cambio debe vivir en una migración nueva y actualizar
  los tipos generados según las reglas de base de datos.

## Auditoría automática

`npm.cmd run audit:public-tracking` revisa código de:

- `src/lib/public-tracking`;
- `src/app/(publico)/estado`;
- `src/components/tracking`.

El script busca términos internos sensibles en archivos de código. La
documentación puede mencionarlos para explicar campos prohibidos, pero el código
del tracking público no debe incorporarlos ni renderizarlos.
