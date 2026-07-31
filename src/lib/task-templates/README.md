# Dominio task-templates

## Rol del dominio

`src/lib/task-templates` concentra la lógica server-side de plantillas de
tareas. El dominio permite administrar plantillas reutilizables desde
`/dashboard/configuracion`, gestionar las tareas internas de cada plantilla y
aplicar una plantilla activa a pedidos de tipo `encargo`.

Las plantillas no son una fuente paralela de progreso: al aplicarse a un pedido,
sus tareas se copian a `pedido_tareas` y desde ese momento se comportan como
tareas normales del pedido.

## Mapa de archivos

- `index.ts`: barrel público del dominio.
- `types.ts`: DTOs, inputs, field errors y reasons compartidos.
- `task-template-validation.ts`: validación runtime de nombre y descripción de
  plantilla.
- `task-template-task-validation.ts`: validación runtime de títulos de tareas de
  plantilla, reutilizando el parser de tareas de pedido.
- `errors.ts`: errores seguros relacionados con la RPC de aplicación.
- `list-task-templates.ts`: listado administrativo de plantillas con conteo de
  tareas.
- `get-task-template-by-id.ts`: detalle seguro de una plantilla.
- `list-task-template-tasks.ts`: tareas de una plantilla ordenadas por
  `sort_order`.
- `create-task-template.ts`: creación de cabecera de plantilla.
- `update-task-template.ts`: edición de nombre y descripción.
- `toggle-task-template-active.ts`: activación o desactivación.
- `create-task-template-task.ts`: creación de tarea de plantilla.
- `update-task-template-task.ts`: edición de tarea de plantilla.
- `delete-task-template-task.ts`: eliminación y normalización de orden.
- `reorder-task-template-task.ts`: movimiento arriba/abajo.
- `search-active-task-templates-for-selector.ts`: búsqueda asíncrona de
  plantillas activas con tareas para el selector de detalle de pedido.
- `apply-task-template-to-pedido.ts`: aplicación transaccional mediante RPC.

## Contratos y validaciones

`types.ts` es el punto compartido para contratos del dominio:

- `TaskTemplateListItem`
- `TaskTemplateDetail`
- `TaskTemplateTask`
- inputs de mutación y aplicación
- `TaskTemplateFieldErrors`
- `TaskTemplateTaskFieldErrors`
- `ApplyTaskTemplateFieldErrors`
- reasons de error por operación

Los `ServiceResult` específicos permanecen locales en cada servicio para evitar
un archivo de tipos gigante. Esta decisión mantiene cerca de cada operación su
contrato de retorno sin volver a dispersar DTOs compartidos.

`task-template-validation.ts` valida nombre y descripción de plantilla. El nombre
es requerido y la descripción es opcional pero limitada.

`task-template-task-validation.ts` usa `parsePedidoTaskTitle()` para conservar la
misma semántica entre tareas de plantilla y tareas de pedido. Si el título
contiene una cantidad entera positiva, la tarea queda como `cuantificada`; si no,
queda como `simple`.

## Errores RPC seguros

`errors.ts` existe porque `apply-task-template-to-pedido.ts` necesita traducir
mensajes conocidos de la RPC `aplicar_plantilla_tareas_pedido` a errores seguros
de UI.

La función `mapApplyTaskTemplateRpcError()` mapea casos como:

- pedido inexistente;
- plantilla inexistente;
- `workflow_type` bloqueado;
- estado del pedido bloqueado;
- plantilla inactiva;
- plantilla vacía;
- falta de permiso;
- sesión o perfil interno inválido.

No existe `rpc.ts` en este dominio porque por ahora solo hay una llamada RPC y no
hay repetición suficiente para justificar otra abstracción. Si aparecen más RPCs
o se repite el patrón de tipos/casts/errores, entonces sí tendría sentido crear
`src/lib/task-templates/rpc.ts`.

## Configuración y detalle de plantilla

La página `/dashboard/configuracion` carga `listTaskTemplates()` server-side y
pasa DTOs seguros a los componentes de configuración. Desde ahí el admin puede
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
aceptable para MVP y volumen bajo, pero queda como deuda técnica evaluar una RPC
transaccional solo si aparece concurrencia real o fallos de normalización de
orden.

## Relación con Pedidos y workflow_type

`search-active-task-templates-for-selector.ts` entrega opciones reducidas para
el selector asíncrono del detalle de pedido. La búsqueda se expone mediante el
endpoint interno `/api/internal/selectors/plantillas-tareas`, que requiere
`pedido_id`, normaliza la consulta y delega en el servicio server-side.

El servicio valida UUID, usuario interno activo y acceso al pedido mediante RLS.
Después filtra por `workflow_type = encargo`, estado administrable, plantillas
activas y existencia de tareas con relación `!inner`. La respuesta enviada al
navegador se reduce a:

```ts
{ value, label, description }
```

La descripción indica `1 tarea` o `N tareas`. El detalle de pedido no precarga
plantillas al renderizar; las opciones se cargan bajo demanda desde el selector.

`apply-task-template-to-pedido.ts` valida UUIDs y perfil interno activo, y luego
llama la RPC `aplicar_plantilla_tareas_pedido`. La copia real a `pedido_tareas`
vive en la base de datos porque es una operación transaccional y multi-tabla.

La regla vigente es:

- `workflow_type = encargo`: puede usar plantillas y requiere tareas para el
  flujo operativo.
- `workflow_type = impresion`: no requiere tareas obligatorias y no debe recibir
  plantillas.

La UI oculta el selector en pedidos `impresion`, pero la defensa real está en la
RPC. No se debe aplicar una plantilla a `workflow_type = impresion`.

## Permisos, RLS y seguridad

Configuración está limitada a `admin`.

- `configuracion.view`: solo `admin`.
- `configuracion.manage`: solo `admin`.

Los componentes no consultan Supabase. Las Server Actions son adaptadores finos:
leen `FormData`, llaman servicios, devuelven mensajes seguros y revalidan rutas.
Las reglas fuertes viven en servicios, RLS y RPC.

RLS refuerza:

- lectura de plantillas/tareas para usuarios internos activos, con visibilidad
  ampliada para admin;
- mutación de plantillas/tareas solo para admin.

La RPC `aplicar_plantilla_tareas_pedido` valida usuario, perfil activo, permiso
efectivo de gestión de tareas del pedido, estado editable, plantilla activa,
plantilla no vacía y `workflow_type = encargo`.

Reglas permanentes:

- no usar `service_role`;
- no agregar `SUPABASE_SERVICE_ROLE_KEY`;
- no consultar `auth.users` desde app code;
- no exponer errores SQL, Postgres o Supabase al usuario;
- no crear `pedidos.tasks.manage` sin una fase explícita de permisos, RLS, docs
  y QA.

## Revalidación

Las mutaciones usan helpers centralizados en `src/lib/actions/revalidation.ts`:

- `revalidateTaskTemplatesList()`
- `revalidateTaskTemplateDetail(templateId)`

La aplicación de plantilla a pedido usa `revalidatePedidoDetail(pedidoId)` para
refrescar dashboard, listado y detalle de pedido.

## QA e2e focal

Beta 2.8.5 agregó `tests/e2e/task-templates.spec.ts` con tres pruebas seriales:

- admin accede a Configuración;
- supervisor y worker quedan bloqueados;
- admin crea una plantilla QA;
- admin edita descripción;
- admin desactiva/reactiva plantilla;
- admin crea tarea simple;
- admin crea tarea cuantificada;
- admin reordena tarea;
- admin edita tarea;
- admin elimina tarea;
- admin aplica plantilla a pedido `encargo`;
- pedido `impresion` no muestra selector ni acción de aplicar plantilla;
- se revisa ausencia de términos sensibles en pantallas donde aplica.

Estado documentado al cierre Beta 2.8:

- `task-templates.spec.ts`: 3/3 en Chromium.
- `full-visual-qa.spec.ts`: 1/1 en Chromium.
- suite e2e serial Chromium: 26/26.
- suite e2e paralela Chromium con 8 workers: pendiente por flakiness de
  auth/timeouts/navegación.

## Qué no hacer

- No mover este dominio a `src/services`.
- No consultar Supabase desde componentes.
- No duplicar reglas fuertes en UI.
- No aplicar plantillas a pedidos `impresion`.
- No cambiar `workflow_type` sin coordinar Pedidos, Dashboard, RPCs, docs y QA.
- No cambiar permisos sin coordinar TypeScript, RLS, docs y QA.
- No crear `rpc.ts` hasta que haya más RPCs o repetición real.
- No reemplazar la RPC transaccional de aplicación por escrituras directas desde
  TypeScript.

## Deuda técnica restante

- Crear/eliminar/reordenar tareas de plantilla usa operaciones Supabase
  secuenciales.
- Evaluar RPC transaccional para gestión de tareas de plantilla solo si aparece
  concurrencia real.
- El conteo de tareas del listado usa segunda query y `Map`; aceptable para MVP.
- Mantener sin `rpc.ts` hasta que haya repetición real.
- La suite e2e paralela con 8 workers sigue inestable por auth/timeouts y
  navegación.
- `verify` depende de Google Fonts/red durante `next build`.
- Cualquier cambio de `workflow_type` debe coordinar Pedidos, Dashboard, RPC,
  docs y QA.
- Cualquier cambio de permisos debe coordinar TS, RLS, docs y QA.
