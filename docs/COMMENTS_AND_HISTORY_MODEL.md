# Modelo de Comentarios Internos e Historial

## Propósito

Este documento define el diagnóstico y el diseño técnico recomendado para la Fase 11 de Godel Diseño: comentarios internos e historial operativo visible.

La intención es separar claramente dos necesidades distintas:

- comentarios internos escritos por usuarios del equipo;
- historial automático de eventos relevantes generados por acciones del sistema.

Este documento registra el diseño y el estado de avance de las subfases de comentarios e historial. La implementación funcional debe mantenerse alineada con este modelo.

## Alcance

La Fase 11 debe cubrir:

- comentarios internos en pedidos;
- comentarios internos en solicitudes;
- texto del comentario, autor, fecha y entidad relacionada;
- visibilidad interna controlada por rol y por asignación cuando aplique;
- historial automático de eventos relevantes en pedidos;
- historial automático de eventos relevantes en solicitudes;
- usuario que ejecutó la acción cuando aplique;
- fecha del evento;
- entidad afectada;
- tipo de evento;
- resumen visible;
- datos mínimos antes/después cuando sean necesarios para entender el cambio.

## Fuera de Alcance

Quedan fuera del alcance inicial:

- comentarios públicos de clientes;
- menciones;
- notificaciones;
- edición o eliminación de comentarios;
- historial exhaustivo de cada campo;
- reportes avanzados;
- auditoría legal completa;
- exportación de logs.

## Diagnóstico del Estado Actual

### Base de datos

El proyecto no parte de cero. La migración inicial creó estructuras relacionadas con comentarios e historial para pedidos, la subfase 11.1B normalizó sus nombres y la subfase 11.2 agregó la base de solicitudes:

- existe la tabla `pedido_comentarios`, renombrada desde `comentarios`;
- existe la tabla `pedido_historial`, renombrada desde `historial_pedidos`;
- existe el enum `pedido_historial_action`, renombrado desde `historial_pedido_action`;
- existe la tabla `solicitud_comentarios`;
- existe la tabla `solicitud_historial`;
- existe el enum `solicitud_historial_action`;
- existe la RPC `public.actualizar_estado_pedido`;
- existe la RPC `public.actualizar_estado_solicitud`;
- existe RLS para `pedido_comentarios`;
- existe RLS para `pedido_historial`;
- existe RLS para `solicitud_comentarios`;
- existe RLS para `solicitud_historial`;
- existen triggers genéricos de `updated_at` en tablas editables como perfiles, clientes, solicitudes y pedidos.

La tabla `pedido_comentarios` está asociada solo a pedidos mediante `pedido_id`. No existe relación con solicitudes.

La tabla `pedido_historial` está asociada solo a pedidos mediante `pedido_id`.

La tabla `solicitud_comentarios` está asociada solo a solicitudes mediante `solicitud_id`.

La tabla `solicitud_historial` está asociada solo a solicitudes mediante `solicitud_id`.

No existe una tabla de historial general para múltiples entidades. Tampoco existe una tabla de comentarios interna que pueda apuntar indistintamente a pedidos o solicitudes; la decisión vigente es mantener tablas separadas por entidad.

Las tablas de historial (`pedido_historial` y `solicitud_historial`) usan `created_at default clock_timestamp()` para registrar el momento real de cada inserción, incluso cuando varios eventos ocurren dentro de una misma transacción. Las RPCs de listado muestran los eventos con lo más reciente primero (`created_at desc`); `id desc` queda solo como desempate secundario, no como fuente de verdad del orden de eventos. No se aplica reordenamiento visual manual en TypeScript.

### Triggers y Automatización

Existen triggers técnicos de actualización de fecha:

- `set_perfiles_updated_at`;
- `set_clientes_updated_at`;
- `set_solicitudes_updated_at`;
- `set_pedidos_updated_at`.

Desde Fase 11.7A y 11.7B también existen triggers de negocio privados para registrar historial automático de pedidos y solicitudes. Estos triggers cubren creación de pedidos, asignación/remoción de personal, subida de archivos propios de pedido, creación de solicitudes, archivos adjuntados a solicitudes, cambios de estado de solicitud, asociación de cliente y conversión de solicitud a pedido. Desde Fase 13.6E, también registran cambios relevantes de tareas de pedido.

### RPC `actualizar_estado_pedido`

La RPC `public.actualizar_estado_pedido` sí registra historial en `pedido_historial` cuando el estado cambia.

También valida las reglas operativas de estado: requiere tareas para pasar a `en_produccion`, requiere todas las tareas completadas para pasar a `listo_entrega`, permite `entregado` solo desde `listo_entrega`, permite `cancelado` como salida lateral desde estados activos y bloquea cambios desde `entregado` o `cancelado`. La UI orienta al usuario, pero la autoridad de validación es la RPC.

Desde Fase 13.8D, la RPC bloquea el pedido con `FOR UPDATE` antes de leer el
estado y mantiene actualización e historial dentro de la misma transacción.
También bloquea con `FOR SHARE` las tareas existentes antes de calcular si hay
tareas y si todas están completas. Por ello una transición concurrente no
puede confirmar usando un estado anterior ni una versión intermedia de esas
tareas.

Eventos que puede registrar:

- `estado_cambiado`;
- `pedido_entregado`;
- `pedido_cancelado`.

También guarda:

- `actor_id = auth.uid()`;
- `old_value` con el estado anterior;
- `new_value` con el estado nuevo;
- `metadata.source = "actualizar_estado_pedido"`.

Si el estado enviado es igual al estado actual, la RPC retorna el pedido sin insertar evento.

La fecha real al entregar usa `private.current_business_date()` con zona
`America/Havana`. Esto no cambia el contenido ni el número de eventos.

### RPC `actualizar_estado_solicitud`

La RPC `public.actualizar_estado_solicitud` valida las transiciones manuales de solicitudes. Solo `admin` y `supervisor` activos pueden ejecutarla. La UI muestra las opciones permitidas, pero la autoridad real es la RPC.

Reglas vigentes:

- `nueva` -> `en_revision` o `rechazada`;
- `en_revision` -> `contactada` o `rechazada`;
- `contactada` -> `aprobada` o `rechazada`;
- `aprobada` -> `rechazada`;
- `rechazada` y `convertida` son estados cerrados;
- `convertida` solo se asigna por el flujo formal de conversión a pedido.

La RPC actualiza `solicitudes.status` y `reviewed_by`. El evento `estado_cambiado` se registra mediante el trigger privado existente sobre `solicitudes.status`, por lo que la RPC no inserta historial manualmente. Si el estado enviado es igual al actual, retorna la solicitud sin duplicar historial.

### RPC `convertir_solicitud_a_pedido`

La RPC `public.convertir_solicitud_a_pedido` ejecuta en una sola transacción la
creación del pedido, la marca de la solicitud como `convertida` y la asociación
por metadata de sus archivos `cliente_solicitud`. No inserta historial
manualmente.

El insert de `pedidos` activa `pedido_creado`. El update que establece a la vez
`solicitudes.status = "convertida"` y `converted_order_id` activa
`convertida_a_pedido`, mientras el trigger genérico de estado omite
`estado_cambiado` para evitar duplicación. La actualización de
`archivos.pedido_id` no genera `archivo_subido`, porque no inserta un archivo
nuevo ni altera su visibilidad.

### Acciones y Servicios Actuales

Las acciones y servicios actuales no aceptan datos de historial desde formularios. El historial se registra mediante RPCs, triggers privados o servicios server-side controlados:

- `updateInternalPedidoStatus` llama a `public.actualizar_estado_pedido`, que registra cambios de estado de pedido;
- la creación de pedidos, asignación/remoción de personal y subida de archivos propios de pedido se registran por triggers;
- las acciones de tareas de pedido delegan en servicios server-side y los eventos se registran por triggers sobre `pedido_tareas`;
- `createPedidoFromSolicitud` llama a `public.convertir_solicitud_a_pedido`; la
  creación del pedido y la conversión de la solicitud se registran por los
  triggers existentes;
- la creación de solicitudes, archivos adjuntados, cambios de estado y asociación de cliente se registran por triggers;
- `createClienteFromSolicitudAndAssociate` llama a
  `public.crear_cliente_desde_solicitud`; la RPC registra
  `cliente_creado_desde_solicitud` y luego el trigger de `cliente_id` registra
  `cliente_asociado` dentro de la misma transacción.

La actividad reciente del dashboard consume estos eventos y construye resúmenes controlados. Para tareas muestra títulos seguros, por ejemplo `Tarea creada: X.` o `Progreso de tarea X actualizado de A a B.`, sin mostrar metadata cruda, JSON, rutas privadas ni `file_path`.

La herencia de archivos al convertir una solicitud en pedido no genera un evento adicional de archivo para evitar ruido y duplicados.

### Comentarios de Pedidos

La Fase 11.3 implementa comentarios internos en el detalle de pedido.

El módulo actual:

- lista comentarios de `pedido_comentarios` en `/dashboard/pedidos/[id]`;
- permite agregar comentarios a usuarios con acceso al pedido;
- usa `author_id = profile.id` como autor;
- guarda `content`;
- muestra autor, rol, fecha y contenido;
- no acepta `author_id` ni `created_at` desde formularios;
- no implementa edición ni eliminación.

El RLS permite lectura e inserción según acceso al pedido. La subfase 11.2 eliminó las policies de actualización y eliminación para mantener comentarios append-only en el alcance inicial.

### Historial Visible de Pedidos

La Fase 11.5 implementa historial visible en el detalle de pedido.

El módulo actual:

- lista eventos existentes de `pedido_historial` en `/dashboard/pedidos/[id]`;
- usa la RPC segura `public.listar_pedido_historial`;
- muestra tipo de evento, resumen visible, actor, rol y fecha;
- devuelve solo datos mínimos del actor;
- no abre globalmente `perfiles`;
- no implementa edición ni eliminación;
- no registra eventos automáticos nuevos.

Actualmente se muestran los eventos que ya existan en `pedido_historial`. Los cambios de estado se registran mediante `public.actualizar_estado_pedido`.

Desde Fase 11.7A también se registran automáticamente en base de datos:

- `pedido_creado` al insertar en `pedidos`;
- `trabajador_asignado` al insertar en `pedido_trabajadores`;
- `trabajador_removido` al eliminar de `pedido_trabajadores`;
- `archivo_subido` al insertar archivos propios de pedido en `archivos`.
- `tarea_creada`, `tarea_actualizada`, `tarea_eliminada`, `tarea_completada`, `tarea_reabierta` y `tarea_progreso_actualizado` al cambiar `pedido_tareas`.

No se crea trigger de cambio de estado para evitar duplicar lo que ya registra `public.actualizar_estado_pedido`. Los archivos heredados desde solicitudes con `visibility = "cliente_solicitud"` no generan `archivo_subido` del pedido.

Desde Fase 11.7B también se registran automáticamente eventos de solicitudes en `solicitud_historial`:

- `solicitud_creada` al insertar una solicitud;
- `archivos_adjuntados` al insertar archivos con `visibility = "cliente_solicitud"`;
- `estado_cambiado` al cambiar el estado interno;
- `cliente_asociado` al asociar un cliente;
- `cliente_creado_desde_solicitud` desde el flujo server-side que crea cliente;
- `convertida_a_pedido` al relacionar la solicitud con el pedido generado.

La conversión a pedido no duplica `estado_cambiado` cuando el mismo update establece `converted_order_id` y `status = "convertida"`.

El historial visible de solicitudes construye resúmenes detallados a partir de `summary`, `old_value`, `new_value`, `metadata` y relaciones mínimas, de forma equivalente al historial de pedidos. Por ejemplo:

- cambios de estado muestran estado anterior y estado nuevo desde `old_value` y `new_value`;
- archivos adjuntados muestran el nombre del archivo y tamaño cuando existe;
- asociación o creación de cliente muestra el nombre del cliente;
- conversión a pedido muestra número y título del pedido cuando están disponibles.

### Comentarios de Solicitudes

La Fase 11.4 implementa comentarios internos en el detalle de solicitud.

El módulo actual:

- lista comentarios de `solicitud_comentarios` en `/dashboard/solicitudes/[id]`;
- permite agregar comentarios a `admin` y `supervisor`;
- usa `author_id = profile.id` como autor;
- guarda `content`;
- muestra autor, rol, fecha y contenido;
- no acepta autor, `created_at` ni campos técnicos desde formularios;
- no implementa edición ni eliminación.

Los comentarios de solicitudes son internos y append-only inicialmente. El RLS reserva lectura e inserción a `admin` y `supervisor`; `trabajador` y usuarios anónimos no acceden.

### Solicitudes

Existen las tablas base `solicitud_comentarios` y `solicitud_historial`, reservadas por RLS a `admin` y `supervisor`.

Los cambios actuales en solicitudes se reflejan en campos como:

- `status`;
- `reviewed_by`;
- `cliente_id`;
- `converted_order_id`;
- `updated_at`.

Desde Fase 11.7B esos cambios relevantes se registran automáticamente en `solicitud_historial` mediante triggers de base de datos. `cliente_creado_desde_solicitud` se inserta actualmente dentro de la RPC transaccional `public.crear_cliente_desde_solicitud`, antes de actualizar `cliente_id`.

### Archivos

La tabla `archivos` guarda metadatos y trazabilidad básica:

- `pedido_id`;
- `solicitud_id`;
- `uploaded_by`;
- `file_name`;
- `file_path`;
- `file_type`;
- `file_size`;
- `bucket`;
- `visibility`;
- `created_at`.

Desde Fase 11.7B, la inserción de archivos de solicitud con `visibility = "cliente_solicitud"` registra `archivos_adjuntados` en `solicitud_historial`. La herencia de esos archivos al convertir una solicitud en pedido no genera un nuevo evento de archivo.

### Asignaciones

La tabla `pedido_trabajadores` guarda:

- pedido asignado;
- perfil asignado;
- usuario que asignó;
- fecha de asignación.

Desde Fase 11.7A, la asignación y remoción de personal se registran automáticamente en `pedido_historial`.

## Necesidades Funcionales

### Comentarios Internos

Los comentarios internos deben permitir que el equipo deje contexto operativo sin modificar la entidad principal.

Requisitos iniciales:

- comentario en pedido;
- comentario en solicitud;
- texto obligatorio;
- autor obligatorio;
- fecha de creación;
- relación con pedido o solicitud;
- visibilidad interna;
- sin comentarios públicos de clientes;
- sin edición ni eliminación en la primera versión funcional.

### Historial Automático

El historial debe registrar eventos relevantes sin depender de que el usuario escriba manualmente una nota.

Requisitos iniciales:

- registro automático desde acciones controladas;
- usuario ejecutor cuando aplique;
- fecha del evento;
- entidad afectada;
- tipo de evento;
- resumen visible;
- valores antes/después solo cuando aporten contexto;
- metadatos mínimos y seguros.

El historial no debe usarse como auditoría legal completa ni como copia de todos los cambios de cada campo.

## Opciones de Modelo de Datos

### Opción A: Tablas Únicas por Concepto

Estructura:

- `comentarios_internos`;
- `historial_eventos`.

Campos de relación:

- `pedido_id uuid nullable`;
- `solicitud_id uuid nullable`;

Cada fila debe apuntar a una sola entidad. Esto requeriría una restricción para asegurar que exactamente uno de los dos campos sea distinto de `null`.

Ventajas:

- un solo servicio de comentarios;
- un solo servicio de historial;
- una UI reutilizable por entidad;
- permite agregar nuevas entidades en el futuro con menos tablas.

Desventajas:

- RLS más delicada porque cada policy debe evaluar varias entidades posibles;
- restricciones más complejas para evitar filas ambiguas;
- consultas con más condiciones condicionales;
- mayor probabilidad de mezclar reglas de pedidos y solicitudes;
- implica migrar o convivir con tablas específicas por entidad.

### Opción B: Tablas Separadas por Entidad

Estructura conceptual:

- `pedido_comentarios`;
- `solicitud_comentarios`;
- `pedido_historial`;
- `solicitud_historial`.

Ventajas:

- RLS más simple;
- consultas más explícitas;
- relaciones más claras;
- permisos más fáciles de razonar;
- evita condicionales por entidad;
- encaja mejor con la separación actual entre pedidos y solicitudes.

Desventajas:

- más tablas;
- servicios separados o helpers compartidos;
- algo más de duplicación controlada;
- si en el futuro aparecen muchas entidades comentables, puede crecer el número de tablas.

## Decisión Recomendada

Se recomienda la Opción B, ajustada al estado real del proyecto.

La subfase 11.1B formaliza esta decisión al normalizar las tablas de pedidos:

- `pedido_comentarios`;
- `pedido_historial`;
- `pedido_historial_action`.

Las tablas de solicitudes creadas en Fase 11.2 son:

- `solicitud_comentarios`;
- `solicitud_historial`;
- `solicitud_historial_action`.

La recomendación práctica es mantener servicios separados para pedidos y solicitudes, con validaciones compartidas cuando sea útil.

Esta opción prioriza simplicidad, claridad, RLS sencilla, mantenimiento y escalabilidad razonable sin sobreingeniería.

## Tablas Propuestas

### Comentarios de Pedidos

Tabla existente: `pedido_comentarios`.

Uso recomendado: comentarios internos asociados a pedidos.

Campos existentes:

| Campo | Tipo | Uso |
| --- | --- | --- |
| `id` | `uuid` | Identificador del comentario. |
| `pedido_id` | `uuid` | Pedido comentado. |
| `author_id` | `uuid` | Autor interno. |
| `content` | `text` | Texto del comentario. |
| `created_at` | `timestamptz` | Fecha de creación. |

Consideración para Fase 11.2:

- no exponer edición ni eliminación en UI;
- evaluar si conviene restringir RLS de `update` y `delete` para alinearlo con el alcance inicial.

### Comentarios de Solicitudes

Tabla existente: `solicitud_comentarios`.

Campos existentes:

| Campo | Tipo | Uso |
| --- | --- | --- |
| `id` | `uuid` | Identificador del comentario. |
| `solicitud_id` | `uuid` | Solicitud comentada. |
| `author_id` | `uuid` | Autor interno. |
| `content` | `text` | Texto del comentario. |
| `created_at` | `timestamptz` | Fecha de creación. |

Reglas recomendadas:

- `content` obligatorio y no vacío;
- longitud máxima de `content` de 2000 caracteres;
- `solicitud_id` obligatorio;
- `author_id` obligatorio y debe corresponder al usuario autenticado;
- sin `updated_at` si no habrá edición inicial;
- sin edición ni eliminación en la primera versión funcional.

### Historial de Pedidos

Tabla existente: `pedido_historial`.

Campos existentes:

| Campo | Tipo | Uso |
| --- | --- | --- |
| `id` | `uuid` | Identificador del evento. |
| `pedido_id` | `uuid` | Pedido relacionado. |
| `actor_id` | `uuid nullable` | Usuario que ejecutó la acción, si aplica. |
| `action` | `pedido_historial_action` | Tipo de evento. |
| `summary` | `text` | Texto breve visible para la UI. |
| `old_value` | `text nullable` | Valor anterior cuando aplique. |
| `new_value` | `text nullable` | Valor nuevo cuando aplique. |
| `metadata` | `jsonb` | Datos adicionales mínimos. |
| `created_at` | `timestamptz` | Fecha del evento. |

Estado desde Fase 11.2:

- conservar la tabla;
- mantener lectura según acceso al pedido;
- permitir comentarios de pedidos accesibles;
- no permitir actualización ni eliminación desde la aplicación;
- mantener la escritura de historial controlada por RPC o flujos internos.

### Historial de Solicitudes

Tabla existente: `solicitud_historial`.

Campos propuestos:

| Campo | Tipo | Uso |
| --- | --- | --- |
| `id` | `uuid` | Identificador del evento. |
| `solicitud_id` | `uuid` | Solicitud relacionada. |
| `actor_id` | `uuid nullable` | Usuario ejecutor si aplica. |
| `action` | `solicitud_historial_action` | Tipo de evento. |
| `summary` | `text` | Texto breve visible para la UI. |
| `old_value` | `text nullable` | Valor anterior cuando aplique. |
| `new_value` | `text nullable` | Valor nuevo cuando aplique. |
| `metadata` | `jsonb` | Datos adicionales mínimos, como objeto JSON. |
| `created_at` | `timestamptz` | Fecha del evento. |

Enum existente: `solicitud_historial_action`.

Estado desde Fase 11.7B:

- el historial es visible en `/dashboard/solicitudes/[id]`;
- `admin` y `supervisor` pueden ver eventos registrados;
- `trabajador` y usuarios anónimos no acceden;
- se muestran tipo de evento, resumen, actor, rol y fecha;
- no hay edición ni eliminación;
- se registran eventos automáticos mínimos mediante triggers y flujos server-side controlados.

Valores iniciales:

- `solicitud_creada`;
- `archivos_adjuntados`;
- `estado_cambiado`;
- `cliente_asociado`;
- `cliente_creado_desde_solicitud`;
- `convertida_a_pedido`.

## Eventos Iniciales Propuestos

### Pedidos

Eventos mínimos:

| Evento | Cuándo registrar | Datos mínimos |
| --- | --- | --- |
| `pedido_creado` | Pedido creado manualmente. | `pedido_id`, `actor_id`, `summary`, origen manual. |
| `pedido_creado` | Pedido creado desde solicitud. | `pedido_id`, `solicitud_id`, `actor_id`, `title`, origen solicitud. |
| `estado_cambiado` | Cambio de estado normal. | estado anterior, estado nuevo, usuario. |
| `pedido_entregado` | Cambio a `entregado`. | estado anterior, estado nuevo, usuario. |
| `pedido_cancelado` | Cambio a `cancelado`. | estado anterior, estado nuevo, usuario. |
| `trabajador_asignado` | Se asigna personal al pedido. | perfil asignado, usuario que asignó. |
| `trabajador_removido` | Se remueve personal del pedido. | perfil removido, usuario que removió. |
| `archivo_subido` | Se sube archivo de pedido. | archivo, categoría, usuario. |
| `nota_agregada` | Se crea comentario interno de pedido. | comentario, autor. |
| `tarea_creada` | Se crea una tarea de pedido. | tarea, tipo, cantidades, orden. |
| `tarea_actualizada` | Cambia título, tipo, cantidad objetivo u orden. | valores anteriores y nuevos relevantes. |
| `tarea_eliminada` | Se elimina una tarea de pedido. | tarea eliminada y estado previo seguro. |
| `tarea_completada` | Una tarea pasa a completada. | tarea, usuario, fecha y estado. |
| `tarea_reabierta` | Una tarea completada vuelve a abierta. | tarea y estado anterior/nuevo. |
| `tarea_progreso_actualizado` | Cambia el avance numérico de una tarea cuantificada. | título de tarea, cantidad anterior y cantidad nueva. |

La RPC actual cubre cambios de estado de pedido con el enum simplificado de fases generales y valida las transiciones según tareas. Los eventos de tareas quedan conectados mediante triggers de base de datos; los servicios server-side y la UI del detalle de pedido ya pueden listar, crear, actualizar, completar, reabrir y eliminar tareas.

### Solicitudes

Eventos mínimos:

| Evento | Cuándo registrar | Datos mínimos |
| --- | --- | --- |
| `solicitud_creada` | Solicitud pública creada. | `solicitud_id`, `service_type`, origen público; no guarda `quantity`. |
| `archivos_adjuntados` | Cliente adjunta uno o varios archivos a la solicitud. | archivos, nombres seguros, solicitud. |
| `estado_cambiado` | Admin o supervisor cambia estado. | estado anterior, estado nuevo, usuario. |
| `cliente_asociado` | Se asocia cliente existente. | cliente, usuario. |
| `cliente_creado_desde_solicitud` | Se crea cliente desde solicitud. | cliente creado, usuario. |
| `convertida_a_pedido` | Se convierte solicitud a pedido. | pedido generado, título real del pedido, usuario. |

## Permisos Propuestos

### Comentarios de Pedidos

| Rol | Regla |
| --- | --- |
| `admin` | Puede ver y comentar en cualquier pedido. |
| `supervisor` | Puede ver y comentar en cualquier pedido. |
| `trabajador` | Puede ver y comentar solo en pedidos asignados. |
| Anónimo | No accede. |

### Comentarios de Solicitudes

| Rol | Regla |
| --- | --- |
| `admin` | Puede ver y comentar. |
| `supervisor` | Puede ver y comentar. |
| `trabajador` | No accede a solicitudes internas. |
| Anónimo | No accede. |

### Historial de Pedidos

| Rol | Regla |
| --- | --- |
| `admin` | Ve historial de cualquier pedido. |
| `supervisor` | Ve historial de cualquier pedido. |
| `trabajador` | Ve historial solo de pedidos asignados. |
| Anónimo | No accede. |

### Historial de Solicitudes

| Rol | Regla |
| --- | --- |
| `admin` | Ve historial de solicitudes. |
| `supervisor` | Ve historial de solicitudes. |
| `trabajador` | No accede. |
| Anónimo | No accede. |

## Estrategia de Implementación

Subfases recomendadas después de este diagnóstico:

1. Migraciones y RLS.
2. Servicios base.
3. UI de comentarios en pedidos.
4. UI de comentarios en solicitudes.
5. Registro automático de historial en acciones existentes.
6. Documentación y cierre.

### Fase 11.2: Migraciones y RLS

Objetivos:

- crear `solicitud_comentarios`;
- crear `solicitud_historial`;
- crear enum `solicitud_historial_action`;
- dejar `pedido_comentarios` sin `update` y `delete` para el alcance append-only inicial;
- dejar `pedido_historial` sin inserción directa, actualización ni eliminación desde tabla;
- mantener RLS simple por entidad;
- no crear UI ni servicios funcionales todavía.

No debería usarse service role key.

### Fase 11.3: Servicios Base

Estado:

- implementado para comentarios internos de pedidos;
- `listPedidoComments` lista comentarios por pedido en orden ascendente;
- `createPedidoComment` valida UUID, permiso, acceso al pedido y `content`;
- la action del detalle solo lee `pedido_id` y `content`;
- no se acepta autor desde el formulario;
- no se registra historial automático adicional.

### Fase 11.3: UI de Comentarios en Pedidos

Estado:

- implementado en `PedidoCommentsSection`;
- lista comentarios internos de pedido;
- permite crear comentario si el usuario tiene acceso;
- muestra autor, rol, fecha y contenido;
- no implementar edición ni eliminación.

### Fase 11.4: UI de Comentarios en Solicitudes

Estado:

- listar comentarios internos de solicitud;
- permitir comentar solo a `admin` y `supervisor`;
- mostrar autor, rol, fecha y contenido;
- no exponer a trabajadores ni anónimos;
- no implementar edición ni eliminación.

### Fase 11.5: Historial Visible en Pedidos

Estado:

- implementado en `PedidoHistorySection`;
- lista eventos existentes de `pedido_historial`;
- usa `public.listar_pedido_historial` para exponer datos mínimos del actor;
- muestra tipo de evento, resumen, actor, rol y fecha;
- no implementa edición ni eliminación;
- no registra eventos automáticos nuevos.

### Fase 11.6: Historial Visible en Solicitudes

Estado:

- implementado en `SolicitudHistorySection`;
- lista eventos existentes de `solicitud_historial`;
- muestra tipo de evento, resumen, actor, rol y fecha;
- maneja actor nulo como evento automático;
- no implementa edición ni eliminación;
- no registra eventos automáticos nuevos.

### Fase 11.7A: Registro Automático de Historial de Pedidos

Estado:

- implementado mediante triggers de base de datos;
- registra `pedido_creado`;
- registra `trabajador_asignado`;
- registra `trabajador_removido`;
- registra `archivo_subido` para archivos propios de pedido;
- registra eventos de tareas desde `pedido_tareas`;
- conserva cambios de estado mediante `public.actualizar_estado_pedido`;
- no duplica eventos de estado;
- no registra historial automático de solicitudes.

### Fase 11.7B: Registro Automático de Historial de Solicitudes

Estado:

- implementado mediante triggers de base de datos para `solicitud_creada`, `archivos_adjuntados`, `estado_cambiado`, `cliente_asociado` y `convertida_a_pedido`;
- implementado dentro de `public.crear_cliente_desde_solicitud` para
  `cliente_creado_desde_solicitud`, como parte de la misma transacción que crea
  y asocia el cliente;
- como el historial visible muestra el evento más reciente primero, el par se ve como `cliente_asociado` y después `cliente_creado_desde_solicitud` cuando ambos pertenecen al mismo cliente;
- los eventos públicos usan `actor_id = null` cuando no existe usuario autenticado;
- la conversión a pedido evita duplicar `estado_cambiado` cuando el mismo update marca la solicitud como `convertida`;
- los resúmenes visibles se enriquecen con datos mínimos de `metadata`, cliente y pedido; el título mostrado corresponde a `pedidos.title`, no a `solicitudes.service_type`;
- no abre lectura pública ni inserción anónima directa sobre `solicitud_historial`.

### Fase 11.8: Documentación y Cierre

Objetivos:

- actualizar documentación funcional;
- documentar pruebas manuales recomendadas;
- confirmar que RLS y servicios cumplen la matriz definida.

## Riesgos

- Las tablas actuales ya existen, por lo que un rediseño hacia tablas únicas implicaría migraciones de datos y mayor riesgo.
- `pedido_comentarios` queda append-only desde la base, pero una futura edición controlada requeriría policies nuevas y diseño específico.
- `pedido_historial` queda sin inserción directa por tabla; los eventos futuros deben escribirse mediante RPC o flujos internos controlados.
- Registrar historial desde muchas acciones puede dejar eventos duplicados si no se define una estrategia clara.
- La conversión de solicitud a pedido afecta varias entidades y debe evitar inconsistencias si una parte del flujo falla.
- Los eventos de archivos deben registrar metadatos seguros, no rutas privadas ni URLs firmadas.
- El historial debe ser útil para operación, sin convertirse en auditoría exhaustiva difícil de mantener.

## Consideraciones Futuras

Más adelante se podría evaluar:

- menciones a usuarios internos;
- notificaciones por comentario o evento;
- edición controlada de comentarios con historial de edición;
- eliminación lógica de comentarios;
- filtros de historial por tipo de evento;
- historial unificado de cliente;
- exportación administrativa de eventos;
- auditoría legal completa si el negocio la requiere;
- vistas agregadas de actividad reciente.

## Conclusión

La decisión recomendada es mantener un modelo separado por entidad, compatible con las tablas ya existentes para pedidos y extendido con tablas específicas para solicitudes.

Esto permite avanzar en Fase 11 con bajo riesgo, RLS comprensible y una separación clara entre conversación interna e historial automático.
