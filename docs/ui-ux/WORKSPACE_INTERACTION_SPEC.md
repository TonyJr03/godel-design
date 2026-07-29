# Especificación funcional y de interacción del workspace interno

## 1. Propósito

El workspace interno resuelve el exceso de profundidad vertical en los detalles
de pedidos y solicitudes. La pantalla actual ya es funcional y segura, pero
apila cabecera, referencia pública, resumen, estado, tareas, archivos,
comentarios, historial, pagos, personal, cliente, solicitud de origen y metadata
en un flujo largo. Eso obliga a perder contexto mientras se trabaja.

En este proyecto, "interfaz tipo aplicación" significa que la información
necesaria para decidir permanece visible, mientras la gestión secundaria se abre
en paneles contextuales. No significa mover reglas al navegador, crear un SPA
independiente ni reemplazar Server Components. La página seguirá cargando datos
en servidor, calculando permisos en servidor, usando las mismas Server Actions,
RPC, RLS y validaciones de dominio.

La primera implementación será el workspace de pedido. El pedido es el núcleo
operativo, contiene más subdominios, cruza roles, tiene flujos `encargo` e
`impresion`, y validará el patrón más exigente antes de extenderlo a solicitudes.

No cambian:

- URLs visibles.
- Permisos por rol.
- RLS, RPC ni Storage.
- Server Actions existentes.
- Contratos de formularios.
- Reglas de transición de estados.
- Descarga interna de archivos.
- Comentarios e historial append-only.
- Estrategia inicial de carga server-side.

## 2. Principios

1. La información necesaria para trabajar permanece visible.
2. La gestión secundaria vive en paneles contextuales.
3. Los permisos siguen calculándose en servidor.
4. La interfaz no reemplaza RLS, RPC ni validaciones.
5. Los paneles no deben esconder acciones críticas.
6. El móvil tiene una composición propia.
7. El scroll se reduce, pero no se elimina artificialmente.
8. Iconos y colores nunca sustituyen etiquetas textuales.
9. No se convierte toda la página en Client Component.
10. Se reutilizan componentes existentes antes de crear variantes.

## 3. Composición desktop

La composición de escritorio queda unificada así:

1. Cabecera del workspace.
2. Contenido principal permanente.
3. Action rail icon-only desde `xl`.

El resumen operativo no debe vivir en una columna intermedia. Su función es dar
contexto transversal antes de que el usuario elija trabajar en el contenido
principal o abrir un panel contextual.

Nota vigente 4.5: esa banda ya no forma parte del diseño aprobado. La
implementación final usa cabecera compacta sin CTA primaria ni resumen operativo
permanente.

Contrato vigente de contención:

- Solicitudes y Pedidos usan `desktopMode="contained"`.
- Desde `xl`, el workspace ocupa la altura disponible del viewport; la cabecera
  consume su altura natural y el área principal consume el espacio restante.
- El contenido principal no tiene scroll global propio. Cada sección permanente
  ocupa su celda, conserva encabezado fijo y desplaza solo su cuerpo cuando el
  contenido no cabe.
- El action rail contenido usa la altura asignada por el grid; no calcula una
  altura independiente desde el viewport ni aumenta la altura del área principal.
- Dashboard usa `desktopMode="flow"` y conserva scroll documental con rail sticky
  basado en viewport. El modo contenido no es una regla universal para todos los
  workspaces.

Estructura conceptual:

```text
+------------------------------------------------------------------+
| Cabecera                                                         |
+------------------------------------------------------------------+
+----------------------------------------------------+-------------+
| Contenido principal                                | Rail iconos |
|                                                    |             |
+----------------------------------------------------+-------------+
```

## 4. Cabecera del pedido

La cabecera del pedido debe reemplazar el título genérico "Detalle del pedido".
El `h1` principal debe ser `pedido.title`. El número operativo
`pedido.order_number` queda como referencia secundaria prominente.

Contenido exacto:

- Botón/enlace para volver a `/dashboard/pedidos`.
- `order_number`, por ejemplo `P-26-0347`.
- Título real del pedido.
- Badge de workflow: `Encargo` o `Impresion`.
- Estado operativo con `StatusBadge`.
- Prioridad con `PriorityBadge`.
- Fecha estimada o fecha real de entrega cuando exista.
- Referencia publica copiable inline.
- Sin CTA primaria de gestion ni avisos criticos verticales bajo la cabecera.
- Acción principal cuando exista.
- Indicadores críticos.

Nota vigente 4.5: los dos bullets anteriores son historicos y no aplican al
workspace final.

Las acciones principales de la cabecera no ejecutan mutaciones directamente.
Solo abren el panel correspondiente. Las transiciones continúan controladas por
las reglas actuales en servicios, RPC, RLS y formularios existentes.

Acción principal sugerida por estado:

| Condición | Acción principal | Panel que abre |
| --- | --- | --- |
| `creado` o `solicitud_recibida` | Abrir estado | Estado |
| `en_revision`, `encargo` sin tareas | Abrir tareas | Tareas |
| `en_revision`, listo para avanzar | Abrir estado | Estado |
| `en_produccion`, tareas pendientes | Abrir tareas | Tareas |
| `en_produccion`, `impresion` | Abrir estado | Estado |
| `listo_entrega`, pago pendiente | Abrir pagos | Pagos |
| `listo_entrega`, pago completo | Abrir estado | Estado |
| `entregado` o `cancelado` | Sin acción primaria de gestión | n/a |

Indicadores críticos:

- Sin tareas en `encargo` activo.
- Tareas incompletas bloqueando avance.
- Pago pendiente o parcial cuando bloquea entrega.
- Sin personal asignado.
- Sin cliente asociado.
- Pedido atrasado cuando la fecha estimada está vencida y el pedido sigue
  activo.
- Error parcial de carga de tareas, archivos, comentarios o historial.

Jerarquía conceptual:

```text
[Volver a pedidos]                  [Abrir panel principal]
P-26-0347 · Encargo · En producción · Alta
Título real del pedido
Cliente / Entrega estimada / Pago / Personal
[Avisos críticos compactos]
```

Tipografía conceptual:

- `order_number`: mono, 14 px, semibold.
- `h1`: 28-32 px desktop, 24-28 px móvil, semibold.
- Badges: compactos, después de referencia.
- Metadata crítica: 14 px, en una línea envolvente.

## 5. Resumen operativo del pedido

Estado vigente 4.5: este bloque fue retirado del workspace de pedidos. La
pantalla final no renderiza resumen operativo permanente ni bloque visual
equivalente entre cabecera y contenido principal. Sus datos se distribuyen entre
las superficies vigentes:

- La cabecera conserva identidad operativa, estado, prioridad, fechas relevantes
  y referencia pública.
- En `encargo`, el progreso vive en `Tareas del pedido`.
- Información, cliente, personal, pagos y solicitud de origen viven en sus
  paneles o secciones correspondientes.
- Archivos y tareas se muestran en el contenido principal cuando aplican, sin
  crear una banda intermedia.

Las reglas de seguridad se mantienen: no exponer `file_path`, bucket, UUIDs como
dato primario ni información financiera pública. La referencia pública es
`public_reference`, no `order_number`.

## 6. Área principal de pedido `encargo`

El contenido permanente de un `encargo` usa esta composición:

```text
+----------------------------------------------------+
| Trabajo solicitado                                 |
+------------------------+---------------------------+
| Tareas del pedido      | Archivos asociados        |
+------------------------+---------------------------+
```

Debe mostrar:

- Descripción y especificaciones del trabajo.
- Progreso global en presentación inline dentro de `Tareas del pedido`.
- Todas las tareas cargadas: pendientes, parcialmente avanzadas o completadas.
- Todos los archivos asociados según criterio determinista.
- Advertencias que bloqueen avance.

Desde `xl`, la descripción superior conserva altura compacta y Tareas/Archivos
consumen la altura restante. Ambas secciones tienen encabezado fijo y cuerpo
desplazable independiente. Por debajo de `xl`, las cards crecen según su
contenido y el documento desplaza normalmente.

### Tareas del pedido

Debe permitir entender:

- Qué está pendiente.
- Qué está parcialmente avanzado cuando existan cantidades.
- Qué está completado.
- Progreso porcentual.
- Siguiente acción operativa.

Contenido vigente:

- `PedidoProgressBar` con `presentation="inline"`.
- Todas las tareas cargadas.
- Orden operativo: pendientes primero, después parcialmente avanzadas cuando
  tengan cantidades, y por último completadas.
- `sort_order` dentro de cada grupo.
- Estado textual por tarea.

No debe incluir todos los formularios de gestión en el cuerpo principal.
No se introduce ningún estado de dominio adicional para tareas; las categorías
visuales se derivan de los datos actuales: pendientes, parcialmente avanzadas
por cantidades y completadas.

La sección principal es una vista operativa de lectura. La gestión completa
continúa dentro del panel Tareas.

### Progreso de tareas

`PedidoProgressBar` tiene dos presentaciones:

- `inline`, usada por `PedidoTasksPreview`: track horizontal, relleno y
  porcentaje final en una sola línea; sin card, resumen, badge ni texto
  adicional. Permanece fijo bajo el encabezado mientras la lista de tareas se
  desplaza.
- `detailed`, usada por defecto y consumida por `PedidoTasksSection`: card con
  resumen de tareas, porcentaje, badge de pendientes o completadas y barra de
  mayor jerarquía.

Ambas variantes exponen semántica accesible de `progressbar`.

### Gestión completa de tareas

Vive en el panel Tareas y reutiliza `PedidoTasksSection`.

Capacidades existentes:

- Crear tarea.
- Editar título.
- Actualizar progreso cuantificado.
- Completar.
- Reabrir.
- Eliminar.
- Aplicar plantilla activa.

No inventar:

- Estados de dominio nuevos para tareas.
- Drag and drop.
- Responsables por tarea.
- Fechas por tarea.
- Comentarios por tarea.
- Dependencias entre tareas.

Reglas:

- Las mutaciones solo se permiten en `creado`, `solicitud_recibida`,
  `en_revision` y `en_produccion`.
- En `listo_entrega`, `entregado` y `cancelado` el panel queda en lectura.
- La autoridad final sigue en servicios/RLS/RPC.

Especificacion visual vigente:

- `PedidoTasksSection` mantiene la creacion de tareas, la aplicacion de
  plantillas y la barra de progreso global.
- Las tareas registradas viven en una unica superficie con borde y divisores
  entre filas.
- Cada `PedidoTaskItem` es una fila compacta, no una card independiente.
- En escritorio, la fila coloca contenido y acciones en columnas: titulo y
  estado/progreso a la izquierda, acciones a la derecha.
- En movil, el titulo y el estado/progreso conservan ancho disponible y las
  acciones pueden pasar debajo y envolver sin producir overflow horizontal.

Jerarquia conceptual de una fila:

```text
Titulo de la tarea                    [operativa] [editar] [eliminar]
Estado o progreso
```

El texto secundario comunica siempre el estado con texto visible. Para tareas
cuantificadas usa el formato `{completed_quantity} de {target_quantity} ·
Pendiente` o `{completed_quantity} de {target_quantity} · Completada`. El tipo
tecnico `simple` o `cuantificada` no aparece como badge visible, aunque sigue
existiendo en el DTO y en las reglas server-side.

El orden de acciones de una fila coincide visualmente con el orden del DOM y el
orden de teclado. No se usan clases CSS para alterar artificialmente el orden.
Editar siempre ocupa la segunda posicion y Eliminar siempre la ultima. La
primera accion depende de la tarea:

```text
simple pendiente       -> Completar
cuantificada pendiente -> Actualizar progreso
completada             -> Reabrir
```

Los tonos vigentes son: Completar y Actualizar progreso en `primary`; Reabrir y
Editar en `secondary`; Eliminar en `danger`. Todos los botones de fila son
icon-only, con iconos decorativos y nombre accesible completo mediante
`aria-label` y `title`.

Estados conceptuales por fila:

```ts
"idle"
"edit-title"
"edit-progress"
"confirm-delete"
```

Estos estados son mutuamente excluyentes: una fila no edita titulo y progreso a
la vez, ni confirma eliminacion mientras edita. En `edit-title`, el titulo se
sustituye por un input inline con foco automatico. En `edit-progress`, el texto
secundario de una tarea cuantificada se sustituye por el editor numerico. `Enter`
envia el formulario, `Escape` cancela, y cancelar o guardar correctamente
devuelve el foco al trigger correspondiente. Los errores quedan asociados al
campo, mantienen abierto el editor y conservan el valor introducido. Pending es
visible y accesible; las acciones incompatibles se deshabilitan y los spinners
respetan reduced motion. La eliminacion conserva confirmacion destructiva
inline.

La edicion de titulo muestra la advertencia contextual:

```text
Los números del título definen la cantidad de la tarea y pueden reiniciar su progreso.
```

Esa advertencia no mueve reglas al cliente: la deteccion de numeros y la
decision `simple`/`cuantificada` siguen exclusivamente en servicios server-side.

Limites arquitectonicos:

- Esta compactacion no cambia Server Actions.
- No cambia servicios.
- No cambia validaciones.
- No cambia RLS.
- No cambia RPC.
- No cambia base de datos.
- No generaliza el componente con las tareas de plantilla.

Las tareas de plantilla y las tareas de pedido comparten un patron visual, pero
conservan componentes separados. Las tareas de pedido tienen progreso,
completar, reabrir y bloqueos por estado; las plantillas no tienen ese mismo
dominio operativo.

## 7. Área principal de pedido `impresion`

La impresión no debe presentarse como un encargo incompleto. Debe priorizar:

- Descripción.
- Especificaciones registradas.
- Cantidad y opciones si ya vienen en `description`.
- Archivos.
- Entrega.
- Estado operativo.

Desde `xl`, la composición permanente conserva dos columnas:

```text
+------------------------+---------------------------+
| Descripción            | Archivos asociados        |
+------------------------+---------------------------+
```

Ambas secciones consumen la altura disponible, conservan encabezado fijo y
desplazan su cuerpo cuando sea necesario. Por debajo de `xl`, las cards crecen y
el documento desplaza normalmente.

No mostrar "Sin tareas" como deficiencia. La ausencia de tareas es normal para
`impresion` y se expresa mediante la composición del workflow: descripción y
archivos asociados, sin bloque permanente adicional.

Tareas:

- No aparecen como acción principal en la barra móvil inicial de impresión.
- No son requisito para avanzar de `en_revision` a `en_produccion`.
- No son requisito para avanzar de `en_produccion` a `listo_entrega`.
- Si existen tareas históricas o agregadas, pueden consultarse desde
  Información o una sección secundaria futura, pero no deben dominar el flujo.

## 8. Archivos principales

### Lista principal

Debe mostrar todos los archivos cargados usando un criterio determinista:

- Orden descendente por `created_at`.
- Categorías existentes.
- Fecha.
- Autor cuando esté disponible.
- Descarga y metadata disponibles.
- Lista desplazable internamente desde `xl` cuando no quepa en la celda asignada.

La lista principal se deriva de datos existentes y no requiere campos nuevos.
Para solicitud, el encabezado vigente es `Archivos adjuntos`. Para pedido, el
encabezado vigente es `Archivos asociados`.

Para pedido, reutiliza datos de `listPedidoFiles`. Para solicitud, reutiliza
`listSolicitudFiles`. La lista principal nunca recibe ni muestra `file_path`,
bucket, signed URL o metadata sensible.

### Gestión completa

Vive en el panel Archivos.

Pedido:

- Reutiliza `PedidoFilesSection`.
- Lista completa.
- Subida de archivo si `canUpload` y estado lo permiten.
- Descarga por `/dashboard/pedidos/[id]/archivos/[fileId]/download`.
- Categorías derivadas del estado: `interno_pedido`, `avance`,
  `final_entrega`.
- Errores y mensajes actuales.

Solicitud:

- Reutiliza `SolicitudFilesPanel`.
- Lista completa.
- Descarga por `/dashboard/solicitudes/[id]/archivos/[fileId]/download`.
- Sin subida interna en la versión actual.

El panel Archivos sigue siendo la vista contextual completa de consulta y
gestión/subida cuando aplique; no sustituye ni limita la lista principal.

No cambiar contratos de Storage ni exponer `file_path`.

## 9. Catálogo de paneles del pedido

Orden inicial:

1. Estado.
2. Tareas, solo `encargo`.
3. Archivos.
4. Comentarios.
5. Personal.
6. Pagos.
7. Historial.
8. Información.

| Panel | Icono Lucide | Roles | Workflows | Modo | Componente actual | Crítico | Vacío | Error | Indicador |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Estado | `GitBranch` o `RefreshCcw` | admin, supervisor, trabajador asignado | encargo, impresion | Gestión limitada | `PedidoStatusForm` | Transiciones permitidas, bloqueos por tareas/pago | Pedido cerrado sin acciones | Error action/status | Estado actual, bloqueo |
| Tareas | `ListChecks` | admin, supervisor, trabajador asignado con acceso | encargo | Gestión según estado | `PedidoTasksSection` | Bloquea avance de encargo | Sin tareas | Error de carga/plantillas | Cantidad pendientes, % |
| Archivos | `Files` o `Paperclip` | admin, supervisor, trabajador asignado | encargo, impresion | Gestión/subida según estado | `PedidoFilesSection` | Descarga y subida controlada | Sin archivos | Error de carga/subida | Cantidad |
| Comentarios | `MessageSquare` | admin, supervisor, trabajador asignado | encargo, impresion | Gestión append-only | `PedidoCommentsSection` | Notas internas | Sin comentarios | Error de carga/action | Cantidad |
| Personal | `UsersRound` | lectura todos; gestión admin/supervisor | encargo, impresion | Lectura/gestión | `PedidoWorkerAssignmentForm` | Asignación y acceso trabajador | Sin personal | Error personal asignable | Cantidad |
| Pagos | `CreditCard` | lectura todos; gestión admin/supervisor | encargo, impresion | Lectura/gestión | `PedidoPaymentSection` | Pago bloquea entrega | Sin resumen financiero | Error action/missing payment | Estado pago |
| Historial | `History` | admin, supervisor, trabajador asignado | encargo, impresion | Lectura | `PedidoHistorySection` | Auditoría | Sin eventos | Error de carga | Cantidad |
| Información | `Info` | admin, supervisor, trabajador asignado | encargo, impresion | Lectura | Cliente, solicitud origen, metadata actuales | Contexto y trazabilidad | Sin cliente/origen | Error parcial futuro | Avisos |

El panel Tareas no debe aparecer en la barra móvil de `impresion` por defecto.
Puede omitirse completamente del action rail en impresión o moverse a
Información si existen tareas heredadas.

## 10. Matriz por rol del pedido

| Panel / acción | admin | supervisor | trabajador |
| --- | --- | --- | --- |
| Acceso a detalle | Todos los pedidos | Todos los pedidos | Solo pedidos asignados |
| Estado | Gestión | Gestión | Gestión limitada si asignado |
| Tareas, lectura | Sí | Sí | Sí, si asignado |
| Tareas, gestión | Sí, si estado permite | Sí, si estado permite | Condicionado por acceso y estado; servicios/RLS validan |
| Archivos, lectura/descarga | Sí | Sí | Sí, si asignado |
| Archivos, subida | Sí, si estado permite | Sí, si estado permite | Sí accede al pedido y estado permite, según `canUpload` actual |
| Personal, lectura | Sí | Sí | Sí, si asignado |
| Personal, asignar/quitar | Sí | Sí | No |
| Pagos, lectura | Sí | Sí | Sí, si asignado |
| Pagos, actualizar | Sí | Sí | No |
| Comentarios, leer/agregar | Sí | Sí | Sí, si asignado |
| Historial | Sí | Sí | Sí, si asignado |
| Información cliente/origen | Sí | Sí | Sí, si está relacionada con pedido asignado |

Notas:

- No se definen permisos nuevos.
- `trabajador` no gestiona pagos.
- `trabajador` no gestiona asignaciones.
- `trabajador` no accede a pedidos no asignados.
- Las transiciones de estado siguen `public.actualizar_estado_pedido`.
- Admin y supervisor conservan capacidades actuales aunque también estén
  asignados operativamente.

## 11. Action rail de escritorio

Ubicación:

- Dentro del área de detalle, a la derecha del contenido principal desde `xl`.
- Junto al contenido principal, dentro de la superficie contenida.
- No reemplaza el sidebar global.
- Ancho conceptual: columna compacta icon-only.

Requisitos:

Nota vigente 4.5: el rail desktop aprobado es icon-only. Usa una columna
compacta de botones con target mínimo de 44 px. Cada botón conserva
`aria-label` y `title` con label, `statusLabel`, badge real cuando exista,
motivo de bloqueo cuando aplique, estado activo y foco visible. El tono es una
señal complementaria, nunca la única.

- Icono visible en cada acción.
- Target mínimo 44 px.
- Estado activo con borde/superficie/texto, no solo color.
- Contadores opcionales en texto o badge.
- Separación por grupos: trabajo, colaboración, administración, auditoría.
- Foco visible.
- Hover discreto.
- Al abrir un panel, solo un panel queda activo.

Contrato de altura:

- En workspaces contenidos, como Solicitudes y Pedidos, el rail ocupa la altura
  entregada por el grid, puede encogerse con el área principal y no declara una
  altura propia basada en viewport. No usa posición sticky ni debe aumentar la
  altura del grid. Si las acciones no caben, desplaza verticalmente dentro de su
  propio contenedor.
- En workspaces flow, como Dashboard, el rail conserva posición sticky y puede
  usar altura basada en viewport sin alterar el scroll documental.

Orden:

1. Estado.
2. Tareas, solo `encargo`.
3. Archivos.
4. Comentarios.
5. Personal.
6. Pagos.
7. Historial.
8. Información.

Razón del orden: primero avance operativo, después material de trabajo,
comunicación, asignación, finanzas, auditoría y contexto secundario.

## 12. Tablet

Entre `md` y antes de `xl`:

Nota vigente 4.5: tablet conserva toolbar textual de una sola fila con icono y
label visibles. `statusLabel`, estado activo y badge real deben estar en el
nombre accesible y `title`; el badge visual se renderiza flotante en la esquina
superior derecha para no cambiar la altura del boton. El dialog lateral usa el
mismo contrato de contenido `scroll`/`fill`.

- Cabecera compacta con enlace textual "Volver a pedidos" antes de la metadata.
- Toolbar contextual horizontal bajo la cabecera.
- Drawer desde la derecha.
- Acciones menos frecuentes bajo "Más" si no hay espacio.
- No mantener simultáneamente sidebar global y action rail ancho.
- El documento puede tener scroll normal.
- El drawer puede tener scroll interno.
- La toolbar mide ancho real disponible con `ResizeObserver` y
  `requestAnimationFrame`: muestra siempre las tres primeras acciones
  disponibles, agrega acciones si caben y reserva "Mas" solo cuando quedan
  acciones ocultas.
- "Mas" contiene exactamente las acciones que no quedaron directas, incluidas
  acciones deshabilitadas si existen. No duplica acciones directas.

Toolbar sugerida:

- `Estado`.
- `Tareas` en encargo o `Archivos` en impresión.
- `Archivos`.
- `Más`.

## 13. Barra móvil

La barra inferior muestra máximo cuatro accesos.

Nota vigente 4.5: movil mantiene maximo tres acciones directas mas "Mas",
safe-area, icono y texto. Cada accion directa tiene tono discreto, badge visual
flotante en esquina superior derecha limitado a `99+` y nombre accesible con el
valor real. El badge no debe aparecer bajo la etiqueta ni aumentar la altura del
boton.

`encargo`:

- Estado.
- Tareas.
- Archivos.
- Más.

`impresion`:

- Estado.
- Archivos.
- Comentarios.
- Más.

"Más" no es un panel de dominio. Abre en el mismo dialog/sheet un selector de
acciones secundarias permitidas por rol. Al seleccionar una acción, el contenido
del dialog/sheet se sustituye por el panel elegido. El usuario debe poder volver
al selector de "Más" sin cerrar el dialog/sheet. No se permiten diálogos
anidados.

Operaciones habituales dentro de "Más": Personal, Pagos, Historial,
Información y Comentarios cuando Comentarios no está fijo. Al abrir un panel
desde "Mas" y volver, el selector conserva la misma lista secundaria que tenia
la superficie que lo abrio.

Requisitos:

- Fixed bottom con safe area: `padding-bottom: env(safe-area-inset-bottom)`.
- Altura conceptual: 56-64 px más safe area.
- Contenido principal con padding inferior suficiente para no quedar tapado.
- Etiquetas visibles.
- Iconos decorativos con `aria-hidden`.
- Estado activo textual y visual.
- Con teclado virtual abierto, no debe tapar campos dentro del sheet; el sheet
  debe permitir scroll interno.
- En orientación horizontal, puede pasar a toolbar compacta si la altura no
  permite barra fija.
- Al abrir bottom sheet, la barra permanece visible solo si no interfiere; si
  interfiere, queda cubierta por el sheet modal.

## 14. Cabecera y resumen de solicitud

El workspace interno de Solicitud muestra:

- Botón para volver a `/dashboard/solicitudes`.
- Referencia pública copiable inline; la referencia interna completa queda en
  Información.
- Cliente capturado.
- Servicio desde la relación canónica `service_id -> tipos_servicio.name`.
- Workflow `encargo`/`impresion`.
- Estado.
- Recepción.
- Fecha deseada.
- Contacto.
- Referencia pública y acción copiar.

El `h1` puede seguir siendo "Solicitud de {client_name}" porque identifica la
entidad real.

## 15. Contenido principal de solicitud

Contenido permanente:

- Descripción.
- Observaciones.
- Datos esenciales.
- Archivos adjuntos según criterio determinista.
- Advertencias de revisión.
- Estado de asociación de cliente.
- Estado de conversión cuando sea relevante.

Desde `xl`, la composición permanente es:

```text
+-------------------------+---------------------+
|                         | Contacto recibido   |
| Trabajo solicitado      +---------------------+
|                         | Archivos adjuntos   |
+-------------------------+---------------------+
```

La descripción ocupa la columna izquierda y ambas filas. Contacto y Archivos
ocupan la columna derecha con proporción aproximada `2fr / 3fr`. Cada sección
ocupa toda su celda, conserva encabezado fijo y desplaza solo su cuerpo desde
`xl`. Por debajo de `xl`, la composición vuelve al flujo documental normal:
descripción, observaciones, contacto y archivos crecen según su contenido.

La conversión no debe quedar escondida si es la siguiente acción principal.
Cuando `status = aprobada` y existe cliente asociado, el CTA principal debe
abrir Convertir o renderizar conversión como acción destacada.

## 16. Paneles de solicitud

| Panel | Icono Lucide | Propósito | Roles | Modo | Componente actual |
| --- | --- | --- | --- | --- | --- |
| Estado | `GitBranch` | Gestionar revisión | admin, supervisor | `scroll` | `SolicitudStatusForm` |
| Cliente | `ContactRound` | Asociar, consultar o crear cliente | admin, supervisor | `scroll` | `SolicitudClienteForm` |
| Conversión | `ArrowRightCircle` | Conversión a pedido | admin, supervisor | `scroll` | `SolicitudConvertPedidoForm` |
| Archivos | `Files` | Consultar archivos recibidos | admin, supervisor | `scroll` | `SolicitudFilesPanel` |
| Comentarios | `MessageSquare` | Notas internas | admin, supervisor | `fill` | `SolicitudCommentsPanel` + `SolicitudCommentComposer` |
| Historial | `History` | Eventos de solicitud | admin, supervisor | `scroll` | `SolicitudHistoryTimeline` |
| Información | `Info` | Contacto y metadata | admin, supervisor | `scroll` | `SolicitudInformationPanel` |

Matriz de conversión por estado:

| Estado / condición | CTA principal | Panel Convertir | Oculto/bloqueado |
| --- | --- | --- | --- |
| `nueva` | Abrir estado | Puede estar oculto o bloqueado con mensaje | Conversión no disponible |
| `en_revision` | Abrir estado/contactar | Bloqueado | Debe aprobarse primero |
| `contactada` | Abrir estado | Bloqueado | Debe aprobarse primero |
| `aprobada` sin cliente | Abrir cliente | Visible bloqueado | Falta cliente |
| `aprobada` con cliente | Abrir convertir | Visible gestionable | No ocultar |
| `rechazada` | Sin CTA de conversión | Oculto o lectura bloqueada | Cerrada |
| `convertida` | Ver pedido | Panel en lectura con enlace | No permitir nueva conversión |

### Nota vigente: panel lineal de Estado

`StatusFlowPanel` es un patrón presentacional compartido para solicitudes y
pedidos. No es una máquina de estados y no contiene reglas de dominio: recibe
transiciones ya calculadas por `SolicitudStatusForm` o `PedidoStatusForm`.

Estructura del panel:

- Estado actual.
- Siguiente estado.
- Acción directa principal.
- Acción secundaria opcional.
- Motivo de bloqueo cuando una regla impide avanzar.
- Zona delicada para rechazo o cancelación.
- Confirmación inline para acciones destructivas.

No hay selector de estados ni hidden input de destino permanente. Cada botón
envía el destino con `name="status"` y `value`, y avance y terminación usan
formularios separados. Solo el botón activado muestra texto pending; las demás
acciones mantienen su etiqueta estable. La confirmación destructiva soporta foco
inicial, Escape y devolución de foco al disparador.

En solicitudes, `nueva -> en_revision` ocurre automáticamente al abrir el
detalle real. El panel ofrece avanzar a `contactada` y luego a `aprobada`; en
`aprobada` muestra el aviso de conversión cuando corresponde, pero no permite
marcar `convertida` manualmente. El rechazo vive en zona delicada y
`rechazada`/`convertida` quedan cerradas.

En pedidos, `creado` y `solicitud_recibida` autoavanzan a `en_revision` al
abrir el detalle real. El panel permite avanzar linealmente, volver de
`listo_entrega` a `en_produccion`, muestra bloqueos por tareas y pago, separa
la cancelación en zona delicada y deja `entregado`/`cancelado` cerrados.

El action rail y el panel de Estado derivan del mismo objeto de flujo, por lo
que el resumen compacto y la acción del panel no deben contradecirse.

### Nota vigente 6.1: workspace interno de Solicitudes

El detalle interno de solicitud usa las primitivas comunes del workspace, pero
mantiene cabecera, contenido y paneles específicos de solicitudes. No se crea un
workspace universal entre pedidos y solicitudes.

Cabecera:

- Enlace "Volver a solicitudes" textual en móvil/tablet, antes de la metadata.
- Botón "Volver a solicitudes" a la derecha desde `xl`.
- Referencia pública copiable inline con `CopyableCode`.
- Workflow, estado y tipo de servicio.
- `h1` como `Solicitud de {client_name}`.
- Fecha de recepción y fecha deseada, con "No definida" cuando no exista.

No debe mostrar la referencia interna corta como identidad principal ni repetir
la metadata en una tarjeta de resumen separada. El UUID completo vive solo en
Información, como metadata secundaria monoespaciada y con `break-all`.

Contenido permanente:

- Descripción completa y observaciones.
- Contacto recibido desde el formulario público: nombre, teléfono y correo.
- Todos los archivos adjuntos, ordenados por `created_at` descendente, con
  descarga privada.

Desktop `xl` usa dos columnas: descripción con mayor ancho a la izquierda, y
contacto/archivos en columna derecha compacta. La derecha usa dos filas
acotadas, con proporción aproximada Contacto `2fr` y Archivos `3fr`. Cada
sección ocupa su celda, mantiene encabezado fijo y desplaza su cuerpo desde
`xl`. Tablet y móvil usan orden lineal: descripción, observaciones, contacto y
archivos, con scroll documental normal. El contacto recibido no se mezcla con
cliente interno asociado.

Orden de acciones:

1. Estado.
2. Cliente.
3. Conversión.
4. Archivos.
5. Comentarios.
6. Historial.
7. Información.

Acciones prioritarias para tablet y móvil:

```ts
["estado", "cliente", "conversion"]
```

Paneles de 6.1:

| Panel | Icono | Modo | Contenido |
| --- | --- | --- | --- |
| Estado | `estado` | `scroll` | `SolicitudStatusForm` |
| Cliente | `cliente` | `scroll` | `SolicitudClienteForm` |
| Conversión | `convertir` | `scroll` | `SolicitudConvertPedidoForm` |
| Archivos | `archivos` | `scroll` | `SolicitudFilesPanel` |
| Comentarios | `comentarios` | `fill` | `SolicitudCommentsPanel` + `SolicitudCommentComposer` |
| Historial | `historial` | `scroll` | `SolicitudHistoryTimeline` |
| Información | `informacion` | `scroll` | `SolicitudInformationPanel` |

Tratamiento de acciones:

- Estado: `nueva` usa warning y "Iniciando revisión"; `aprobada` y
  `convertida` usan success; `rechazada` usa danger.
- Cliente: danger si falla la carga de cliente/listado; success si existe
  cliente asociado; warning solo si la solicitud está aprobada y falta cliente;
  neutral para ausencia no bloqueante.
- Conversión: success si ya existe pedido; warning si está lista para convertir
  o falta cliente; neutral si requiere aprobación o está rechazada.
- Archivos, Comentarios e Historial usan badge de cantidad y danger en error de
  carga.
- Información permanece neutral.

La conversión no se deshabilita como acción: el panel explica por qué todavía no
puede convertir. En `convertida`, Información muestra "Ver pedido generado" con
enlace a `/dashboard/pedidos/{converted_order_id}`.

Permisos, transiciones, Server Actions, servicios, RLS, RPC y Storage no cambian
en 6.1. Los formularios existentes se reutilizan temporalmente dentro de los
paneles aunque conserven tarjeta exterior; la simplificacion interna queda para
6.2/6.3.

Politica de pruebas: las subtareas 6.1 a 6.4 no ejecutan E2E ni Full Visual QA.
La validacion integral responsive, accesible, visual y por estados se concentra
en 6.5.

### Nota vigente 6.2: paneles de consulta de Solicitudes

Archivos usa `SolicitudFilesPanel` dentro del workspace contextual. Renderiza la
lista completa sin tarjeta exterior, sombra, heading principal ni descripcion
duplicada; el titulo y descripcion los provee `WorkspaceContextDialog`. No
admite subida interna y conserva descargas por route handler privado:
`/dashboard/solicitudes/[id]/archivos/[fileId]/download`.

Historial usa `SolicitudHistoryTimeline`. Renderiza una timeline compacta sin
tarjeta exterior ni heading duplicado, conserva el orden recibido y mantiene los
resumenes derivados de metadata, actor, rol y fecha.

Informacion permanece como panel secundario solo lectura: referencia publica,
workflow, servicio, estado, fechas, enlace a pedido convertido cuando exista y
UUID interno como metadata secundaria. No incluye `reviewed_by`, datos completos
de cliente ni acciones de gestion.

Archivos, Historial e Informacion usan `contentMode: "scroll"`.

### Nota vigente 6.3: paneles de gestion de Solicitudes

Estado usa `SolicitudStatusForm` con `presentation="panel"` dentro del panel
contextual. El formulario muestra primero el estado actual, conserva solo las
transiciones permitidas y no cambia reglas de dominio ni Server Actions.

Cliente usa `SolicitudClienteForm` con `presentation="panel"`. El contenido se
organiza en una sola columna: cliente asociado, asociacion de cliente existente
y creacion desde la solicitud. Si falla la carga del cliente asociado, la pagina
sigue mostrando solo el error y no renderiza controles basados en un estado
desconocido.

Conversion usa `SolicitudConvertPedidoForm` con `presentation="panel"` para
eliminar tarjeta exterior y heading duplicado. Mantiene los requisitos
existentes: solicitud aprobada, cliente asociado y ausencia de pedido convertido.

Comentarios queda dividido en `SolicitudCommentsPanel` y
`SolicitudCommentComposer`. El panel usa `contentMode: "fill"`: la conversacion
interna se desplaza dentro del panel y el composer queda fijo abajo, con textarea
compacto autoajustable, feedback accesible y la misma Server Action existente.

### Nota vigente 6.4: estados, workflows y senales de Solicitudes

Matriz de Estado:

```text
nueva -> warning / Pendiente de revision
en_revision -> neutral / En revision
contactada -> neutral / Cliente contactado
aprobada -> success / Solicitud aprobada
rechazada -> danger / Solicitud rechazada
convertida -> success / Solicitud convertida
```

Matriz de Cliente:

```text
error cargando cliente o listado -> danger / No se pudo cargar el cliente
cliente asociado -> success / Cliente asociado
aprobada sin cliente -> warning / Falta asociar cliente
ausencia no bloqueante -> neutral
```

El error de carga conserva prioridad sobre `cliente_id`, porque la entidad
asociada no pudo comprobarse correctamente. Cliente asociado usa `success` como
condicion completada y mantiene `statusLabel`; el tono no sustituye el texto
accesible.

Matriz de Conversion:

```text
pedido creado -> success / Pedido creado
lista para convertir -> warning / Lista para convertir
falta cliente -> warning / Falta asociar cliente
requiere aprobacion -> neutral / Requiere aprobacion
rechazada -> neutral / Conversion no disponible
convertida sin pedido enlazado -> neutral / Conversion no disponible
```

La comprobacion de `converted_order_id` ocurre antes que el resto. Si una
solicitud aparece como `convertida` sin `converted_order_id`, la accion de
Conversion se muestra como no disponible; el formulario existente no permite
crear otro pedido porque solo renderiza la conversion cuando `status ===
"aprobada"`, hay cliente asociado y no hay pedido actual.

Encargo e Impresion conservan el mismo catalogo de acciones: Estado, Cliente,
Conversion, Archivos, Comentarios, Historial e Informacion. Encargo mantiene
`Trabajo solicitado` y requisitos operativos de conversion; Impresion mantiene
`Datos de impresion solicitada`, el titulo predeterminado `Pedido de impresion`
y la ausencia de Tareas en el workspace de Solicitudes.

El composer de comentarios en presentacion panel muestra solo `Comenta` como
heading visible. La presentacion card conserva su descripcion. Las subtareas
6.1 a 6.4 no ejecutan E2E ni Full Visual QA; esa validacion queda concentrada
en 6.5.

### Nota vigente 6.5: QA funcional, responsive y visual de Solicitudes

Correcciones cerradas en 6.5:

- El detalle exitoso de `/dashboard/solicitudes/[id]` ya no envuelve
  `InternalSolicitudDetail` en un `div.space-y-8`; esto elimina el scroll
  documental desktop innecesario sin ocultar overflow global ni recortar
  contenido.
- `SolicitudContactPreview` usa la grilla responsive normal y el item
  `Correo electronico` ocupa dos columnas desde `sm`, evitando que el correo
  quede limitado a media tarjeta.
- Los tests de Solicitudes, Storage y Full Visual QA abren Estado, Cliente,
  Conversion, Archivos, Comentarios, Historial e Informacion mediante triggers
  visibles del workspace o el selector `Mas`; no buscan formularios antiguos en
  el cuerpo permanente.

Comprobaciones automatizadas de cierre:

```text
npm.cmd run diff:check
npm.cmd run verify
npx.cmd playwright test tests/e2e/solicitudes-internas.spec.ts --project=chromium --workers=1
npx.cmd playwright test tests/e2e/storage.spec.ts --project=chromium --workers=1
npx.cmd playwright test tests/e2e/full-visual-qa.spec.ts --project=chromium --workers=1
```

Cobertura verificada:

- Encargo: estados `nueva -> en_revision -> contactada -> aprobada`,
  asociacion/creacion de cliente, comentarios consecutivos con reset, conversion
  a pedido y estado `convertida`.
- Impresion: datos de impresion solicitada, archivo recibido, panel Archivos con
  descarga privada, rechazo y conversion no disponible.
- Roles: `admin` gestiona el flujo completo, `supervisor` consulta listado y
  detalle, `trabajador` queda denegado en listado y detalle de Solicitudes.
- Responsive: desktop `1440x900` y `1366x768` sin overflow horizontal ni scroll
  documental; tablet `900x1000` y `780x1000` con toolbar en una fila; movil
  `375x812` con barra inferior, selector `Mas`, retorno al selector y un solo
  dialog.
- Accesibilidad funcional: los triggers conservan `statusLabel`; Escape y el
  boton `Cerrar` restauran foco al trigger visible.
- Storage: rutas internas `/dashboard/solicitudes/{solicitudId}/archivos/{fileId}/download`,
  sin `file_path`, bucket, signed URL ni superficie de subida interna.

Screenshots inspeccionados:

```text
test-results/beta-1-8-3-solicitud-workspace-desktop-1440.png
test-results/beta-1-8-3-solicitud-workspace-desktop-1366.png
test-results/beta-1-8-3-solicitud-workspace-tablet-900.png
test-results/beta-1-8-3-solicitud-workspace-tablet-780.png
test-results/beta-1-8-3-solicitud-workspace-mobile-375.png
test-results/beta-1-8-3-solicitud-cliente-success.png
test-results/beta-1-8-3-solicitud-comentarios-panel-mobile.png
test-results/beta-1-8-3-solicitud-impresion-archivos.png
test-results/beta-1-8-3-solicitud-convertida.png
```

## 17. Apertura del panel contextual

Flujo:

1. El usuario activa una acción del action rail, toolbar, cabecera o barra
   móvil.
2. El controlador cliente guarda el elemento trigger en un ref.
3. Se asigna `activePanel`.
4. Se llama `dialog.showModal()`.
5. El foco inicial va al título del panel o al primer control relevante.

Solo puede existir un panel contextual abierto al mismo tiempo.

No usar inicialmente:

- `searchParams`.
- Parallel Routes.
- Intercepting Routes.
- Rutas secundarias por panel.
- Persistencia en URL.

## 18. Cierre del panel contextual

En la primera versión, los paneles permanecen abiertos después de mutaciones.
Deben mantener visibles los estados de éxito, error y pending dentro del mismo
panel. El cierre será manual.

Debe cerrar mediante:

- Botón visible "Cerrar".
- Tecla Escape.
- Clic sobre el backdrop del `<dialog>`.

El clic dentro de la superficie del panel no debe cerrar el dialog. El clic sobre
backdrop usa la misma semántica que el botón "Cerrar": solicita el cierre al
controlador, no cierra directamente desde el componente de dialog. El cierre
automático después de una acción exitosa queda como evolución futura, fuera del
alcance inicial.

Al cerrar:

- Limpiar `activePanel`.
- Llamar `dialog.close()` si sigue abierto.
- Devolver foco al trigger.
- Restaurar el scroll del `body` al valor previo a la apertura.
- Conservar posición del workspace.
- No resetear formularios salvo que el formulario actual ya lo haga.

Este contrato aplica igual en drawer desktop/tablet, bottom sheet móvil y la
vista "Más acciones".

## 19. Semántica del panel

El panel usa `<dialog>` nativo.

Requisitos:

- Título accesible.
- `aria-labelledby`.
- Descripción con `aria-describedby` cuando aplique.
- Botón "Cerrar" con nombre accesible.
- Cierre por Escape.
- Cierre por backdrop.
- Clic interior preservado.
- Foco visible.
- Contenido estructurado por headings.
- Formularios existentes con labels actuales.
- Iconos decorativos con `aria-hidden`.

No introducir Radix, Headless UI, shadcn/ui ni librerías de tooltips.

## 20. Scroll del panel

- El panel usa `contentMode: "scroll"` por defecto.
- En `contentMode: "fill"`, el cuerpo generico del dialog usa
  `overflow-hidden` y el contenido inmediato `min-h-0 flex-1`.
- Comentarios, Archivos y Personal de pedidos usan `fill`: solo la zona central
  lista/comentario/asignaciones desplaza; el footer de formulario queda visible.
- El selector "Mas acciones" siempre usa `scroll`.
- Header del panel estable.
- Contenido con scroll interno cuando sea necesario.
- Acciones de formulario visibles cuando el formulario lo requiera.
- Evitar scroll simultáneo del panel y del documento.
- No ocultar mensajes de error, éxito o pending.
- En móvil, bottom sheet puede ocupar hasta casi toda la altura y desplazarse
  internamente.

## 21. Movimiento

- Animación breve.
- Respetar `prefers-reduced-motion`.
- No bloquear interacción esperando animación.
- No añadir librerías de animación.
- La primera versión puede funcionar sin animación si eso simplifica foco y
  accesibilidad.

## 22. Árbol conceptual server/client

```text
Page Server Component
|-- carga datos
|-- calcula permisos
|-- vincula Server Actions
|-- construye cabecera
|-- construye resumen
|-- construye contenido principal
|-- construye secciones de panel como ReactNode
`-- PedidoWorkspace
    |-- cabecera server-rendered
    |-- resumen server-rendered
    |-- contenido principal server-rendered
    `-- WorkspaceController (Client Component)
        |-- action rail
        |-- toolbar/tablet
        |-- mobile action bar
        `-- dialog contextual
```

La página actual ya sigue la parte crítica: carga el pedido, obtiene perfil,
calcula `canManagePedidos` y `canManagePayments`, enlaza Server Actions con el
ID y pasa secciones como nodos a `InternalPedidoDetail`.

## 23. Responsabilidad cliente

El controlador cliente solo gestiona:

- Panel activo.
- Apertura.
- Cierre.
- Retorno de foco.
- Comportamiento responsive del panel.
- Icono y label de la acción activa.
- Estado visual activo.
- Selector de "Más" y navegación interna hacia el panel elegido.

No debe:

- Consultar Supabase.
- Calcular permisos.
- Cargar datos.
- Ejecutar reglas de dominio.
- Decidir transiciones.
- Transformar DTOs sensibles.
- Construir URLs firmadas.
- Validar permisos de Storage.

## 24. Contenido server-rendered

Las secciones actuales pueden entregarse como slots o `ReactNode`:

- `statusPanel`.
- `tasksPanel`.
- `filesPanel`.
- `commentsPanel`.
- `historyPanel`.
- `paymentPanel`.
- `assignmentPanel`.
- `infoPanel`.

Esto conserva:

- Formularios existentes.
- Server Actions vinculadas.
- Errores.
- Permisos.
- Componentes de dominio.
- RLS y RPC.

## 25. Estado y URL

La primera versión usa estado local del cliente. El panel abierto no se refleja
en la URL.

Evolución futura posible, fuera de alcance:

```text
?panel=archivos
```

No implementar en la primera versión para evitar decidir navegación secundaria,
historial del navegador y permisos de panel durante la migración inicial.

## 26. Primitivas futuras

`WorkspaceShell`

- Recibe cabecera, resumen, main y controlador.
- No carga datos.
- No calcula permisos.

`WorkspaceController`

- Client Component pequeño.
- Recibe acciones serializables y paneles como `ReactNode`.
- Maneja `activePanel`, dialog, foco, responsive y selector de "Más".

`WorkspaceActionRail`

- Desktop desde `xl`.
- Lista acciones con icono, label, badge y estado activo.
- Sin permisos propios; recibe acciones ya filtradas.

`WorkspaceContextDialog`

- Envuelve `<dialog>`.
- Renderiza drawer en desktop/tablet y bottom sheet en móvil.
- Maneja título, descripción, cierre y scroll.
- Permanece abierto tras mutaciones en la primera versión.

`WorkspaceTabletToolbar`

- Toolbar horizontal para `md` a `<xl`.
- Puede agrupar acciones secundarias bajo "Más".

`MobileWorkspaceBar`

- Barra inferior con máximo cuatro accesos.
- Usa safe area.
- Recibe acciones ya filtradas.
- Incluye "Más" como selector, no como panel de dominio.

`WorkspaceSummary`

- Banda compacta de datos clave.
- No consulta datos ni decide permisos.

`PedidoWorkspaceHeader`

- Cabecera específica de pedido.
- No crear `EntityHeader` universal todavía.

`PedidoWorkspaceMain`

- Contenido permanente de pedido.
- Diferencia `encargo` e `impresion`.

`SolicitudWorkspaceHeader`

- Cabecera específica de solicitud.

`SolicitudWorkspaceMain`

- Contenido permanente de solicitud.

## 27. Contratos conceptuales

```ts
type WorkspaceIconName =
  | "estado"
  | "tareas"
  | "archivos"
  | "comentarios"
  | "personal"
  | "pagos"
  | "historial"
  | "informacion"
  | "cliente"
  | "convertir"
  | "mas";

type WorkspaceAction = {
  id: string;
  label: string;
  icon: WorkspaceIconName;
  badge?: number;
  statusLabel?: string;
  tone?: "default" | "warning" | "danger" | "success";
  disabled?: boolean;
  disabledReason?: string;
};

type WorkspacePanelContentMode = "scroll" | "fill";

type WorkspacePanel = {
  id: string;
  title: string;
  description?: string;
  contentMode?: WorkspacePanelContentMode;
  content: ReactNode;
};

type WorkspaceControllerProps = {
  actions: readonly WorkspaceAction[];
  panels: Record<string, WorkspacePanel>;
  primaryActionId?: string;
};
```

Los metadatos de acciones deben ser serializables. El contenido del panel puede
ser `ReactNode`. No crear un registro universal que importe todo Lucide; usar
mapas estáticos pequeños en los componentes cliente que renderizan iconos.

`contentMode` por defecto es `scroll`. Usar `fill` solo cuando el contenido del
panel ya define una zona central con scroll y un footer fijo, como Comentarios,
Archivos y Personal.

Contrato de `disabled`:

- Las acciones sin permiso se filtran en servidor y no llegan al cliente.
- `disabled` representa solo un bloqueo operativo visible, por ejemplo estado
  cerrado, falta de cliente o regla de transición no satisfecha.
- `disabled` no se usa como sustituto de autorización.
- Si `disabled` es `true`, `disabledReason` debe explicar la razón visible.

## 28. Casos de pedido

| Caso | Comportamiento |
| --- | --- |
| `encargo` | Muestra progreso inline y todas las tareas cargadas; panel Tareas prominente. |
| `impresion` | Muestra flujo directo; no trata ausencia de tareas como problema. |
| Pedido manual | Origen indica "Pedido creado manualmente"; se crea en `creado`, permanece en listado y autoavanza a revisión al abrir detalle real. |
| Pedido desde solicitud | Información muestra solicitud origen; inicia `solicitud_recibida` y autoavanza a revisión al abrir detalle real. |
| Sin cliente | Panel Información muestra el mensaje normal de cliente no asociado; la acción Información permanece neutral y no muestra warning. |
| Sin personal | Cabecera o Estado pueden advertir; panel Personal muestra estado vacío. |
| Sin tareas | En encargo activo es advertencia; en impresión no aplica. |
| Sin archivos | Lista principal y panel muestran vacío sin bloquear. |
| Sin comentarios | Panel muestra vacío; formulario sigue disponible si hay acceso. |
| Sin historial visible | Panel Historial muestra vacío. |
| Pago pendiente | Estado advierte si bloquea entrega; Pagos es acción importante. |
| Pago parcial | Igual que pendiente para entrega. |
| Entregado | Estado cerrado; tareas/archivos en lectura o sin subida. |
| Cancelado | Estado cerrado; sin mutaciones operativas. |
| Error parcial | Mostrar alerta en zona afectada y conservar el resto del workspace. |

## 29. Casos de solicitud

| Caso | Comportamiento |
| --- | --- |
| `nueva` | CTA abre Estado; al montar el detalle real autoavanza a `en_revision`; conversión no disponible. |
| `en_revision` | CTA abre Estado; conversión no disponible. |
| `contactada` | CTA abre Estado; conversión no disponible. |
| `aprobada` | Si tiene cliente, conversión es acción principal; si no, asociar cliente. |
| `rechazada` | Cerrada; sin conversión ni cambios manuales. |
| `convertida` | Mostrar enlace a pedido; sin nueva conversión. |
| Sin archivos | Archivos muestra vacío. |
| Sin cliente asociado | Cliente es acción crítica antes de convertir. |
| Cliente ya asociado | Mostrar ficha y enlace a cliente. |
| Error parcial | Mostrar alerta en panel/sección afectada. |
| Conversión no disponible | Explicar regla: estado, cliente o ya convertida. |

## 30. Estados de interfaz

Por zona:

- Loading futuro: skeleton local o placeholder, sin loading boundaries nuevos en
  primera migración.
- Vacío: texto específico, no genérico.
- Error: `Alert` o bloque con `role="alert"` cuando aplica.
- Éxito: `role="status"` y texto visible.
- Pending: `aria-busy`, bloqueo visual y texto actual de pending.
- Disabled: mantener razón visible cuando bloquee trabajo por una regla
  operativa.
- Sin permiso: no renderizar controles de gestión; si el panel es lectura,
  conservar contenido permitido.
- Solo lectura: mostrar datos y explicar por estado cerrado o rol.

No implementar loading boundaries todavía.

## 31. Wireframes ASCII

### Pedido `encargo` desktop

```text
+------------------------------------------------------------------+
| [Volver] P-26-0347 · Encargo · En producción · Alta [Abrir tareas] |
| Título real del pedido                                            |
+----------------------------------------------------+-------------+
| Trabajo solicitado                                | Action rail |
| Descripción compacta                              | Estado      |
|                                                    | Tareas      |
| Tareas del pedido | Archivos asociados           | Archivos    |
| Progreso inline   | Lista completa               | Comentarios |
| Lista completa    | con scroll interno           | Personal    |
| con scroll interno |                              | Pagos       |
|                                                    | Historial   |
|                                                    | Informacion |
+----------------------------------------------------+-------------+
```

### Pedido `encargo` tablet

```text
[Volver] P-26-0347 · Encargo
Título real del pedido
[Estado] [Tareas] [Archivos] [Mas]

Trabajo solicitado
Tareas del pedido
Archivos asociados

Drawer derecho al abrir accion
```

### Pedido `encargo` móvil

```text
[Volver]
P-26-0347 · Encargo · Estado
Título real del pedido

Trabajo solicitado
Tareas del pedido
Archivos asociados

                 bottom bar
[Estado] [Tareas] [Archivos] [Mas]
```

### Panel abierto

```text
Desktop/tablet:
+------------------------- page -------------------------+
| contenido atenuado                                     |
|                                      +----------------+ |
|                                      | Titulo         | |
|                                      | Cerrar         | |
|                                      | contenido      | |
|                                      | con scroll     | |
|                                      +----------------+ |
+--------------------------------------------------------+

Movil:
+---------------- page ----------------+
| contenido                            |
|                                      |
+--------------------------------------+
| Sheet: Titulo              Cerrar    |
| contenido con scroll                 |
+--------------------------------------+
```

### Pedido `impresion` desktop

```text
[Volver] P-26-0350 · Impresión · En producción [Abrir estado]
Pedido de impresión

+----------------------------------------------------+-------------+
| Descripción y especificaciones                     | Action rail |
|                                                    | Estado      |
|                                                    | Archivos    |
| Archivos asociados                                 | Comentarios |
|                                                    | Personal    |
|                                                    | Pagos       |
|                                                    | Historial   |
|                                                    | Info        |
+----------------------------------------------------+-------------+
```

### Pedido `impresion` móvil

```text
[Volver]
P-26-0350 · Impresión
Pedido de impresión
Descripción / especificaciones
Archivos asociados

[Estado] [Archivos] [Comentarios] [Mas]
```

### Solicitud desktop

```text
[Volver] GD-AB12-CD34 · Encargo · Nueva [Abrir estado]
Solicitud de Cliente

+----------------------------------------------------+-------------+
| Descripción y observaciones                        | Action rail |
|                                                    | Estado      |
|                                 Contacto recibido  | Cliente     |
|                                 Archivos adjuntos  | Archivos    |
|                                                    | Comentarios |
|                                                    | Historial   |
|                                                    | Info        |
|                                                    | Convertir   |
+----------------------------------------------------+-------------+
```

### Solicitud móvil

```text
[Volver]
Solicitud de Cliente
Estado · servicio · fecha
Descripción
Contacto recibido
Archivos adjuntos

[Estado] [Cliente] [Archivos] [Mas]
```

### Solicitud con conversión disponible

```text
Solicitud aprobada · Cliente asociado
[CTA principal: Abrir convertir]

Panel Convertir:
- titulo
- descripcion
- prioridad
- monto
- fecha estimada
```

## 32. Breakpoints conceptuales

Usar Tailwind actual:

- Móvil: menor de `md`.
- Tablet: desde `md` hasta antes de `xl`.
- Escritorio workspace: desde `xl`.

No crear nuevos breakpoints salvo necesidad demostrada.

## 33. Altura

La altura útil debe calcularse con CSS flexible:

- En Solicitudes y Pedidos desde `xl`, el shell contenido usa altura basada en
  viewport, reserva la cabecera y entrega el espacio restante al grid principal.
- Las tarjetas del área principal ocupan la altura de su celda, permiten
  encogerse y desplazan solo el cuerpo interno; el encabezado permanece fijo.
- El rail contenido ocupa la altura asignada por el grid, no usa altura propia de
  viewport ni sticky.
- En Dashboard, el shell flow conserva scroll documental y el rail puede ser
  sticky con altura basada en viewport.
- Evitar valores rígidos que rompan zoom o pantallas pequeñas.
- En tablet y móvil no se fuerza la altura del workspace: las cards crecen según
  su contenido, el documento desplaza normalmente y se evitan multiples zonas
  pequeñas de scroll fuera de paneles/sheets.
- En móvil, el contenido recibe padding inferior por barra y safe area.
- El panel contextual puede limitarse con `max-height: min(...)` y scroll
  interno.

## 34. Orientación y zoom

Considerar:

- Móvil horizontal: barra inferior puede ocupar demasiado; permitir toolbar o
  sheet con altura menor.
- Zoom de navegador: labels deben envolver.
- Texto ampliado: no truncar información crítica.
- Teclado virtual: formularios del sheet deben desplazarse.
- Viewport bajo: no fijar encabezados que consuman toda la pantalla.

## 35. Accesibilidad

Requisitos obligatorios:

- Navegación completa por teclado.
- Foco visible.
- Escape cierra dialog.
- Clic sobre backdrop cierra dialog.
- Clic dentro de la superficie del dialog no cierra.
- Retorno de foco al trigger.
- Título accesible del dialog.
- Targets mínimos de 44 px.
- Iconos decorativos con `aria-hidden`.
- Etiquetas visibles.
- No depender de color.
- Lectura lineal sin CSS.
- Reducción de movimiento.
- Mensajes de error anunciados.
- No ocultar información crítica dentro de hover.

## 36. Orden de foco

Recorrido esperado:

1. Cabecera del workspace.
2. Contenido principal.
3. Acciones contextuales.
4. Panel abierto.
5. Retorno al trigger.

Cuando el panel está abierto, el foco debe permanecer dentro de `<dialog>` por
comportamiento modal nativo. Al cerrar, vuelve a la acción que lo abrió.

## 37. Matriz de pruebas futuras

| Primitiva / área | Dominio | Rol | Workflow | Spec focal | Manual | Resolución |
| --- | --- | --- | --- | --- | --- | --- |
| WorkspaceShell/Header | Pedido | admin/supervisor/trabajador | encargo/impresion | `pedidos.spec.ts`, `dashboard.spec.ts` | desktop/tablet/móvil | 1440, tablet, 375 |
| Action rail | Pedido | todos | encargo/impresion | `pedidos.spec.ts` | foco, activo, badges | desktop |
| Context dialog | Pedido/Solicitud | todos permitidos | ambos | `storage.spec.ts`, `pedidos.spec.ts` | Escape, backdrop, retorno foco | desktop/móvil |
| Tareas | Pedido | admin/supervisor/trabajador asignado | encargo | `task-templates.spec.ts`, `pedidos.spec.ts` | crear/editar/progreso | desktop/móvil |
| Archivos | Pedido/Solicitud | roles permitidos | ambos | `storage.spec.ts` | descarga, subida pedido | desktop/móvil |
| Solicitud | Solicitud | admin/supervisor | encargo/impresion | `solicitudes-internas.spec.ts` | conversión | desktop/móvil |
| Shell/roles | Transversal | todos | n/a | `dashboard.spec.ts` | visibilidad por rol | todas |
| Cierre visual | Transversal | todos | ambos | `full-visual-qa.spec.ts` | solo al cierre de fase | 1440/375 |

## 38. Casos manuales

- Abrir y cerrar cada panel.
- Cerrar con backdrop.
- Cerrar con Escape.
- Confirmar que clic interior no cierra.
- Verificar retorno de foco.
- Interactuar con formularios dentro del panel.
- Ver mensajes de error.
- Ver estados pending.
- Confirmar que éxito, error y pending permanecen visibles tras mutaciones.
- Probar admin, supervisor y trabajador.
- Probar `encargo`.
- Probar `impresion`.
- Probar móvil, tablet y escritorio.
- Confirmar ausencia de overflow horizontal.
- Confirmar ausencia de doble scroll confuso.
- Confirmar que no hay paneles simultáneos ni diálogos anidados.
- Confirmar que "Más" abre selector, permite elegir panel y permite volver.
- Confirmar que la barra móvil no tapa contenido.

## 39. Registro histórico del plan de implementación

Esta sección se conserva únicamente como registro histórico de la secuencia
utilizada para construir los workspaces. Las etapas descritas ya fueron
ejecutadas y no representan trabajo pendiente ni el roadmap vigente.

### Etapa 4.1

Se crearon primitivas estructurales sin migrar toda la pantalla.

Alcance:

- `WorkspaceController`.
- `WorkspaceActionRail`.
- `WorkspaceContextDialog`.
- `WorkspaceTabletToolbar`.
- `MobileWorkspaceBar`.
- Tipos conceptuales locales.

Cierre:

- Sin cambios funcionales.
- Panel abre/cierra con contenido de prueba server-rendered.
- Foco y Escape validados.

### Etapa 4.2

Se migró la lectura y composición principal del pedido `encargo`.

Alcance:

- `PedidoWorkspaceHeader`.
- `PedidoWorkspaceMain`.
- Secciones permanentes de tareas y archivos con listas completas y scroll
  interno desde `xl`.
- Mantener paneles actuales aun si siguen bajo la página.

Cierre:

- `pedidos.spec.ts` verde.
- Desktop/móvil sin overflow.

### Etapa 4.3

Se incorporaron paneles de consulta.

Alcance:

- Archivos en lectura/descarga.
- Comentarios lectura.
- Historial.
- Información.

Cierre:

- `storage.spec.ts` verde.
- Escape y retorno de foco manual.

### Etapa 4.4

Se incorporaron paneles de gestión.

Alcance:

- Estado.
- Tareas.
- Personal.
- Pagos.
- Comentarios append-only.

Cierre:

- `pedidos.spec.ts`, `task-templates.spec.ts` y `storage.spec.ts` verdes.
- Pending, error y éxito visibles dentro del panel.

### Etapa 4.5

Se validaron roles y pedido `impresion`.

Alcance:

- Action sets por workflow.
- Trabajador asignado.
- Estados cerrados.
- Pago pendiente.

Cierre:

- Matriz por rol comprobada.
- `dashboard.spec.ts` y `pedidos.spec.ts` verdes.

### Etapa 5

Se migró solicitud usando el patrón validado.

Alcance:

- `SolicitudWorkspaceHeader`.
- `SolicitudWorkspaceMain`.
- Paneles Estado, Cliente, Archivos, Comentarios, Historial, Información y
  Convertir.

Cierre:

- `solicitudes-internas.spec.ts` y `storage.spec.ts` verdes.
- Conversión visible cuando es acción principal.
