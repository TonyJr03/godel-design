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
- tareas y progreso operativo;
- archivos privados internos del pedido;
- comentarios internos de pedido;
- historial automático visible;
- búsqueda textual y filtro de estado;
- código público de seguimiento visible y copiable en el detalle interno;
- resumen financiero base 1:1 en `pedido_pagos`;
- visualizacion y actualizacion interna de pagos acumulados;
- visibilidad limitada para trabajadores asignados.

Todavía no incluye:

- edición general de pedido;
- eliminación de pedido;
- filtros o reportes avanzados sobre historial;
- tabla de movimientos o abonos individuales;
- edicion del total financiero desde el detalle;
- bloqueo de entrega por pago incompleto;
- notificaciones;
- reportes o estadísticas;
- responsables funcionales avanzados por pedido.

## Tipo de flujo operativo

`pedidos.workflow_type` diferencia la variante operativa del pedido:
`encargo` para trabajos personalizados o complejos e `impresion` para trabajos
directos de impresión. Este discriminador no reemplaza `service_type`, que
continúa siendo la referencia al servicio específico de la solicitud origen.

Los pedidos existentes quedan como `encargo`. La creación manual y la conversión
desde solicitud guardan el flujo correspondiente. El listado y el detalle
interno muestran esta diferencia y presentan las impresiones como un flujo
directo. No cambian los estados, las tareas almacenadas ni las reglas de
transición. Los detalles propios de impresión todavía no se normalizan en tablas
y se abordarán en una subfase posterior.

## Rutas del módulo

| Ruta | Uso |
|---|---|
| `/dashboard/pedidos` | Listado interno de pedidos con búsqueda textual y filtros por estado y tipo de flujo. |
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
| `order_number` | Número operativo interno generado por la base de datos. |
| `public_reference` | Codigo publico de seguimiento con formato `GD-XXXX-XXXX`. |
| `cliente_id` | Cliente asociado al pedido; puede ser `null` en pedidos manuales. |
| `solicitud_id` | Solicitud origen; puede ser `null` en pedidos manuales. |
| `workflow_type` | Flujo operativo: `encargo` o `impresion`. |
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
- `order_number` se genera en base de datos con formato `P-YY-XXXX`.
- La secuencia de `order_number` reinicia cada año según la fecha de negocio de `America/Havana` y se controla con `pedido_contadores`.
- `public_reference` no es `order_number`, no es UUID interno y no es
  secuencial.
- `order_number` no se devuelve en la consulta pública `/estado`; el cliente
  usa únicamente `public_reference`.
- Los pedidos manuales generan un `public_reference` propio.
- Los pedidos convertidos desde solicitud heredan el `public_reference` de la
  solicitud origen.

Las tablas oficiales normalizadas para comentarios e historial de pedidos son `pedido_comentarios` y `pedido_historial`. El enum de eventos de historial de pedidos es `pedido_historial_action`. Los comentarios de pedido están implementados en el detalle interno y son append-only. El historial de pedido está visible en el detalle interno y muestra los eventos existentes en `pedido_historial`.

## Modelo financiero base

Todo pedido tiene un resumen financiero unico en `pedido_pagos`. Esta tabla
separa el dominio financiero del dominio operativo: `pedidos` conserva estado,
flujo, cliente, descripcion, fechas y asignaciones; `pedido_pagos` conserva el
precio total, los montos pagados por efectivo y transferencia, el estado de pago
calculado y la fecha de pago completo si aplica.

El precio total puede ser cero por reglas normales de negocio como cortesia,
regalo, ajuste interno o trabajo sin cobro. Cuando `total_amount = 0`, el
resumen queda `pagado` y `paid_at` se setea porque no existe monto pendiente.

El estado financiero no se envia desde la UI ni lo decide la aplicacion:
la base de datos calcula `sin_pago`, `parcial` o `pagado` segun
`total_amount`, `paid_cash_amount` y `paid_transfer_amount`. No se permite
registrar montos negativos ni pagar mas que el total.

En la creacion manual se define el precio total del pedido. La RPC
`public.crear_pedido_manual` crea `pedidos` y `pedido_pagos` en una unica
transaccion: con precio `0`, el resumen queda `pagado`; con precio mayor que
`0`, queda `sin_pago` porque todavia no se registra pago inicial. La conversion
desde solicitudes aplica la misma regla mediante
`public.convertir_solicitud_a_pedido`.

El detalle interno del pedido muestra total, efectivo, transferencia, total
pagado, pendiente, estado y fecha de pago completo si aplica. `admin` y
`supervisor` pueden actualizar los montos acumulados `paid_cash_amount` y
`paid_transfer_amount` mediante `public.actualizar_pago_pedido`; el total no se
edita desde esta pantalla. La RPC valida permisos, montos no negativos, maximo
dos decimales y que la suma pagada no supere `total_amount`. El trigger de
`pedido_pagos` recalcula `payment_status` y `paid_at`. Cada actualizacion
registra historial con `pago_actualizado`. Todavia no hay movimientos o abonos
individuales. Para marcar un pedido como `entregado`, el pago debe estar
completo: `pedido_pagos.payment_status = 'pagado'`. Los pedidos con
`total_amount = 0` cumplen esta regla porque quedan `pagado`.

## Estados de pedido

| Estado | Significado |
|---|---|
| `creado` | Pedido creado manualmente, pendiente de revisión formal. |
| `solicitud_recibida` | Pedido creado desde una solicitud, pendiente de revisión operativa. |
| `en_revision` | Pedido en revisión interna. |
| `en_produccion` | Trabajo en fase de producción. |
| `listo_entrega` | Pedido listo para entregar. |
| `entregado` | Pedido entregado. |
| `cancelado` | Pedido cancelado. |

Un pedido manual inicia en `creado`. Un pedido convertido desde solicitud inicia en `solicitud_recibida`. El flujo esperado es `creado` -> `en_revision` -> `en_produccion` -> `listo_entrega` -> `entregado` para pedidos manuales y `solicitud_recibida` -> `en_revision` -> `en_produccion` -> `listo_entrega` -> `entregado` para pedidos convertidos. `cancelado` funciona como salida lateral desde los estados activos.

Los estados de pedido representan solo la fase general del flujo operativo. La
RPC `public.actualizar_estado_pedido` aplica las reglas operativas fuertes y usa
`workflow_type` para decidir si las tareas son requisito de avance.

Reglas de transición vigentes:

- `creado` puede pasar a `en_revision` o `cancelado`.
- `solicitud_recibida` puede pasar a `en_revision` o `cancelado`.
- `en_revision` puede pasar a `en_produccion` o `cancelado`.
- `en_produccion` puede pasar a `listo_entrega` o `cancelado`.
- `listo_entrega` puede pasar a `entregado`, volver a `en_produccion` o pasar a `cancelado`.
- `entregado` y `cancelado` son estados cerrados y no admiten cambios posteriores.

Para `encargo`, pasar de `en_revision` a `en_produccion` exige al menos una
tarea, y pasar de `en_produccion` a `listo_entrega` exige que existan tareas y
que todas estén completas. Para `impresion`, esas dos transiciones no requieren
tareas. Ambos flujos conservan la misma secuencia: `entregado` solo se permite
desde `listo_entrega`, sin saltos directos desde producción, y requiere pago
completo.

La UI del detalle usa el flujo, el progreso y el estado de pago ya cargados
para orientar al usuario, pero la validación real está en la RPC. Un trabajador
asignado puede cambiar estado siguiendo las mismas reglas; un trabajador no
asignado no accede al pedido.

## Modelo base de tareas

La base de datos incluye `pedido_tareas` para representar el progreso operativo real de un pedido. Cada tarea pertenece a un pedido y puede ser:

- `simple`: tarea sin cantidades.
- `cuantificada`: tarea con `target_quantity` y `completed_quantity`.

El usuario escribirá tareas en lenguaje normal. La detección automática vive en servicios server-side de TypeScript: un título sin números independientes crea una tarea `simple`; un único entero positivo independiente crea una tarea `cuantificada`; dos o más números, decimales, cero o negativos fallan validación. Los dígitos dentro de palabras no cuentan, así que `Imprimir hojas A4` es simple y `Imprimir 40 hojas A4` es cuantificada.

El progreso agregado se calcula como promedio redondeado: una tarea simple aporta 100% si está completada y 0% si está pendiente; una tarea cuantificada aporta `completed_quantity / target_quantity * 100`; sin tareas el progreso es 0%.

En esta subfase hay servicios server-side y UI en `/dashboard/pedidos/[id]` para listar, crear, editar título, eliminar, completar, reabrir y actualizar progreso de tareas. La tabla queda protegida con RLS e historial automático para que `admin`, `supervisor` y personal asignado puedan gestionar tareas de pedidos accesibles.

Las mutaciones se permiten solo en `creado`, `solicitud_recibida`, `en_revision`
y `en_produccion`. En `listo_entrega` las tareas quedan en modo lectura para
preservar el progreso completo; una corrección requiere volver primero a
`en_produccion`. En `entregado` y `cancelado` también quedan en modo lectura.
El listado y el progreso continúan visibles.

Los servicios validan el estado actual antes de mutar y las policies RLS de
inserción, actualización y eliminación aplican la misma regla mediante
`private.can_manage_pedido_tasks`. La policy de lectura conserva
`private.can_access_pedido`, por lo que esta restricción no abre permisos ni
impide consultar tareas existentes.

La UI no permite seleccionar `task_type`, `target_quantity`, autorías, fechas técnicas ni `sort_order`. La página enlaza `pedido_id` a las Server Actions; los formularios solo envían `task_id`, `title` o `completed_quantity` según la operación, y las actions delegan la validación en servicios server-side.

## Plantillas de tareas para encargos

El modelo de datos incluye `trabajo_plantillas` y `trabajo_plantilla_tareas` como base para trabajos predeterminados de encargos. Estas plantillas no son pedidos reales, no tienen estado operativo y sus tareas no tienen progreso.

`/dashboard/configuracion` permite a `admin` gestionar la cabecera de estas plantillas: nombre, descripción y estado activa/inactiva. El listado muestra también la cantidad de tareas asociadas.

Desde Alfa 3.3, cada plantilla tiene un detalle en `/dashboard/configuracion/plantillas/[templateId]` para definir sus tareas internas. Las tareas se listan por `sort_order`, pueden ser `simple` o `cuantificada` y usan el mismo parseo de titulo que las tareas de pedido: un entero positivo independiente convierte la tarea en cuantificada y guarda `target_quantity`.

El admin puede agregar, editar, eliminar y mover tareas arriba o abajo. No hay drag and drop ni campos de progreso. Eliminar una tarea de plantilla no toca pedidos ni `pedido_tareas`; el orden restante se normaliza para mantener una secuencia simple.

Desde Alfa 3.4, el detalle de un pedido de tipo `encargo` muestra un selector para aplicar plantillas activas con tareas cuando el usuario puede gestionar tareas y el estado del pedido permite mutarlas. La accion server-side llama a la RPC transaccional `public.aplicar_plantilla_tareas_pedido(p_pedido_id uuid, p_template_id uuid)`.

La RPC copia las tareas de `trabajo_plantilla_tareas` al final de `pedido_tareas`, preserva el orden relativo de la plantilla y calcula `sort_order` despues del maximo actual del pedido. No reemplaza ni borra tareas existentes. Las tareas copiadas quedan como tareas normales del pedido: se pueden editar, completar, reabrir, actualizar progreso o eliminar, y cuentan para el progreso y las reglas de avance de encargos.

La copia no crea una relacion viva con la plantilla. Editar, reordenar, desactivar o eliminar tareas internas de una plantilla no modifica tareas ya copiadas a pedidos. Aplicar la misma plantilla mas de una vez puede duplicar tareas en esta version; la UI lo advierte antes de aplicar.

La aplicacion de plantillas no esta disponible para pedidos `impresion`. La UI no muestra el selector en impresiones y la RPC tambien bloquea cualquier intento backend cuando `pedidos.workflow_type <> 'encargo'`.

Flujo completo vigente:

1. Un `admin` configura la plantilla en Configuracion.
2. Un `admin` define sus tareas internas ordenadas.
3. Un usuario autorizado abre un pedido de tipo `encargo`.
4. Si el estado permite gestionar tareas, selecciona una plantilla activa con tareas.
5. El sistema copia las tareas al final de `pedido_tareas`.
6. Las tareas copiadas quedan editables y se comportan como tareas normales.
7. El flujo no aplica a pedidos de `impresion`.
8. Aplicar dos veces la misma plantilla puede duplicar tareas en esta version.

## Listado interno

Archivos principales:

- Página: `src/app/dashboard/pedidos/page.tsx`
- Servicio: `src/lib/pedidos/list-internal-pedidos.ts`
- Componente: `src/components/pedidos/InternalPedidosList.tsx`

El listado carga server-side. `admin` y `supervisor` ven todos los pedidos;
`trabajador` ve solo pedidos asignados. La búsqueda usa `q` y cubre número de
pedido, título, descripción, cliente asociado y referencia o tipo de servicio de
la solicitud origen. La búsqueda y los filtros por estado y `workflow_type`
conviven mediante parámetros GET.

La barra común actualiza `q` con `router.replace` tras 200 ms sin escritura,
aplica los selectores de estado y tipo inmediatamente y permite limpiar todos
los controles.
El componente cliente solo sincroniza la URL: la consulta, los permisos y el
filtrado continúan en el servidor. Durante la espera muestra `Buscando...`.

Las relaciones de cliente y solicitud se mantienen opcionales: buscar no convierte los joins en internos ni oculta pedidos manuales sin cliente. El componente visual no consulta Supabase y RLS sigue limitando al trabajador a pedidos asignados. No es un buscador global; índices o búsqueda avanzada quedan como mejora futura si aumenta el volumen.

Cada pedido muestra un badge `Encargo` o `Impresión`, tanto en tarjetas
responsive como en la tabla de escritorio. Un valor inválido de
`workflow_type` en la URL se ignora de forma segura y produce una advertencia.

Para encargos, el listado mantiene el progreso operativo basado en tareas:
`Sin tareas`, porcentaje o tareas completadas. Para impresiones muestra
`Flujo directo` en lugar de presentar la ausencia de tareas como una carencia.
El cálculo y la carga real de tareas no cambian.

## Detalle de pedido

Archivos principales:

- Ruta: `/dashboard/pedidos/[id]`
- Servicio: `src/lib/pedidos/get-internal-pedido-by-id.ts`
- Componente: `src/components/pedidos/InternalPedidoDetail.tsx`

El detalle carga server-side, valida UUID, permiso y alcance por rol. Muestra el
tipo de pedido en el encabezado y en la metadata, además de cliente, solicitud,
personal asignado, comentarios internos y archivos privados. También muestra
`pedidos.public_reference` en un bloque copiable para compartir con el cliente.
`order_number` se conserva como número operativo interno y no se usa como código
público de seguimiento. La descripción conserva su estructura y saltos de línea.

En encargos se mantiene el bloque completo de tareas y su progreso. En
impresiones se presenta una nota de flujo directo en lugar del bloque principal
de tareas. La página sigue cargando el progreso, pero el formulario de estado
usa `workflow_type` para no bloquear impresiones por ausencia de tareas.
Asignación, archivos, comentarios, historial y cambio de estado permanecen
visibles para ambos tipos.

Un trabajador no puede ver pedidos no asignados, pero sí puede ver el cliente,
la solicitud relacionada, los comentarios internos y los archivos de pedidos
que tiene asignados. No se implementa edición general.

Las acciones y validaciones de tareas no cambian. Una impresión puede conservar
tareas existentes, pero no las necesita para avanzar entre revisión, producción
y listo para entrega.

## Comentarios internos de pedido

Archivos principales:

- Listado: `src/lib/pedidos/list-pedido-comments.ts`
- Creación: `src/lib/pedidos/create-pedido-comment.ts`
- Componente: `src/components/pedidos/PedidoCommentsSection.tsx`
- Action: `src/app/dashboard/pedidos/[id]/actions.ts`

El detalle de pedido permite ver y agregar comentarios internos asociados al pedido. Los comentarios son visibles solo para usuarios internos con acceso al pedido: `admin` y `supervisor` en cualquier pedido, y `trabajador` solo en pedidos asignados.

La página enlaza `pedido_id` a la action y el formulario solo envía `content`. El autor se toma server-side desde el perfil autenticado y se guarda en `pedido_comentarios.author_id`. No se acepta autor, fecha ni otros campos técnicos desde el formulario.

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
- eventos de creación, actualización, eliminación, completado, reapertura y
  progreso de tareas;
- cambios de estado mediante la RPC existente `public.actualizar_estado_pedido`.

No se crea trigger de actualización de estado para evitar duplicar los eventos que ya registra la RPC. Los archivos heredados de solicitudes con `visibility = "cliente_solicitud"` no generan `archivo_subido` del pedido.

## Archivos privados de pedido

Archivos principales:

- Listado: `src/lib/storage/list-pedido-files.ts`
- Subida: `src/lib/storage/upload-pedido-file.ts`
- Componente: `src/components/storage/PedidoFilesSection.tsx`
- Descarga: `/dashboard/pedidos/[id]/archivos/[fileId]/download`

El detalle de pedido permite listar, subir y descargar archivos privados asociados al pedido. Los objetos se guardan en el bucket privado `godel-files` y los metadatos se registran en `archivos`. El usuario no selecciona categoría: la aplicación la deriva server-side desde el estado actual del pedido.

Mapeo de estado a categoría:

- `creado`, `solicitud_recibida` o `en_revision`: `interno_pedido`.
- `en_produccion`: `avance`.
- `listo_entrega`: `final_entrega`.
- `entregado` o `cancelado`: no permiten nuevas subidas.

`admin`, `supervisor` y los trabajadores asignados pueden subir el archivo correspondiente al estado. Un trabajador no asignado no puede acceder al pedido ni subir archivos. RLS de `archivos` y las policies de Storage validan que el usuario tenga acceso y que `visibility`, estado y carpeta coincidan.

Los archivos enviados por el cliente en la solicitud pública también pueden aparecer en el pedido generado como `cliente_solicitud`. En ese caso se muestran como “Archivo enviado por cliente”. No se permite subir esa categoría desde el formulario interno de pedido; solo se hereda al convertir una solicitud en pedido.

La página enlaza `pedido_id` a la action y el formulario interno envía únicamente `file`. La descarga se realiza mediante URL firmada de corta duración. No se usan URLs públicas permanentes, no se aceptan categoría, `visibility`, `file_path`, bucket ni otros metadatos técnicos desde formularios y no se usa service role key. No se implementa eliminación de archivos en esta fase.

Desde Fase 11.7B, la conversión de una solicitud a pedido registra `convertida_a_pedido` en `solicitud_historial`. Ese evento no duplica `estado_cambiado` cuando la misma operación marca la solicitud como `convertida`, y la herencia de archivos no genera eventos nuevos de archivo.

## Creación manual

Archivos principales:

- Ruta: `/dashboard/pedidos/nuevo`
- Action: `src/app/dashboard/pedidos/nuevo/actions.ts`
- Servicio: `src/lib/pedidos/create-internal-pedido.ts`
- Formulario: `src/components/pedidos/PedidoForm.tsx`
- Validación: `src/lib/pedidos/order-validation.ts`
- Numeración: `private.generar_numero_pedido()` y `public.pedido_contadores`

La creación manual requiere `pedidos.manage`, por lo que solo `admin` y
`supervisor` pueden usarla. El formulario permite elegir mediante pestañas
entre `Encargo` e `Impresión`. Ambos tipos viven en la tabla `pedidos` y su
diferencia formal se guarda en `workflow_type`.

Ambas variantes permiten seleccionar un cliente existente o dejar
`Sin cliente asociado`; no aceptan estado, `solicitud_id`, número de pedido ni
personal asignado. El pedido manual se crea con `solicitud_id = null`, estado
inicial `creado` y `cliente_id = null` cuando no se selecciona cliente. No
existen campos temporales de cliente en este flujo.

La creacion manual exige `total_amount`, permite `0` y rechaza valores
negativos o no numericos. El servicio server-side valida el monto y llama a
`public.crear_pedido_manual`, que inserta el pedido y su resumen financiero en
`pedido_pagos` dentro de la misma transaccion. No se registra pago inicial:
`paid_cash_amount = 0` y `paid_transfer_amount = 0`. Por eso, un pedido manual
con precio `0` queda `pagado`; con precio mayor que `0`, queda `sin_pago`.
La actualizacion posterior de pago se realiza desde el detalle interno editando
solo efectivo y transferencia acumulados.

El encargo conserva título y descripción obligatorios. La impresión solicita
cantidad de copias, modo de color, tamaño de papel, caras y observaciones
opcionales. Si no se informa título, el servidor usa `Pedido de impresión`.
La descripción final de impresión se construye server-side con esas opciones;
no se confía en una descripción oculta enviada por el cliente.

La creación manual de impresión todavía no permite adjuntar archivos. Tampoco
modifica el listado o detalle de pedidos, la conversión desde solicitudes, las
tareas, el progreso, los estados ni sus reglas.

El número operativo interno del pedido se asigna en base de datos al insertar, con formato `P-YY-XXXX`. El contador es anual, se guarda en `public.pedido_contadores` y se incrementa dentro de la transacción para proteger la concurrencia. El año se obtiene mediante `private.current_business_date()` y no depende del día UTC de la sesión. La app no envía `order_number`.

El pedido manual tambien obtiene `public_reference` propio con formato
`GD-XXXX-XXXX`. Ese codigo no es secuencial, no reemplaza a `order_number` y
se muestra en el mensaje de éxito del formulario con opción de copiar. Este
código puede compartirse con el cliente y consultarse en la página pública
`/estado` mediante el parámetro `ref`, por ejemplo
`/estado?ref=GD-8F3A-92BC`.

La capa de consulta pública por `public_reference` existe a nivel server-side
mediante la RPC controlada `public.consultar_estado_publico` y se usa desde
`src/lib/public-tracking`; la UI pública no consulta Supabase desde componentes
cliente. Para pedidos devuelve solo información pública: `kind = pedido`,
`public_reference`, `workflow_type`, estado público, fechas de creación/entrega
y progreso agregado cuando aplica. No devuelve `order_number`, cliente,
contacto, descripción completa, archivos, nombres de tareas, comentarios,
historial, personal asignado ni UUIDs internos.

Cuando una solicitud fue convertida, la misma referencia pública resuelve el
pedido generado y `/estado` muestra el resultado como `Pedido`, no como
solicitud convertida. La Home incluye una entrada rápida que redirige a
`/estado?ref=...` sin consultar datos sensibles desde la página inicial.

`estimated_delivery_date` es opcional. Si se informa, debe ser una fecha válida e igual o posterior al día actual. La validación server-side usa los helpers de fecha de `src/lib/validators/date.ts`, apoyados en `src/lib/utils/date.ts` para calcular el día actual local; el `min` del input de fecha solo orienta la captura en la UI.

## Conversión de solicitud a pedido

Archivos principales:

- Servicio: `src/lib/pedidos/create-pedido-from-solicitud.ts`
- Componente: `src/components/solicitudes/SolicitudConvertPedidoForm.tsx`
- Action: `src/app/dashboard/solicitudes/[id]/actions.ts`

La conversión requiere `solicitudes.manage` y `pedidos.manage`. Solo se permite convertir solicitudes con estado `aprobada` y `cliente_id` asociado. La página enlaza `solicitud_id` a la action y el formulario envía únicamente `title`, `description`, `total_amount`, `priority` y `estimated_delivery_date`; no envía `workflow_type`.

`createPedidoFromSolicitud` conserva la validación de UX y la comprobación de
permisos, pero la escritura se ejecuta exclusivamente mediante
`public.convertir_solicitud_a_pedido(uuid, text, text,
public.pedido_prioridad, date, numeric)`. La RPC es transaccional, bloquea la
solicitud con `FOR UPDATE` y evita que dos intentos simultáneos creen pedidos
distintos.

`priority` es obligatoria, inicia visualmente en `normal` y se valida contra las prioridades reales del enum. `total_amount` tambien es obligatorio, permite `0`, rechaza negativos, valores no numericos y mas de 2 decimales. `estimated_delivery_date` es opcional; si se informa debe ser una fecha válida e igual o posterior al día actual. La UI limita el calendario desde hoy; el servicio valida con `src/lib/validators/date.ts` y la RPC repite la regla usando la fecha de negocio de `America/Havana`.

`service_type` queda como referencia inicial elegida por el cliente. No se usa
como título automático del pedido. En encargos, el usuario interno debe definir
`title` y `description`. En impresiones, el título es opcional y usa
`Pedido de impresión` cuando queda vacío; la descripción se precarga desde la
solicitud y puede ajustarse. Si se envía vacía, el servidor usa la descripción
original de la solicitud. El formulario no acepta `order_number`, `status`,
`cliente_id`, `workflow_type`, `created_by`, `converted_order_id`, campos de
archivos ni otros campos técnicos.

Cuando el pedido muestra datos de la solicitud origen, el tipo de servicio se renderiza con `getSolicitudServiceTypeLabel` desde `src/lib/solicitudes/labels.ts`; el valor guardado en `service_type` no se renombra ni se usa como título automático.

Al convertir:

- se crea un pedido con `pedidos.solicitud_id`;
- se copia `solicitudes.public_reference` a `pedidos.public_reference`;
- se copia `solicitudes.workflow_type` a `pedidos.workflow_type`;
- se usa el `title` definido por el usuario interno;
- se guarda la descripción operativa enviada desde el formulario de conversión;
- se crea `pedido_pagos` con `total_amount`, efectivo `0` y transferencia `0`;
- si `total_amount = 0`, el pago queda `pagado`; si es mayor que `0`, queda `sin_pago`;
- se guarda la `priority` definida por el usuario interno;
- se guarda `estimated_delivery_date` como fecha normalizada o `null`;
- se actualiza `solicitudes.status = convertida`;
- se actualiza `solicitudes.converted_order_id`;
- se asocian al pedido los archivos `cliente_solicitud` de la solicitud completando `archivos.pedido_id`;
- no se mueven ni copian archivos físicos en Storage;
- se evita doble conversión mediante validaciones y una restricción única existente;
- no se asigna personal.

Todas esas escrituras se confirman o revierten juntas. Si falla la creacion de
`pedido_pagos`, no queda pedido creado, solicitud convertida ni archivos
asociados a un pedido incompleto. La herencia de archivos solo completa
`archivos.pedido_id`; no cambia su ruta, bucket, visibilidad ni autor, y no
mueve objetos físicos en Storage.

La conversión mantiene el estado inicial `solicitud_recibida`, hereda
exactamente el `public_reference` de la solicitud y usa la misma numeración de
base de datos que la creación manual. La RPC bloquea y lee la solicitud como
autoridad del flujo, por lo que `workflow_type` y `public_reference` no dependen
de datos enviados por el navegador. La app no envía `order_number`. La RPC
revoca ejecución a `public` y `anon`, concede `execute` solo a `authenticated` y
valida internamente que el actor sea `admin` o `supervisor` activo.

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

La página enlaza `pedido_id` a la action, que acepta únicamente `status` desde el formulario. El estado se valida server-side contra el enum real simplificado. La actualización usa la RPC segura `public.actualizar_estado_pedido`, que evita abrir un `UPDATE` amplio sobre `pedidos` para trabajadores.

La RPC bloquea la fila del pedido con `FOR UPDATE` antes de leer su estado. Dos
transiciones simultáneas quedan serializadas: la segunda petición valida contra
el estado confirmado por la primera, no contra un estado obsoleto.

La secuencia de transiciones es idéntica para Encargo e Impresión. La diferencia
es que la RPC aplica las restricciones de existencia y finalización de tareas
solo cuando `pedidos.workflow_type = 'encargo'`. Las impresiones pueden pasar de
`en_revision` a `en_produccion` y de `en_produccion` a `listo_entrega` sin
tareas, pero no pueden saltar directamente a `entregado`.

Para pasar de `listo_entrega` a `entregado`, la RPC tambien valida
`pedido_pagos.payment_status = 'pagado'`. Si el resumen financiero no existe o
el pago esta `sin_pago` o `parcial`, la transicion falla aunque el usuario tenga
permiso para cambiar estado. La UI muestra un aviso de pago pendiente y
deshabilita la opcion `entregado`, pero la autoridad final es
`public.actualizar_estado_pedido`. La consulta publica `/estado` no expone
informacion de pago.

Antes de contar tareas, la RPC bloquea las tareas existentes con `FOR SHARE`.
Así espera cambios o eliminaciones en curso y mantiene estables esas filas
durante la decisión. Las nuevas tareas quedan coordinadas por el bloqueo del
pedido y la clave foránea. Las mutaciones de tareas también bloquean y validan
el pedido mediante `private.can_manage_pedido_tasks`, por lo que una operación
iniciada después de confirmar `listo_entrega`, `entregado` o `cancelado` queda
bloqueada.

Cuando el pedido pasa a `entregado`, `actual_delivery_date` usa
`private.current_business_date()`, basada en `America/Havana`.

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

Asignar un `admin` o `supervisor` no modifica su rol ni degrada sus permisos. Un
trabajador asignado puede ver el pedido y cambiar su estado siguiendo las
reglas operativas vigentes. La asignación y la remoción generan historial
automático; no se implementan notificaciones ni reportes especializados.

El trabajador no accede al módulo general de usuarios. La visibilidad de nombres y roles del personal asignado se controla mediante RLS de `perfiles` con alcance por pedido accesible, usando las asignaciones de `pedido_trabajadores` como contexto.

La documentación específica del flujo de asignación está en `docs/ORDER_ASSIGNMENTS_FLOW.md`.

## Seguridad general

Capas de seguridad aplicadas:

1. Proxy por rol.
2. Validación server-side de permisos.
3. Validación server-side de UUID e input.
4. RPC segura para cambio de estado.
5. RPC controlada para consulta pública por `public_reference`.
6. RLS en Supabase.
7. Errores controlados sin detalles técnicos.

Aclaraciones:

- no se usa service role key;
- la consulta pública por referencia no abre `select` anónimo directo sobre
  `pedidos` ni `solicitudes`;
- los componentes cliente no consultan Supabase directamente;
- la página enlaza `pedido_id` a todas las actions del detalle;
- los formularios de asignación solo envían `assigned_profile_id`;
- el formulario de comentario solo envía `content`;
- los formularios de tareas conservan `task_id` cuando actúan sobre una tarea existente;
- ninguna action obtiene el pedido desde `referer`, `next-url` u otra cabecera;
- trabajadores no pueden crear, convertir, asignar ni remover personal;
- trabajadores no acceden a los módulos generales de clientes o solicitudes, aunque RLS permite leer datos relacionados con pedidos asignados.

## Qué no incluye esta fase

- edición general de pedido;
- eliminación;
- filtros o reportes avanzados de historial;
- edición o eliminación de comentarios internos;
- notificaciones;
- reportes;
- facturación;
- múltiples responsables avanzados;
- reapertura de pedidos cerrados o flujos avanzados de corrección posteriores a entrega.

## Consideraciones futuras

Más adelante se podrá:

- agregar eliminación controlada de archivos privados del pedido;
- agregar filtros específicos al historial;
- implementar notificaciones;
- agregar reportes de producción;
- crear vistas por carga de trabajo;
- implementar edición controlada de campos del pedido.

El diseño técnico de comentarios internos e historial para la Fase 11 se documenta en `docs/COMMENTS_AND_HISTORY_MODEL.md`.

El diseño del dashboard operativo para la Fase 13 se documenta en `docs/DASHBOARD_OPERATIVE_MODEL.md`. Las métricas futuras de pedidos deben derivarse de consultas server-side, respetar RLS y filtrar los pedidos del trabajador a sus asignaciones.

Desde 13.6I, el dashboard y los paneles operativos también consideran tareas: pedidos pendientes de revisión o en revisión sin tareas, pedidos en producción con tareas pendientes, pedidos listos para entrega y progreso agregado por pedido. Los estados `creado` y `solicitud_recibida` se muestran como pendientes de revisión y se priorizan de la misma manera en los paneles operativos. No se implementan gráficos avanzados, reportes financieros ni productividad.

## Pruebas manuales recomendadas

- Verificar que `admin` ve todos los pedidos.
- Verificar que `supervisor` ve todos los pedidos.
- Verificar que `trabajador` ve solo pedidos asignados.
- Probar el filtro por estado.
- Filtrar por `Encargo` y por `Impresión`.
- Combinar búsqueda, estado y tipo de flujo.
- Forzar un `workflow_type` inválido y confirmar que se ignora con advertencia.
- Buscar por número `P-YY-XXXX`, título, descripción y cliente.
- Buscar por referencia o servicio de la solicitud origen.
- Combinar búsqueda con estado y limpiar los filtros.
- Confirmar que un pedido sin cliente sigue apareciendo al coincidir por número o título.
- Abrir detalle como `admin`.
- Abrir detalle como `supervisor`.
- Abrir detalle como trabajador asignado.
- Verificar que un trabajador no abre un pedido no asignado.
- Crear pedido manual con cliente registrado.
- Crear pedido manual con `Sin cliente asociado`.
- Verificar que el pedido manual tiene `solicitud_id = null`.
- Verificar que el pedido manual inicia en `creado`.
- Verificar que lista, detalle y dashboard muestran `Sin cliente asociado` cuando `cliente_id = null`.
- Convertir una solicitud aprobada con cliente.
- Verificar que el pedido convertido inicia en `solicitud_recibida`.
- Verificar que la conversión de un encargo exige título y descripción.
- Verificar que una impresión usa `Pedido de impresión` si el título queda vacío.
- Verificar que una impresión conserva la descripción original si se envía vacía.
- Verificar que el pedido convertido conserva el `workflow_type` de la solicitud.
- Verificar que la conversión muestra prioridad con valor `normal`.
- Verificar que la conversión permite fecha estimada opcional.
- Convertir sin fecha estimada y confirmar que el pedido queda sin fecha.
- Convertir con fecha estimada de hoy o futura y confirmar que se guarda.
- Forzar una fecha estimada pasada y confirmar error server-side.
- Verificar que el pedido convertido no usa `service_type` como título automático.
- Verificar que la descripción ajustada se guarda en el pedido.
- Verificar que se crea pedido con `solicitud_id`.
- Verificar que la solicitud queda `convertida`.
- Verificar que se guarda `converted_order_id`.
- Intentar doble conversión.
- Cambiar estado como `admin`.
- Cambiar estado como `supervisor`.
- Cambiar estado como trabajador asignado.
- Cambiar un pedido manual de `creado` a `en_revision`.
- Intentar pasar de `creado` directamente a `en_produccion` y confirmar el bloqueo.
- Cancelar un pedido desde `creado` y confirmar que queda cerrado.
- Cambiar estado entre `solicitud_recibida`, `en_revision`, `en_produccion`, `listo_entrega`, `entregado` y `cancelado`.
- Confirmar que el selector no muestra estados eliminados.
- Confirmar que listados y filtros no muestran estados eliminados.
- Confirmar que el dashboard no muestra tarjeta de diseño.
- Confirmar que las métricas de activos, producción, listos, atrasados y próximos a entrega funcionan.
- Confirmar que los encargos muestran `Sin tareas`, progreso porcentual o tareas completadas.
- Confirmar que las impresiones muestran `Flujo directo` en el listado.
- Confirmar que el detalle muestra el badge y la metadata del tipo de pedido.
- Confirmar que una impresión muestra la nota de flujo directo en lugar del bloque completo de tareas.
- Confirmar que estado, asignación, archivos, comentarios e historial siguen visibles en impresiones.
- Confirmar que los paneles operativos priorizan pedidos `creado` y `solicitud_recibida` como pendientes de revisión y muestran progreso, atrasados, próximos, sin tareas, con tareas pendientes y listos para entrega.
- Confirmar que el historial registra cambios de estado con etiquetas vigentes.
- En un encargo, intentar pasar a `en_produccion` sin tareas y confirmar bloqueo.
- En un encargo, crear una tarea y pasar a `en_produccion`.
- En un encargo, intentar pasar a `listo_entrega` con tareas incompletas y confirmar bloqueo.
- En un encargo, completar todas las tareas y pasar a `listo_entrega`.
- En una impresión sin tareas, pasar de `en_revision` a `en_produccion`.
- En una impresión sin tareas, pasar de `en_produccion` a `listo_entrega`.
- En una impresión, intentar pasar directamente de `en_produccion` a `entregado` y confirmar bloqueo.
- Intentar pasar de `listo_entrega` a `entregado` con pago `sin_pago` y confirmar bloqueo.
- Intentar pasar de `listo_entrega` a `entregado` con pago `parcial` y confirmar bloqueo.
- Pasar de `listo_entrega` a `entregado` con pago `pagado`.
- Pasar de `listo_entrega` a `entregado` con total `0`, que queda `pagado`.
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

El módulo vigente cubre creación manual y desde solicitud, estados controlados,
tareas y progreso, asignaciones múltiples, archivos privados, comentarios,
historial y búsqueda server-side con filtro de estado.
