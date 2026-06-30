# Public tracking contract

## Proposito

`src/lib/public-tracking` contiene el contrato server-side usado por la ruta
publica `/estado`. Su responsabilidad es consultar el estado publico de una
solicitud o pedido mediante `public_reference`, mapear la respuesta de la RPC a
un DTO minimo y devolver mensajes seguros para la UI publica.

La ruta publica no es una vista interna reducida. Es un contrato propio y debe
mantenerse por allowlist.

## Flujo actual

1. `/estado` recibe el parametro `ref`.
2. `getPublicTrackingStatus` normaliza el valor con
   `normalizePublicReference`.
3. El servicio valida el formato `GD-XXXX-XXXX` con
   `isValidPublicReference`.
4. Si el formato es valido, llama la RPC `consultar_estado_publico`.
5. La fila de RPC se mapea explicitamente con `mapPublicTrackingRow`.
6. La UI recibe solo `PublicTrackingStatusResult`.

La consulta siempre usa `public_reference`. No debe aceptar UUIDs internos ni
codigos operativos internos como codigo publico.

## DTO publico permitido

`PublicTrackingStatusResult` puede exponer solo estos campos:

| Campo TypeScript | Origen RPC | Uso publico |
|---|---|---|
| `kind` | `kind` | Indica si el resultado visible es `solicitud` o `pedido`. |
| `publicReference` | `public_reference` | Codigo publico `GD-XXXX-XXXX`. |
| `workflowType` | `workflow_type` | Flujo operativo publico: `encargo` o `impresion`. |
| `workflowLabel` | label local | Texto visible del flujo. |
| `status` | `status` | Estado tecnico ya permitido por la RPC publica. |
| `statusLabel` | label local | Texto visible del estado. |
| `statusDescription` | description local | Descripcion publica del estado. |
| `createdAt` | `created_at` | Fecha de recepcion o creacion. |
| `desiredDate` | `desired_date` | Fecha deseada para solicitudes, si existe. |
| `estimatedDeliveryDate` | `estimated_delivery_date` | Fecha estimada de entrega para pedidos, si existe. |
| `actualDeliveryDate` | `actual_delivery_date` | Fecha real de entrega para pedidos, si existe. |
| `progress` | `progress_percentage`, `progress_label` | Progreso agregado sin nombres de tareas. |

No se debe pasar una fila cruda de Supabase/RPC a componentes publicos.
El mapper debe construir el DTO campo por campo.

## Campos prohibidos

`/estado` nunca debe exponer:

- id interno de solicitud;
- id interno de pedido;
- id interno de cliente;
- `order_number`;
- cliente;
- telefono;
- correo;
- descripcion;
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

- La UI publica debe depender solo de `PublicTrackingStatusResult`.
- Los errores publicos deben ser genericos y seguros.
- Cualquier dato nuevo en el DTO debe considerarse cambio de seguridad publica.
- Antes de ampliar el contrato hay que revisar RLS/RPC, este README,
  `docs/project-standards/checklists/CHECKLIST_PUBLIC_ROUTE_SECURITY.md` y
  ejecutar `npm.cmd run audit:public-tracking`.
- Si se toca la RPC, el cambio debe vivir en una migracion nueva y actualizar
  los tipos generados segun las reglas de base de datos.

## Auditoria automatica

`npm.cmd run audit:public-tracking` revisa codigo de:

- `src/lib/public-tracking`;
- `src/app/estado`;
- `src/components/tracking`.

El script busca terminos internos sensibles en archivos de codigo. La
documentacion puede mencionarlos para explicar campos prohibidos, pero el codigo
del tracking publico no debe incorporarlos ni renderizarlos.
