# Flujo de Pedidos — Godel Design

## Propósito

Este documento describe cómo el equipo interno crea, consulta, convierte, gestiona estados y asigna responsables a pedidos dentro del sistema de gestión operativa de Godel Diseño.

## Alcance actual

El módulo de pedidos incluye actualmente:

- listado interno de pedidos;
- filtro básico por estado;
- detalle de pedido;
- creación manual de pedido;
- conversión de solicitud aprobada a pedido;
- cambio de estado de pedido;
- asignación de personal interno;
- visibilidad limitada para trabajadores asignados.

Todavía no incluye:

- edición general de pedido;
- eliminación de pedido;
- archivos privados del pedido;
- historial avanzado de cambios;
- comentarios internos;
- notificaciones;
- reportes o estadísticas;
- responsables funcionales avanzados por pedido.

## Rutas del módulo

| Ruta | Uso |
|---|---|
| `/dashboard/pedidos` | Listado interno de pedidos y filtro básico por estado. |
| `/dashboard/pedidos/[id]` | Detalle interno, cambio de estado y asignación de personal para `admin` y `supervisor`. |
| `/dashboard/pedidos/nuevo` | Creación manual de pedido. |

## Roles y permisos

| Rol | Acceso actual |
|---|---|
| `admin` | Puede ver y gestionar todos los pedidos. |
| `supervisor` | Puede ver y gestionar todos los pedidos. |
| `trabajador` | Puede ver pedidos asignados y cambiar su estado. No puede crear pedidos, convertir solicitudes ni asignar personal. |

Permisos usados:

- `pedidos.view`
- `pedidos.manage`
- `pedidos.change_status`
- `solicitudes.manage`, usado en la conversión desde solicitud.

La definición conceptual de roles y permisos está en `docs/PERMISSIONS_MODEL.md`.

## RLS y seguridad

Row Level Security restringe la lectura de pedidos según rol y asignación:

- `admin` y `supervisor` pueden leer todos los pedidos.
- `trabajador` solo puede leer pedidos asignados.
- `trabajador` puede leer datos de cliente y solicitud solo cuando están relacionados con pedidos asignados.
- usuarios anónimos no pueden leer pedidos.

La interfaz no es la única capa de seguridad. Los servicios server-side validan permisos antes de operar y RLS queda como defensa final. No se usa service role key en el flujo de pedidos.

## Modelo de datos de pedido

Campos principales usados actualmente en `pedidos`:

| Campo | Uso |
|---|---|
| `id` | Identificador interno del pedido. |
| `numero_pedido` | Referencia visible generada en servidor. |
| `cliente_id` | Cliente asociado al pedido. |
| `solicitud_id` | Solicitud origen; puede ser `null` en pedidos manuales. |
| `titulo` | Nombre breve del trabajo. |
| `descripcion` | Descripción operativa del trabajo. |
| `estado` | Estado operativo del pedido. |
| `prioridad` | Prioridad del pedido. |
| `fecha_creacion` | Fecha operativa de creación. |
| `fecha_entrega_estimada` | Fecha prevista de entrega. |
| `fecha_entrega_real` | Fecha real de entrega si aplica. |
| `creado_por` | Perfil interno que creó el pedido. |
| `supervisor_id` | Supervisor asociado cuando aplica. |
| `created_at` | Fecha de creación del registro. |
| `updated_at` | Fecha de última actualización. |

La asignación se guarda en `pedido_trabajadores`, que funciona como asignación de personal interno a pedidos. La asignación responsable simple de Fase 8 evoluciona en Fase 9 hacia asignaciones múltiples: un pedido puede tener varios usuarios internos asignados y un usuario interno puede estar asignado a varios pedidos. Pueden asignarse perfiles activos con rol `admin`, `supervisor` o `trabajador`; esta asignación indica participación operativa y no cambia el rol real ni los permisos del usuario.

Reglas actuales:

- `cliente_id` es requerido para crear pedidos desde los flujos implementados.
- `solicitud_id` es `null` en pedidos manuales.
- `numero_pedido` se genera en servidor.

## Estados de pedido

| Estado | Significado |
|---|---|
| `solicitud_recibida` | Pedido creado desde una solicitud, pendiente de revisión operativa. |
| `en_revision` | Pedido en revisión interna. |
| `cotizado` | Pedido cotizado. |
| `aprobado_cliente` | Pedido aprobado por el cliente. |
| `en_diseno` | Trabajo en fase de diseño. |
| `en_produccion` | Trabajo en fase de producción. |
| `listo_entrega` | Pedido listo para entregar. |
| `entregado` | Pedido entregado. |
| `cancelado` | Pedido cancelado. |

Un pedido manual inicia en `en_revision`. Un pedido convertido desde solicitud inicia en `solicitud_recibida`. El cambio de estado se realiza desde el detalle de pedido. Un trabajador solo puede cambiar el estado si está asignado al pedido.

## Listado interno

Archivos principales:

- Página: `src/app/dashboard/pedidos/page.tsx`
- Servicio: `src/lib/pedidos/list-internal-pedidos.ts`
- Componente: `src/components/pedidos/InternalPedidosList.tsx`

El listado carga server-side. `admin` y `supervisor` ven todos los pedidos; `trabajador` ve solo pedidos asignados. El filtro por estado usa parámetros GET. El componente visual no consulta Supabase. La consulta usa relación explícita con solicitudes para evitar ambigüedad de PostgREST.

## Detalle de pedido

Archivos principales:

- Ruta: `/dashboard/pedidos/[id]`
- Servicio: `src/lib/pedidos/get-internal-pedido-by-id.ts`
- Componente: `src/components/pedidos/InternalPedidoDetail.tsx`

El detalle carga server-side, valida UUID, permiso y alcance por rol. Muestra cliente, solicitud y personal asignado cuando existe. Un trabajador no puede ver pedidos no asignados, pero sí puede ver el cliente y la solicitud relacionados con pedidos que tiene asignados. No implementa edición general.

## Creación manual

Archivos principales:

- Ruta: `/dashboard/pedidos/nuevo`
- Action: `src/app/dashboard/pedidos/nuevo/actions.ts`
- Servicio: `src/lib/pedidos/create-internal-pedido.ts`
- Formulario: `src/components/pedidos/PedidoForm.tsx`
- Validación: `src/lib/pedidos/order-validation.ts`
- Número de pedido: `src/lib/pedidos/order-number.ts`

La creación manual requiere `pedidos.manage`, por lo que solo `admin` y `supervisor` pueden usarla. El formulario selecciona un cliente existente y no acepta estado, `solicitud_id`, número de pedido ni personal asignado. El pedido manual se crea con `solicitud_id = null` y estado inicial `en_revision`.

## Conversión de solicitud a pedido

Archivos principales:

- Servicio: `src/lib/pedidos/create-pedido-from-solicitud.ts`
- Componente: `src/components/solicitudes/SolicitudConvertPedidoForm.tsx`
- Action: `src/app/dashboard/solicitudes/[id]/actions.ts`

La conversión requiere `solicitudes.manage` y `pedidos.manage`. Solo se permite convertir solicitudes con estado `aprobada` y `cliente_id` asociado. El formulario solo envía `solicitud_id`; no acepta datos de pedido desde `FormData`.

Al convertir:

- se crea un pedido con `pedidos.solicitud_id`;
- se actualiza `solicitudes.estado = convertida`;
- se actualiza `solicitudes.converted_order_id`;
- se evita doble conversión mediante validaciones y una restricción única existente;
- no se asigna personal.

Flujos relacionados:

- `docs/PUBLIC_REQUEST_FLOW.md`
- `docs/INTERNAL_REQUESTS_FLOW.md`
- `docs/CLIENTS_FLOW.md`

## Cambio de estado

Archivos principales:

- Action: `src/app/dashboard/pedidos/[id]/actions.ts`
- Servicio: `src/lib/pedidos/update-internal-pedido-status.ts`
- Componente: `src/components/pedidos/PedidoStatusForm.tsx`
- Estados: `src/lib/pedidos/status.ts`
- RPC: `public.actualizar_estado_pedido`

La action solo acepta `pedido_id` y `estado`. El estado se valida server-side contra el enum real. La actualización usa la RPC segura `public.actualizar_estado_pedido`, que evita abrir un `UPDATE` amplio sobre `pedidos` para trabajadores.

Un trabajador solo puede cambiar el estado de pedidos asignados. Este flujo no modifica solicitudes ni `converted_order_id`.

## Asignación de personal

Archivos principales:

- Listado de personal asignable: `src/lib/pedidos/list-assignable-workers.ts`
- Servicio de asignación: `src/lib/pedidos/assign-internal-pedido-worker.ts`
- Componente: `src/components/pedidos/PedidoWorkerAssignmentForm.tsx`
- Action: `src/app/dashboard/pedidos/[id]/actions.ts`

Solo `admin` y `supervisor` pueden asignar o remover personal. El listado devuelve perfiles activos con rol `admin`, `supervisor` o `trabajador`. El servicio valida UUID de pedido y usuario, verifica que el usuario exista, esté activo y tenga un rol asignable, y no reemplaza automáticamente otras asignaciones.

Asignar un `admin` o `supervisor` no modifica su rol ni degrada sus permisos. Un trabajador asignado puede ver el pedido y cambiar su estado según la regla de la fase anterior. No se implementan historial avanzado ni notificaciones.

## Seguridad general

Capas de seguridad aplicadas:

1. Proxy por rol.
2. Validación server-side de permisos.
3. Validación server-side de UUID e input.
4. RPC segura para cambio de estado.
5. RLS en Supabase.
6. Errores controlados sin detalles técnicos.

Aclaraciones:

- no se usa service role key;
- los componentes cliente no consultan Supabase directamente;
- los formularios no aceptan campos internos;
- trabajadores no pueden crear, convertir ni asignar pedidos;
- trabajadores no acceden a los módulos generales de clientes o solicitudes, aunque RLS permite leer datos relacionados con pedidos asignados.

## Qué no incluye esta fase

- edición general de pedido;
- eliminación;
- archivos;
- historial avanzado;
- comentarios internos;
- notificaciones;
- reportes;
- facturación;
- múltiples responsables avanzados;
- reglas automáticas complejas de transición de estados.

## Consideraciones futuras

Más adelante se podrá:

- agregar archivos privados del pedido;
- registrar historial de cambios;
- agregar comentarios internos;
- implementar notificaciones;
- mejorar reglas de transición de estado;
- agregar reportes de producción;
- crear vistas por carga de trabajo;
- implementar edición controlada de campos del pedido.

## Pruebas manuales recomendadas

- Verificar que `admin` ve todos los pedidos.
- Verificar que `supervisor` ve todos los pedidos.
- Verificar que `trabajador` ve solo pedidos asignados.
- Probar el filtro por estado.
- Abrir detalle como `admin`.
- Abrir detalle como `supervisor`.
- Abrir detalle como trabajador asignado.
- Verificar que un trabajador no abre un pedido no asignado.
- Crear pedido manual.
- Verificar que el pedido manual tiene `solicitud_id = null`.
- Convertir una solicitud aprobada con cliente.
- Verificar que se crea pedido con `solicitud_id`.
- Verificar que la solicitud queda `convertida`.
- Verificar que se guarda `converted_order_id`.
- Intentar doble conversión.
- Cambiar estado como `admin`.
- Cambiar estado como `supervisor`.
- Cambiar estado como trabajador asignado.
- Verificar que un trabajador no cambia un pedido no asignado.
- Asignar personal como `admin` o `supervisor`.
- Verificar que se puede asignar un `admin`, un `supervisor` y un `trabajador` activos.
- Verificar que no se pueden asignar usuarios inactivos.
- Verificar que el trabajador asignado ve el pedido.
- Verificar que no se modifican solicitudes al cambiar estado o asignar personal.

## Cierre

Después de esta documentación corresponde realizar la revisión final de la Fase 8 antes de pasar a la siguiente fase del roadmap.
