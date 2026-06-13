# Pedidos internos

`src/lib/pedidos` agrupa la lógica server-side del módulo interno de pedidos.

## `listInternalPedidos`

`listInternalPedidos` carga el listado de pedidos desde Server Components usando el cliente de Supabase configurado en `src/lib/supabase/server.ts`.

El servicio valida `pedidos.view`, permite buscar por `q`, filtrar por `pedido_estado`, ordena por `created_at`, limita la carga y respeta RLS como defensa final. La búsqueda cubre número de pedido, título, descripción, cliente asociado y referencia o tipo de servicio de la solicitud origen. Las relaciones con cliente y solicitud siguen siendo opcionales, por lo que los pedidos manuales sin cliente no desaparecen.

También carga el progreso agregado de tareas en una consulta adicional por lote para que el listado muestre `Sin tareas`, porcentaje o `100% completado` sin exponer detalles completos de tareas. La búsqueda se combina con el filtro de estado mediante la barra común, que actualiza `q` tras 200 ms, aplica el estado inmediatamente, muestra `Buscando...` durante la espera y permite limpiar ambos controles. La consulta continúa server-side, no es un buscador global y no usa service role key.

## `getInternalPedidoById`

`getInternalPedidoById` carga el detalle interno de un pedido para `/dashboard/pedidos/[id]`.

Valida UUID, obtiene el perfil actual, valida `pedidos.view`, carga pedido, cliente, solicitud y personal asignado. Usa la relación explícita `solicitudes!pedidos_solicitud_id_fkey` para evitar ambigüedades.

El trabajador no accede a los módulos generales de clientes o solicitudes, pero RLS permite leer el cliente y la solicitud relacionados con pedidos que tiene asignados.

El trabajador tampoco accede al módulo general de usuarios. RLS de `perfiles` solo le permite leer su propio perfil y datos básicos del personal asignado a pedidos que puede acceder, para que el detalle muestre nombres y roles del equipo asignado sin abrir un listado general de perfiles.

## Creación Manual

`/dashboard/pedidos/nuevo` permite crear pedidos manuales con cliente registrado o sin cliente asociado.

La action `createPedidoAction` lee únicamente `cliente_id`, `title`, `description`, `priority` y `estimated_delivery_date`, y delega en `createInternalPedido`.

`createInternalPedido` requiere `pedidos.manage`, valida el input, valida el cliente solo cuando se envía `cliente_id`, crea el pedido con estado inicial `creado`, guarda `solicitud_id` como `null` y no asigna personal. Si no se selecciona cliente, guarda `cliente_id = null`; no captura datos temporales de cliente desde el formulario.

El número de pedido (`order_number`) no se acepta desde formularios ni se genera en TypeScript. La base de datos lo asigna al insertar el pedido con formato `P-YY-XXXX`, usando un contador anual transaccional y el año de la fecha de negocio `America/Havana`.

`estimated_delivery_date` es opcional, pero si se informa debe ser una fecha válida e igual o posterior al día actual. La validación usa los helpers centralizados de `src/lib/validators/date.ts`, apoyados en `src/lib/utils/date.ts` para calcular el día actual local. El `min` del formulario es solo una ayuda visual.

## Conversión Desde Solicitud

`createPedidoFromSolicitud` convierte una solicitud aprobada en pedido desde el detalle de solicitud. Conserva la validación de input y permisos, pero no escribe tablas directamente.

La página del detalle enlaza `solicitud_id` a la action; el formulario envía únicamente `title`, `description`, `priority` y `estimated_delivery_date`. El servicio requiere `solicitudes.manage` y `pedidos.manage`, valida el UUID enlazado y los campos editables, y delega en `public.convertir_solicitud_a_pedido`.

La RPC bloquea la solicitud con `FOR UPDATE`, exige usuario activo `admin` o
`supervisor`, estado `aprobada`, cliente asociado y ausencia de conversiones
previas. Después crea el pedido con `solicitud_id` y estado
`solicitud_recibida`, actualiza la solicitud a `convertida` con
`converted_order_id` y completa `archivos.pedido_id` para los archivos
`cliente_solicitud`. Todas las escrituras se confirman o revierten juntas.

`priority` es obligatoria, inicia visualmente en `normal` y se valida contra las prioridades reales del enum. `estimated_delivery_date` es opcional; si se informa debe ser una fecha válida e igual o posterior al día actual. El servicio usa los helpers de `src/lib/validators/date.ts` y la RPC repite la regla con la fecha de negocio de `America/Havana`.

`service_type` es solo referencia inicial de la solicitud y no se usa como título automático. El usuario interno debe definir el título real del pedido y puede ajustar la descripción operativa antes de convertir. La conversión no acepta `order_number`, `status`, `cliente_id`, `created_by`, `converted_order_id` ni campos de archivos desde el formulario. El número de pedido se asigna en base de datos y el estado inicial del pedido convertido sigue siendo `solicitud_recibida`.

La herencia de archivos es solo de metadata: conserva bucket, ruta,
visibilidad y autor, sin mover ni copiar objetos de Storage. La RPC es
`security definer`, revoca ejecución a `public` y `anon`, y concede `execute`
solo a `authenticated`.

Cuando un pedido muestra datos de su solicitud origen, el tipo de servicio debe renderizarse con `getSolicitudServiceTypeLabel` desde `src/lib/solicitudes/labels.ts` para evitar valores técnicos o históricos sin tildes en listados, detalles y dashboard.

## Cambio de Estado

`/dashboard/pedidos/[id]` incluye `PedidoStatusForm`.

La página del detalle enlaza `pedido_id` a `updatePedidoStatusAction`; el formulario envía únicamente `status`. La action delega en `updateInternalPedidoStatus`, que valida `pedidos.change_status`, UUID y estado real, verifica acceso al pedido y usa la RPC segura existente `public.actualizar_estado_pedido`.

Los estados vigentes de pedido son `creado`, `solicitud_recibida`, `en_revision`, `en_produccion`, `listo_entrega`, `entregado` y `cancelado`. La RPC es la autoridad para validar transiciones: `creado` avanza a `en_revision` o `cancelado`; `solicitud_recibida` avanza a `en_revision` o `cancelado`; `en_revision` avanza a `en_produccion` o `cancelado`; `en_produccion` avanza a `listo_entrega` o `cancelado`; `listo_entrega` avanza a `entregado`, vuelve a `en_produccion` o pasa a `cancelado`.

Un pedido manual no puede pasar directamente de `creado` a producción: primero
debe pasar a `en_revision`. Los pedidos con `workflow_type = encargo` requieren
al menos una tarea para pasar de `en_revision` a `en_produccion`, y requieren
que existan tareas y todas estén completas para pasar a `listo_entrega`. Los
pedidos con `workflow_type = impresion` pueden realizar esas dos transiciones
sin tareas.

Las transiciones disponibles no cambian: `entregado` solo se permite desde
`listo_entrega`, por lo que una impresión tampoco puede saltar directamente
desde `en_produccion`. `entregado` y `cancelado` son estados cerrados y no
admiten cambios posteriores. La UI usa `workflow_type` para orientar y
deshabilitar opciones, pero la validación real está en
`public.actualizar_estado_pedido`.

La RPC permite a `admin` y `supervisor` cambiar cualquier pedido y a `trabajador` cambiar solo pedidos asignados, sin conceder a trabajadores un `UPDATE` amplio sobre `pedidos`. Con asignaciones múltiples, cualquier trabajador asignado al pedido puede cambiar el estado porque la validación usa `private.is_assigned_to_pedido`, que comprueba la existencia de una relación en `pedido_trabajadores`.

Un `admin` o `supervisor` asignado a un pedido conserva sus permisos reales. La asignación operativa no cambia roles ni permisos, y un trabajador no asignado no puede cambiar el estado porque no pasa la validación de acceso del servicio ni la validación de la RPC.

La RPC carga el pedido con `FOR UPDATE`, por lo que las transiciones
simultáneas se procesan en serie. Antes de calcular el progreso bloquea con
`FOR SHARE` las tareas existentes; las actualizaciones y eliminaciones
concurrentes esperan, y las inserciones quedan coordinadas por la clave foránea
al pedido bloqueado.

Las mutaciones de tareas bloquean y validan también la fila del pedido. Después
de confirmar `listo_entrega`, `entregado` o `cancelado`, cualquier inserción,
actualización o eliminación de tareas queda bloqueada.

Al marcar `entregado`, la RPC guarda `actual_delivery_date` mediante
`private.current_business_date()`, usando `America/Havana`.

## Modelo de Tareas

La base de datos incluye `public.pedido_tareas` para modelar el progreso operativo real del pedido. Las tareas pueden ser `simple` o `cuantificada` mediante el enum `public.pedido_tarea_tipo`.

Las tareas simples no guardan cantidades. Las tareas cuantificadas requieren `target_quantity`, `completed_quantity >= 0` y avance menor o igual que la cantidad objetivo.

La detección de tipo vive en `task-validation.ts`: un título sin números independientes crea una tarea `simple`; un único entero positivo independiente crea una tarea `cuantificada` con `target_quantity` y `completed_quantity = 0`; dos o más números, decimales, cero o negativos fallan validación. Los dígitos dentro de palabras no cuentan, por lo que `Imprimir hojas A4` es simple y `Imprimir 40 hojas A4` es cuantificada.

El progreso agregado vive en `task-progress.ts`: sin tareas devuelve 0%; cada tarea simple vale 100% si está completada y 0% si está pendiente; cada tarea cuantificada usa `completed_quantity / target_quantity * 100`; el total es el promedio redondeado de todas las tareas.

El mismo cálculo se reutiliza en el detalle, el listado interno de pedidos y los paneles operativos del dashboard. Las consultas de dashboard y listado son server-side y no muestran metadata cruda ni datos técnicos de tareas.

RLS permite leer tareas a `admin`, `supervisor` y personal asignado mediante
`private.can_access_pedido(pedido_id)`. Para insertar, actualizar o eliminar,
`private.can_manage_pedido_tasks(pedido_id)` exige además que el pedido esté en
`creado`, `solicitud_recibida`, `en_revision` o `en_produccion`. La inserción
también exige `created_by = auth.uid()` para trazabilidad.

Los servicios server-side disponibles son `listPedidoTasks`, `createPedidoTask`, `updatePedidoTask` y `deletePedidoTask`. Todos usan `createClient`, el perfil actual y RLS; no aceptan campos técnicos desde entrada externa. Los servicios de mutación cargan el estado actual y aplican la misma regla que RLS.

`/dashboard/pedidos/[id]` integra `PedidoTasksSection` para crear, editar, eliminar, completar, reabrir y actualizar progreso de tareas desde formularios con Server Actions. El usuario no selecciona el tipo: el sistema lo detecta desde el título y los servicios mantienen los campos técnicos bajo control.

La página enlaza `pedido_id` a todas las actions de tareas. Los formularios no
lo repiten; conservan `task_id` como identificador secundario cuando la
operación actúa sobre una tarea existente.

En `listo_entrega`, `entregado` y `cancelado`, la sección conserva tareas y
progreso en modo lectura y oculta todos los controles de mutación. Para corregir
tareas de un pedido `listo_entrega`, primero hay que devolverlo a
`en_produccion`. La UI orienta; los servicios y RLS constituyen la defensa
efectiva.

## Asignación de Personal

`/dashboard/pedidos/[id]` incluye `PedidoWorkerAssignmentForm` para mostrar el personal asignado. Los usuarios con `pedidos.manage` ven controles para agregar y remover asignaciones; `trabajador` lo ve en modo lectura.

La página enlaza `pedido_id` a `assignPedidoWorkerAction`; el formulario envía únicamente `assigned_profile_id` y la action delega en `assignInternalPedidoWorker`.

La página enlaza `pedido_id` a `removePedidoWorkerAction`; el formulario conserva `assigned_profile_id` para identificar la asignación concreta y la action delega en `removeInternalPedidoWorker`.

La UI de detalle muestra múltiples usuarios asignados con su rol visible. El selector de alta oculta usuarios ya asignados cuando están en la lista de personal asignable; la restricción única `(pedido_id, assigned_profile_id)` y el servicio server-side siguen evitando duplicados.

`listAssignableWorkers` mantiene su nombre histórico, pero carga server-side personal interno activo con rol `admin`, `supervisor` o `trabajador`, ordenado por nombre. También se exporta el alias `listAssignableOrderUsers`.

`assignInternalPedidoWorker`:

- requiere `pedidos.manage`;
- valida UUID de pedido y usuario asignable;
- valida que el pedido exista;
- valida que el usuario destino exista, esté activo y tenga rol `admin`, `supervisor` o `trabajador`;
- no modifica el rol real ni los permisos del usuario asignado;
- usa las policies seguras existentes de `pedido_trabajadores`, que permiten insertar/eliminar solo a `admin` o `supervisor`;
- permite múltiples usuarios internos por pedido: inserta el usuario elegido si hace falta y no reemplaza ni elimina a los demás;
- evita duplicados comprobando primero la asignación y apoyándose en la restricción única `(pedido_id, assigned_profile_id)`;
- guarda `assigned_by` con el perfil que realiza la asignación y usa el default de `assigned_at`;
- no modifica estado, solicitud, `converted_order_id`, archivos ni datos generales del pedido.

`removeInternalPedidoWorker`:

- requiere `pedidos.manage`;
- valida UUID de pedido y usuario asignado;
- valida que el pedido exista;
- valida que la asignación exista;
- elimina solo la relación concreta `(pedido_id, assigned_profile_id)`;
- no elimina pedidos, perfiles, solicitudes ni modifica `converted_order_id`.

No se creó RPC nueva porque las policies existentes ya restringen inserción, actualización y eliminación de asignaciones a admin/supervisor. No se usa service role key. Trabajadores no pueden asignar ni remover personal.

## Comentarios Internos

`/dashboard/pedidos/[id]` incluye `PedidoCommentsSection` para listar y agregar comentarios internos del pedido.

`listPedidoComments` carga comentarios server-side desde `pedido_comentarios`, valida UUID, perfil interno, permiso `pedidos.view` y acceso al pedido. La consulta respeta RLS y ordena por `created_at` ascendente para lectura tipo conversación.

`createPedidoComment` valida UUID, perfil interno, permiso `pedidos.view`, acceso al pedido y content. El comentario es obligatorio, se guarda con `content` recortado y tiene límite de 2000 caracteres.

La página enlaza `pedido_id` a `createPedidoCommentAction` y el formulario envía únicamente `content`. No acepta `author_id`, autor ni fechas. El autor se toma del perfil autenticado y se guarda como `pedido_comentarios.author_id`.

## Contrato de actions del detalle

Las Server Actions de `/dashboard/pedidos/[id]` reciben `pedido_id` enlazado
desde la página server-side después de cargar y validar el pedido. Ninguna
mutación obtiene el ID desde `FormData`, `referer`, `next-url` u otra cabecera.
Los IDs secundarios necesarios para la operación, como `task_id` y
`assigned_profile_id`, sí permanecen en el formulario.

Las actions son adaptadores finos: leen solo los campos editables, delegan la
autorización y la mutación en servicios server-side o RPCs, y revalidan
`/dashboard`, `/dashboard/pedidos` y el detalle. Se mantienen en un único
archivo porque separarlas no reduciría complejidad.

Los comentarios son append-only. No hay edición, eliminación, menciones, notificaciones, adjuntos ni registro automático adicional de historial en esta subfase.

## Historial Visible

`/dashboard/pedidos/[id]` incluye `PedidoHistorySection` para listar eventos existentes en `pedido_historial`.

`listPedidoHistory` carga el historial server-side mediante la RPC segura `public.listar_pedido_historial`. Valida UUID, perfil interno, permiso `pedidos.view` y acceso al pedido. La RPC valida `private.can_access_pedido`, no abre `perfiles` globalmente y devuelve solo datos mínimos del actor: nombre y rol.

El historial es append-only. No hay edición ni eliminación. Los cambios de estado se registran mediante `public.actualizar_estado_pedido`. Los eventos de tareas se muestran con resúmenes controlados y título de tarea cuando existe, sin renderizar JSON ni metadata cruda.

Desde Fase 11.7A, la base de datos registra automáticamente estos eventos de pedido mediante triggers controlados:

- `pedido_creado` al insertar en `pedidos`;
- `trabajador_asignado` al insertar en `pedido_trabajadores`;
- `trabajador_removido` al eliminar de `pedido_trabajadores`;
- `archivo_subido` al insertar en `archivos` con categoría propia de pedido;
- eventos de tarea al crear, actualizar, eliminar, completar, reabrir o actualizar progreso en `pedido_tareas`.

Los archivos heredados desde solicitudes con `visibility = "cliente_solicitud"` no generan `archivo_subido` del pedido. El historial automático de solicitudes queda fuera de esta subfase.

La subida de archivos propios del pedido no permite elegir categoría. El servicio deriva `interno_pedido` para `creado`, `solicitud_recibida` y `en_revision`; `avance` para `en_produccion`; y `final_entrega` para `listo_entrega`. Los pedidos `entregado` o `cancelado` bloquean nuevas subidas. Un trabajador asignado puede subir la categoría correspondiente, incluida `interno_pedido`, mientras RLS y Storage bloquean pedidos no asignados y rutas que no coincidan con el estado.

El listado de pedidos combina búsqueda server-side y filtro por estado mediante
`ListFiltersBar`. La búsqueda usa un debounce de 200 ms, conserva los filtros en
la URL y respeta RLS; `trabajador` solo recibe pedidos asignados.

## Alcance por Rol

- `admin` y `supervisor` ven todos los pedidos.
- `admin` y `supervisor` pueden ver el detalle de cualquier pedido.
- `admin` y `supervisor` pueden crear pedidos manuales.
- `admin` y `supervisor` pueden convertir solicitudes aprobadas en pedidos.
- `admin` y `supervisor` pueden cambiar el estado de cualquier pedido.
- `admin` y `supervisor` pueden asignar o remover personal interno activo de un pedido.
- `admin` y `supervisor` pueden ver y agregar comentarios internos en cualquier pedido.
- `admin` y `supervisor` pueden ver historial interno de cualquier pedido.
- `admin` y `supervisor` pueden gestionar tareas de cualquier pedido en un estado permitido.
- `admin` o `supervisor` asignados a un pedido siguen conservando sus permisos reales.
- `trabajador` ve solo pedidos asignados mediante `pedido_trabajadores`.
- `trabajador` solo puede ver el detalle si está asignado al pedido.
- `trabajador` puede ver cliente y solicitud asociados a pedidos asignados.
- `trabajador` puede cambiar el estado solo de pedidos asignados.
- `trabajador` puede gestionar tareas solo de pedidos asignados y en un estado permitido.
- `trabajador` puede ver y agregar comentarios internos solo en pedidos asignados.
- `trabajador` puede ver historial interno solo de pedidos asignados.
- `trabajador` no puede crear, convertir, asignar ni remover asignaciones de pedidos.
- usuarios anónimos no pueden leer ni crear pedidos.

## Fuera de Esta Subfase

La edición general, la eliminación, notificaciones e historial avanzado quedan para próximas subfases.
