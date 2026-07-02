# Dominio task-templates

## Rol del dominio

`src/lib/task-templates` concentra la logica server-side de plantillas de
tareas. El dominio permite administrar plantillas reutilizables desde
`/dashboard/configuracion`, gestionar las tareas internas de cada plantilla y
aplicar una plantilla activa a pedidos de tipo `encargo`.

Las plantillas no son una fuente paralela de progreso: al aplicarse a un pedido,
sus tareas se copian a `pedido_tareas` y desde ese momento se comportan como
tareas normales del pedido.

## Mapa de archivos

- `index.ts`: barrel publico del dominio.
- `types.ts`: DTOs, inputs, field errors y reasons compartidos.
- `task-template-validation.ts`: validacion runtime de nombre y descripcion de
  plantilla.
- `task-template-task-validation.ts`: validacion runtime de titulos de tareas de
  plantilla, reutilizando el parser de tareas de pedido.
- `errors.ts`: errores seguros relacionados con la RPC de aplicacion.
- `list-task-templates.ts`: listado administrativo de plantillas con conteo de
  tareas.
- `get-task-template-by-id.ts`: detalle seguro de una plantilla.
- `list-task-template-tasks.ts`: tareas de una plantilla ordenadas por
  `sort_order`.
- `create-task-template.ts`: creacion de cabecera de plantilla.
- `update-task-template.ts`: edicion de nombre y descripcion.
- `toggle-task-template-active.ts`: activacion o desactivacion.
- `create-task-template-task.ts`: creacion de tarea de plantilla.
- `update-task-template-task.ts`: edicion de tarea de plantilla.
- `delete-task-template-task.ts`: eliminacion y normalizacion de orden.
- `reorder-task-template-task.ts`: movimiento arriba/abajo.
- `list-active-task-templates-for-order.ts`: selector de plantillas activas con
  tareas para pedidos.
- `apply-task-template-to-pedido.ts`: aplicacion transaccional mediante RPC.

## Contratos y validaciones

`types.ts` es el punto compartido para contratos del dominio:

- `TaskTemplateListItem`
- `TaskTemplateDetail`
- `TaskTemplateTask`
- `ActiveTaskTemplateForOrder`
- inputs de mutacion y aplicacion
- `TaskTemplateFieldErrors`
- `TaskTemplateTaskFieldErrors`
- `ApplyTaskTemplateFieldErrors`
- reasons de error por operacion

Los `ServiceResult` especificos permanecen locales en cada servicio para evitar
un archivo de tipos gigante. Esta decision mantiene cerca de cada operacion su
contrato de retorno sin volver a dispersar DTOs compartidos.

`task-template-validation.ts` valida nombre y descripcion de plantilla. El nombre
es requerido y la descripcion es opcional pero limitada.

`task-template-task-validation.ts` usa `parsePedidoTaskTitle()` para conservar la
misma semantica entre tareas de plantilla y tareas de pedido. Si el titulo
contiene una cantidad entera positiva, la tarea queda como `cuantificada`; si no,
queda como `simple`.

## Errores RPC seguros

`errors.ts` existe porque `apply-task-template-to-pedido.ts` necesita traducir
mensajes conocidos de la RPC `aplicar_plantilla_tareas_pedido` a errores seguros
de UI.

La funcion `mapApplyTaskTemplateRpcError()` mapea casos como:

- pedido inexistente;
- plantilla inexistente;
- `workflow_type` bloqueado;
- estado del pedido bloqueado;
- plantilla inactiva;
- plantilla vacia;
- falta de permiso;
- sesion o perfil interno invalido.

No existe `rpc.ts` en este dominio porque por ahora solo hay una llamada RPC y no
hay repeticion suficiente para justificar otra abstraccion. Si aparecen mas RPCs
o se repite el patron de tipos/casts/errores, entonces si tendria sentido crear
`src/lib/task-templates/rpc.ts`.

## Configuracion y detalle de plantilla

La pagina `/dashboard/configuracion` carga `listTaskTemplates()` server-side y
pasa DTOs seguros a los componentes de configuracion. Desde ahi el admin puede
crear, editar, activar o desactivar plantillas.

La ruta `/dashboard/configuracion/plantillas/[templateId]` carga
`getTaskTemplateById()` y `listTaskTemplateTasks()` para mostrar el detalle y
gestionar tareas. Las Server Actions reciben el `templateId` desde el Server
Component y solo leen campos editables desde `FormData`.

## Servicios de plantilla

Los servicios de cabecera son:

- `listTaskTemplates()`
- `getTaskTemplateById()`
- `createTaskTemplate()`
- `updateTaskTemplate()`
- `toggleTaskTemplateActive()`

Todos validan usuario interno activo y permisos cuando aplica. Las lecturas usan
`configuracion.view`; las mutaciones usan `configuracion.manage`.

## Servicios de tareas de plantilla

Los servicios de tareas son:

- `listTaskTemplateTasks()`
- `createTaskTemplateTask()`
- `updateTaskTemplateTask()`
- `deleteTaskTemplateTask()`
- `reorderTaskTemplateTask()`

Crear, eliminar y reordenar tareas usan operaciones Supabase secuenciales. Es
aceptable para MVP y volumen bajo, pero queda como deuda tecnica evaluar una RPC
transaccional solo si aparece concurrencia real o fallos de normalizacion de
orden.

## Relacion con Pedidos y workflow_type

`list-active-task-templates-for-order.ts` entrega plantillas activas con al menos
una tarea para el selector del detalle de pedido.

`apply-task-template-to-pedido.ts` valida UUIDs y perfil interno activo, y luego
llama la RPC `aplicar_plantilla_tareas_pedido`. La copia real a `pedido_tareas`
vive en la base de datos porque es una operacion transaccional y multi-tabla.

La regla vigente es:

- `workflow_type = encargo`: puede usar plantillas y requiere tareas para el
  flujo operativo.
- `workflow_type = impresion`: no requiere tareas obligatorias y no debe recibir
  plantillas.

La UI oculta el selector en pedidos `impresion`, pero la defensa real esta en la
RPC. No se debe aplicar una plantilla a `workflow_type = impresion`.

## Permisos, RLS y seguridad

Configuracion esta limitada a `admin`.

- `configuracion.view`: solo `admin`.
- `configuracion.manage`: solo `admin`.

Los componentes no consultan Supabase. Las Server Actions son adaptadores finos:
leen `FormData`, llaman servicios, devuelven mensajes seguros y revalidan rutas.
Las reglas fuertes viven en servicios, RLS y RPC.

RLS refuerza:

- lectura de plantillas/tareas para usuarios internos activos, con visibilidad
  ampliada para admin;
- mutacion de plantillas/tareas solo para admin.

La RPC `aplicar_plantilla_tareas_pedido` valida usuario, perfil activo, permiso
efectivo de gestion de tareas del pedido, estado editable, plantilla activa,
plantilla no vacia y `workflow_type = encargo`.

Reglas permanentes:

- no usar `service_role`;
- no agregar `SUPABASE_SERVICE_ROLE_KEY`;
- no consultar `auth.users` desde app code;
- no exponer errores SQL, Postgres o Supabase al usuario;
- no crear `pedidos.tasks.manage` sin una fase explicita de permisos, RLS, docs
  y QA.

## Revalidacion

Las mutaciones usan helpers centralizados en `src/lib/actions/revalidation.ts`:

- `revalidateTaskTemplatesList()`
- `revalidateTaskTemplateDetail(templateId)`

La aplicacion de plantilla a pedido usa `revalidatePedidoDetail(pedidoId)` para
refrescar dashboard, listado y detalle de pedido.

## QA e2e focal

Beta 2.8.5 agrego `tests/e2e/task-templates.spec.ts` con tres pruebas seriales:

- admin accede a Configuracion;
- supervisor y worker quedan bloqueados;
- admin crea una plantilla QA;
- admin edita descripcion;
- admin desactiva/reactiva plantilla;
- admin crea tarea simple;
- admin crea tarea cuantificada;
- admin reordena tarea;
- admin edita tarea;
- admin elimina tarea;
- admin aplica plantilla a pedido `encargo`;
- pedido `impresion` no muestra selector ni accion de aplicar plantilla;
- se revisa ausencia de terminos sensibles en pantallas donde aplica.

Estado documentado al cierre Beta 2.8:

- `task-templates.spec.ts`: 3/3 en Chromium.
- `full-visual-qa.spec.ts`: 1/1 en Chromium.
- suite e2e serial Chromium: 26/26.
- suite e2e paralela Chromium con 8 workers: pendiente por flakiness de
  auth/timeouts/navegacion.

## Que no hacer

- No mover este dominio a `src/services`.
- No consultar Supabase desde componentes.
- No duplicar reglas fuertes en UI.
- No aplicar plantillas a pedidos `impresion`.
- No cambiar `workflow_type` sin coordinar Pedidos, Dashboard, RPCs, docs y QA.
- No cambiar permisos sin coordinar TypeScript, RLS, docs y QA.
- No crear `rpc.ts` hasta que haya mas RPCs o repeticion real.
- No reemplazar la RPC transaccional de aplicacion por escrituras directas desde
  TypeScript.

## Deuda tecnica restante

- Crear/eliminar/reordenar tareas de plantilla usa operaciones Supabase
  secuenciales.
- Evaluar RPC transaccional para gestion de tareas de plantilla solo si aparece
  concurrencia real.
- El conteo de tareas del listado usa segunda query y `Map`; aceptable para MVP.
- Mantener sin `rpc.ts` hasta que haya repeticion real.
- La suite e2e paralela con 8 workers sigue inestable por auth/timeouts y
  navegacion.
- `verify` depende de Google Fonts/red durante `next build`.
- Cualquier cambio de `workflow_type` debe coordinar Pedidos, Dashboard, RPC,
  docs y QA.
- Cualquier cambio de permisos debe coordinar TS, RLS, docs y QA.
