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
- archivos privados internos del pedido;
- comentarios internos de pedido;
- visibilidad limitada para trabajadores asignados.

Todavía no incluye:

- edición general de pedido;
- eliminación de pedido;
- historial avanzado de cambios;
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
- `trabajador` puede leer datos básicos del personal asignado a pedidos que puede acceder, pero no puede listar perfiles internos en general.
- usuarios anónimos no pueden leer pedidos.

La interfaz no es la única capa de seguridad. Los servicios server-side validan permisos antes de operar y RLS queda como defensa final. No se usa service role key en el flujo de pedidos.

## Modelo de datos de pedido

Campos principales usados actualmente en `pedidos`:

| Campo | Uso |
|---|---|
| `id` | Identificador interno del pedido. |
| `order_number` | Referencia visible generada en servidor. |
| `cliente_id` | Cliente asociado al pedido; puede ser `null` en pedidos manuales. |
| `solicitud_id` | Solicitud origen; puede ser `null` en pedidos manuales. |
| `title` | Nombre breve del trabajo. |
| `description` | Descripción operativa del trabajo. |
| `status` | Estado operativo del pedido. |
| `priority` | Prioridad del pedido. |
| `estimated_delivery_date` | Fecha prevista de entrega. |
| `actual_delivery_date` | Fecha real de entrega si aplica. |
| `created_by` | Perfil interno que creó el pedido. |
| `created_at` | Fecha de creación del registro. |
| `updated_at` | Fecha de última actualización. |

La asignación se guarda en `pedido_trabajadores`, que funciona como asignación de personal interno a pedidos. La asignación responsable simple de Fase 8 evoluciona en Fase 9 hacia asignaciones múltiples: un pedido puede tener varios usuarios internos asignados y un usuario interno puede estar asignado a varios pedidos. Pueden asignarse perfiles activos con rol `admin`, `supervisor` o `trabajador`; esta asignación indica participación operativa y no cambia el rol real ni los permisos del usuario.

Reglas actuales:

- `cliente_id` es opcional en la creación manual y requerido al convertir una solicitud en pedido.
- `solicitud_id` es `null` en pedidos manuales.
- `order_number` se genera en servidor.

Las tablas oficiales normalizadas para comentarios e historial de pedidos son `pedido_comentarios` y `pedido_historial`. El enum de eventos de historial de pedidos es `pedido_historial_action`. Los comentarios de pedido están implementados en el detalle interno y son append-only. El historial de pedido está visible en el detalle interno y muestra los eventos existentes en `pedido_historial`.

## Estados de pedido

| Estado | Significado |
|---|---|
| `solicitud_recibida` | Pedido creado desde una solicitud, pendiente de revisión operativa. |
| `en_revision` | Pedido en revisión interna. |
| `en_produccion` | Trabajo en fase de producción. |
| `listo_entrega` | Pedido listo para entregar. |
| `entregado` | Pedido entregado. |
| `cancelado` | Pedido cancelado. |

Un pedido manual inicia en `en_revision`. Un pedido convertido desde solicitud inicia en `solicitud_recibida`. El flujo general esperado es `solicitud_recibida` -> `en_revision` -> `en_produccion` -> `listo_entrega` -> `entregado` para pedidos convertidos y `en_revision` -> `en_produccion` -> `listo_entrega` -> `entregado` para pedidos manuales. `cancelado` funciona como salida lateral.

Los estados de pedido representan solo la fase general del flujo operativo. El progreso real de diseño, impresión, encuadernado u otras tareas se modela con tareas de pedido, y la RPC `public.actualizar_estado_pedido` aplica las reglas operativas fuertes.

Reglas de transición vigentes:

- `solicitud_recibida` puede pasar a `en_revision` o `cancelado`.
- `en_revision` puede pasar a `en_produccion` o `cancelado`; para pasar a `en_produccion` debe existir al menos una tarea.
- `en_produccion` puede pasar a `listo_entrega` o `cancelado`; para pasar a `listo_entrega` debe existir al menos una tarea y todas deben estar completadas.
- `listo_entrega` puede pasar a `entregado`, volver a `en_produccion` o pasar a `cancelado`.
- `entregado` y `cancelado` son estados cerrados y no admiten cambios posteriores.

La UI del detalle usa el progreso ya cargado para orientar al usuario, pero la validación real está en la RPC. Un trabajador asignado puede cambiar estado siguiendo las mismas reglas; un trabajador no asignado no accede al pedido.

## Modelo base de tareas

La base de datos incluye `pedido_tareas` para representar el progreso operativo real de un pedido. Cada tarea pertenece a un pedido y puede ser:

- `simple`: tarea sin cantidades.
- `cuantificada`: tarea con `target_quantity` y `completed_quantity`.

El usuario escribirá tareas en lenguaje normal. La detección automática vive en servicios server-side de TypeScript: un título sin números independientes crea una tarea `simple`; un único entero positivo independiente crea una tarea `cuantificada`; dos o más números, decimales, cero o negativos fallan validación. Los dígitos dentro de palabras no cuentan, así que `Imprimir hojas A4` es simple y `Imprimir 40 hojas A4` es cuantificada.

El progreso agregado se calcula como promedio redondeado: una tarea simple aporta 100% si está completada y 0% si está pendiente; una tarea cuantificada aporta `completed_quantity / target_quantity * 100`; sin tareas el progreso es 0%.

En esta subfase hay servicios server-side y UI en `/dashboard/pedidos/[id]` para listar, crear, editar título, eliminar, completar, reabrir y actualizar progreso de tareas. La tabla queda protegida con RLS e historial automático para que `admin`, `supervisor` y personal asignado puedan gestionar tareas de pedidos accesibles.

La UI no permite seleccionar `task_type`, `target_quantity`, autorías, fechas técnicas ni `sort_order`. Solo envía `pedido_id`, `task_id`, `title` o `completed_quantity` según el formulario, y las Server Actions delegan la validación en servicios server-side.

## Listado interno

Archivos principales:

- Página: `src/app/dashboard/pedidos/page.tsx`
- Servicio: `src/lib/pedidos/list-internal-pedidos.ts`
- Componente: `src/components/pedidos/InternalPedidosList.tsx`

El listado carga server-side. `admin` y `supervisor` ven todos los pedidos; `trabajador` ve solo pedidos asignados. El filtro por estado usa parámetros GET. El componente visual no consulta Supabase. La consulta usa relación explícita con solicitudes para evitar ambigüedad de PostgREST.

El listado muestra progreso operativo basado en tareas: `Sin tareas`, `Progreso: N%` o `100% completado`. No muestra tareas completas ni campos técnicos en la tabla; el cálculo usa el helper compartido de progreso y una consulta server-side por lote a `pedido_tareas`.

## Detalle de pedido

Archivos principales:

- Ruta: `/dashboard/pedidos/[id]`
- Servicio: `src/lib/pedidos/get-internal-pedido-by-id.ts`
- Componente: `src/components/pedidos/InternalPedidoDetail.tsx`

El detalle carga server-side, valida UUID, permiso y alcance por rol. Muestra cliente, solicitud, personal asignado, comentarios internos y archivos privados del pedido cuando existen. Un trabajador no puede ver pedidos no asignados, pero sí puede ver el cliente, la solicitud relacionada, los comentarios internos y los archivos de pedidos que tiene asignados. No implementa edición general.

## Comentarios internos de pedido

Archivos principales:

- Listado: `src/lib/pedidos/list-pedido-comments.ts`
- Creación: `src/lib/pedidos/create-pedido-comment.ts`
- Componente: `src/components/pedidos/PedidoCommentsSection.tsx`
- Action: `src/app/dashboard/pedidos/[id]/actions.ts`

El detalle de pedido permite ver y agregar comentarios internos asociados al pedido. Los comentarios son visibles solo para usuarios internos con acceso al pedido: `admin` y `supervisor` en cualquier pedido, y `trabajador` solo en pedidos asignados.

El formulario solo envía `pedido_id` y `content`. El autor se toma server-side desde el perfil autenticado y se guarda en `pedido_comentarios.author_id`. No se acepta autor, fecha ni otros campos técnicos desde el formulario.

Los comentarios son append-only en el alcance inicial. No hay edición, eliminación, menciones, notificaciones ni adjuntos.

## Historial visible de pedido

Archivos principales:

- Listado: `src/lib/pedidos/list-pedido-history.ts`
- Componente: `src/components/pedidos/PedidoHistorySection.tsx`
- RPC: `public.listar_pedido_historial`

El detalle de pedido muestra una sección “Historial del pedido” con los eventos registrados en `pedido_historial`. El listado se carga server-side y usa una RPC segura que valida `private.can_access_pedido` y devuelve solo datos mínimos del actor: nombre y rol.

`admin` y `supervisor` ven el historial de cualquier pedido. `trabajador` ve el historial solo de pedidos asignados. El historial es append-only: no hay edición ni eliminación.

Desde Fase 11.7A, el historial de pedidos registra automáticamente:

- `pedido_creado` al crear un pedido manual o desde solicitud;
- `trabajador_asignado` al asignar personal;
- `trabajador_removido` al remover personal;
- `archivo_subido` al subir archivos propios de pedido;
- cambios de estado mediante la RPC existente `public.actualizar_estado_pedido`.

No se crea trigger de actualización de estado para evitar duplicar los eventos que ya registra la RPC. Los archivos heredados de solicitudes con `visibility = "cliente_solicitud"` no generan `archivo_subido` del pedido.

## Archivos privados de pedido

Archivos principales:

- Listado: `src/lib/storage/list-pedido-files.ts`
- Subida: `src/lib/storage/upload-pedido-file.ts`
- Componente: `src/components/storage/PedidoFilesSection.tsx`
- Descarga: `/dashboard/pedidos/[id]/archivos/[fileId]/download`

El detalle de pedido permite listar, subir y descargar archivos privados asociados al pedido. Los objetos se guardan en el bucket privado `godel-files` y los metadatos se registran en `archivos`.

Categorías permitidas:

- `admin` y `supervisor`: `interno_pedido`, `avance`, `final_entrega`.
- `trabajador` asignado: `avance`, `final_entrega`.

Los archivos enviados por el cliente en la solicitud pública también pueden aparecer en el pedido generado como `cliente_solicitud`. En ese caso se muestran como “Archivo enviado por cliente”. No se permite subir esa categoría desde el formulario interno de pedido; solo se hereda al convertir una solicitud en pedido.

La descarga se realiza mediante URL firmada de corta duración. No se usan URLs públicas permanentes, no se acepta `file_path` desde formularios y no se usa service role key. No se implementa eliminación de archivos en esta fase.

Desde Fase 11.7B, la conversión de una solicitud a pedido registra `convertida_a_pedido` en `solicitud_historial`. Ese evento no duplica `estado_cambiado` cuando la misma operación marca la solicitud como `convertida`, y la herencia de archivos no genera eventos nuevos de archivo.

## Creación manual

Archivos principales:

- Ruta: `/dashboard/pedidos/nuevo`
- Action: `src/app/dashboard/pedidos/nuevo/actions.ts`
- Servicio: `src/lib/pedidos/create-internal-pedido.ts`
- Formulario: `src/components/pedidos/PedidoForm.tsx`
- Validación: `src/lib/pedidos/order-validation.ts`
- Número de pedido: `src/lib/pedidos/order-number.ts`

La creación manual requiere `pedidos.manage`, por lo que solo `admin` y `supervisor` pueden usarla. El formulario permite seleccionar un cliente existente o dejar `Sin cliente asociado`; no acepta estado, `solicitud_id`, número de pedido ni personal asignado. El pedido manual se crea con `solicitud_id = null`, estado inicial `en_revision` y `cliente_id = null` cuando no se selecciona cliente. No existen campos temporales de cliente en este flujo.

## Conversión de solicitud a pedido

Archivos principales:

- Servicio: `src/lib/pedidos/create-pedido-from-solicitud.ts`
- Componente: `src/components/solicitudes/SolicitudConvertPedidoForm.tsx`
- Action: `src/app/dashboard/solicitudes/[id]/actions.ts`

La conversión requiere `solicitudes.manage` y `pedidos.manage`. Solo se permite convertir solicitudes con estado `aprobada` y `cliente_id` asociado. El formulario envía únicamente `solicitud_id`, `title` y `description`.

`service_type` queda como referencia inicial elegida por el cliente. No se usa como título automático del pedido. El usuario interno debe definir un `title` obligatorio y puede ajustar la `description` operativa antes de crear el pedido. El formulario no acepta `order_number`, `status`, `cliente_id`, `created_by`, `converted_order_id` ni otros campos técnicos.

Al convertir:

- se crea un pedido con `pedidos.solicitud_id`;
- se usa el `title` definido por el usuario interno;
- se guarda la descripción operativa enviada desde el formulario de conversión;
- se actualiza `solicitudes.status = convertida`;
- se actualiza `solicitudes.converted_order_id`;
- se asocian al pedido los archivos `cliente_solicitud` de la solicitud completando `archivos.pedido_id`;
- no se mueven ni copian archivos físicos en Storage;
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

La action solo acepta `pedido_id` y `status`. El estado se valida server-side contra el enum real simplificado. La actualización usa la RPC segura `public.actualizar_estado_pedido`, que evita abrir un `UPDATE` amplio sobre `pedidos` para trabajadores.

Un trabajador solo puede cambiar el estado de pedidos asignados. Con múltiples usuarios asignados, cualquier trabajador que tenga una fila en `pedido_trabajadores` para ese pedido puede cambiar el estado; un trabajador no asignado no pasa la validación. `admin` y `supervisor` mantienen su permiso global aunque estén asignados operativamente a un pedido.

Este flujo no modifica solicitudes ni `converted_order_id`, no cambia roles reales y no modifica permisos reales.

## Asignación de personal

Archivos principales:

- Listado de personal asignable: `src/lib/pedidos/list-assignable-workers.ts`
- Servicio de asignación: `src/lib/pedidos/assign-internal-pedido-worker.ts`
- Servicio de remoción: `src/lib/pedidos/remove-internal-pedido-worker.ts`
- Componente: `src/components/pedidos/PedidoWorkerAssignmentForm.tsx`
- Action: `src/app/dashboard/pedidos/[id]/actions.ts`

Solo `admin` y `supervisor` pueden asignar o remover personal. El listado devuelve perfiles activos con rol `admin`, `supervisor` o `trabajador`. El servicio valida UUID de pedido y usuario, verifica que el usuario exista, esté activo y tenga un rol asignable, y no reemplaza automáticamente otras asignaciones.

La interfaz del detalle muestra múltiples usuarios asignados con su rol visible. `admin` y `supervisor` pueden agregar personal desde el selector y quitar una asignación concreta con la action `removePedidoWorkerAction`; `trabajador` ve la lista en modo lectura, sin controles de gestión.

Asignar un `admin` o `supervisor` no modifica su rol ni degrada sus permisos. Un trabajador asignado puede ver el pedido y cambiar su estado siguiendo las reglas operativas vigentes. No se implementan historial avanzado ni notificaciones.

El trabajador no accede al módulo general de usuarios. La visibilidad de nombres y roles del personal asignado se controla mediante RLS de `perfiles` con alcance por pedido accesible, usando las asignaciones de `pedido_trabajadores` como contexto.

La documentación específica del flujo de asignación está en `docs/ORDER_ASSIGNMENTS_FLOW.md`.

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
- los formularios de asignación solo envían `pedido_id` y `assigned_profile_id`;
- el formulario de comentario solo envía `pedido_id` y `content`;
- trabajadores no pueden crear, convertir, asignar ni remover personal;
- trabajadores no acceden a los módulos generales de clientes o solicitudes, aunque RLS permite leer datos relacionados con pedidos asignados.

## Qué no incluye esta fase

- edición general de pedido;
- eliminación;
- historial avanzado;
- edición o eliminación de comentarios internos;
- comentarios de solicitudes;
- notificaciones;
- reportes;
- facturación;
- múltiples responsables avanzados;
- reapertura de pedidos cerrados o flujos avanzados de corrección posteriores a entrega.

## Consideraciones futuras

Más adelante se podrá:

- agregar eliminación controlada de archivos privados del pedido;
- registrar historial de cambios;
- implementar notificaciones;
- agregar reportes de producción;
- crear vistas por carga de trabajo;
- implementar edición controlada de campos del pedido.

El diseño técnico de comentarios internos e historial para la Fase 11 se documenta en `docs/COMMENTS_AND_HISTORY_MODEL.md`.

El diseño del dashboard operativo para la Fase 13 se documenta en `docs/DASHBOARD_OPERATIVE_MODEL.md`. Las métricas futuras de pedidos deben derivarse de consultas server-side, respetar RLS y filtrar los pedidos del trabajador a sus asignaciones.

Desde 13.6I, el dashboard y los paneles operativos también consideran tareas: pedidos en revisión sin tareas, pedidos en producción con tareas pendientes, pedidos listos para entrega y progreso agregado por pedido. No se implementan gráficos avanzados, reportes financieros ni productividad.

## Pruebas manuales recomendadas

- Verificar que `admin` ve todos los pedidos.
- Verificar que `supervisor` ve todos los pedidos.
- Verificar que `trabajador` ve solo pedidos asignados.
- Probar el filtro por estado.
- Abrir detalle como `admin`.
- Abrir detalle como `supervisor`.
- Abrir detalle como trabajador asignado.
- Verificar que un trabajador no abre un pedido no asignado.
- Crear pedido manual con cliente registrado.
- Crear pedido manual con `Sin cliente asociado`.
- Verificar que el pedido manual tiene `solicitud_id = null`.
- Verificar que el pedido manual inicia en `en_revision`.
- Verificar que lista, detalle y dashboard muestran `Sin cliente asociado` cuando `cliente_id = null`.
- Convertir una solicitud aprobada con cliente.
- Verificar que el pedido convertido inicia en `solicitud_recibida`.
- Verificar que la conversión exige título.
- Verificar que el pedido convertido no usa `service_type` como título automático.
- Verificar que la descripción ajustada se guarda en el pedido.
- Verificar que se crea pedido con `solicitud_id`.
- Verificar que la solicitud queda `convertida`.
- Verificar que se guarda `converted_order_id`.
- Intentar doble conversión.
- Cambiar estado como `admin`.
- Cambiar estado como `supervisor`.
- Cambiar estado como trabajador asignado.
- Cambiar estado entre `solicitud_recibida`, `en_revision`, `en_produccion`, `listo_entrega`, `entregado` y `cancelado`.
- Confirmar que el selector no muestra estados eliminados.
- Confirmar que listados y filtros no muestran estados eliminados.
- Confirmar que el dashboard no muestra tarjeta de diseño.
- Confirmar que las métricas de activos, producción, listos, atrasados y próximos a entrega funcionan.
- Confirmar que el listado de pedidos muestra `Sin tareas`, progreso porcentual o `100% completado`.
- Confirmar que los paneles operativos muestran progreso y priorizan pedidos atrasados, próximos, sin tareas, con tareas pendientes y listos para entrega.
- Confirmar que el historial registra cambios de estado con etiquetas vigentes.
- Intentar pasar a `en_produccion` sin tareas y confirmar bloqueo.
- Crear una tarea y pasar a `en_produccion`.
- Intentar pasar a `listo_entrega` con tareas incompletas y confirmar bloqueo.
- Completar todas las tareas y pasar a `listo_entrega`.
- Pasar de `listo_entrega` a `entregado`.
- Confirmar que `entregado` y `cancelado` no admiten cambios posteriores.
- Verificar que un trabajador no cambia un pedido no asignado.
- Asignar personal como `admin` o `supervisor`.
- Verificar que se puede asignar un `admin`, un `supervisor` y un `trabajador` activos.
- Verificar que no se pueden asignar usuarios inactivos.
- Verificar que el trabajador asignado ve el pedido.
- Verificar que no se modifican solicitudes al cambiar estado o asignar personal.
- Verificar en Supabase Studio que existe `pedido_tareas`.
- Verificar que existe el enum `pedido_tarea_tipo`.
- Verificar que `pedido_historial_action` incluye acciones de tareas.
- Insertar manualmente una tarea simple válida.
- Insertar manualmente una tarea cuantificada válida.
- Verificar que una tarea simple con cantidades falla por constraint.
- Verificar que una tarea cuantificada sin `target_quantity` falla.
- Verificar que `completed_quantity > target_quantity` falla.
- Confirmar historial al crear, actualizar progreso, completar, reabrir y eliminar tarea.
- Confirmar que anónimo no accede a `pedido_tareas`.
- Confirmar que RLS respeta acceso por pedido.

## Cierre

La Fase 9 extendió el módulo de pedidos con asignaciones múltiples de personal interno, visibilidad controlada para trabajadores asignados y documentación específica en `docs/ORDER_ASSIGNMENTS_FLOW.md`.
