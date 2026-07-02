# Beta 2.8.1 - Auditoria focal de Configuracion y plantillas de tareas

## 1. Objetivo

Auditar el estado actual del dominio de Configuracion y plantillas de tareas sin
modificar codigo funcional. El alcance cubre `/dashboard/configuracion`, el
detalle de plantilla, los servicios en `src/lib/task-templates`, las Server
Actions asociadas, los componentes consumidores, la aplicacion de plantillas a
pedidos y la relacion con permisos, RLS, RPCs y `workflow_type`.

Esta auditoria busca decidir como consolidar Beta 2.8 sin romper permisos,
validaciones server-side, RLS, la RPC `aplicar_plantilla_tareas_pedido`, ni los
contratos ya usados por Pedidos y Dashboard.

## 2. Resumen ejecutivo

El estado general es bueno. Configuracion esta acotada a `admin` en rutas,
permisos TypeScript, servicios y RLS. Las Server Actions son adaptadores finos:
leen `FormData`, llaman servicios de `src/lib/task-templates`, devuelven estado
de UI y revalidan rutas. Los componentes no consultan Supabase directamente.

Puntos fuertes:

- `src/lib/task-templates` ya concentra la logica server-side del dominio.
- Las validaciones de plantilla y tarea viven en servicios/helpers, no solo en
  cliente.
- `configuracion.view` y `configuracion.manage` estan limitados a `admin`.
- RLS permite lectura de plantillas activas a usuarios internos activos y
  mutacion solo a `admin`.
- La aplicacion de plantilla a pedido esta delegada a una RPC transaccional.
- La RPC bloquea pedidos `impresion`, estados no editables, plantillas
  inactivas y plantillas vacias.
- La UI solo muestra el selector de plantillas para pedidos `encargo` y estados
  editables.
- No se detecta `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, `auth.users` ni
  Supabase directo en componentes.

Riesgos principales detectados en Beta 2.8.1:

- Tipos, reasons y DTOs estaban dispersos por archivo; resuelto en Beta 2.8.2
  con `src/lib/task-templates/types.ts`.
- Mensajes genericos, razones de error y `ActionState` se repiten en actions y
  servicios.
- El parsing de errores de la RPC vive dentro de
  `apply-task-template-to-pedido.ts`; si se agregan mas RPCs, conviene extraer
  `rpc.ts` o `errors.ts`.
- Crear, eliminar y reordenar tareas de plantilla hace varias operaciones
  Supabase fuera de una RPC; es aceptable para MVP, pero puede dejar orden
  parcialmente normalizado si una actualizacion intermedia falla.
- No existia spec e2e focal de Configuracion/templates; resuelto en Beta 2.8.5
  con `tests/e2e/task-templates.spec.ts`.

Recomendacion general: consolidar primero tipos, errores y validaciones del
dominio; despues reducir duplicacion en Server Actions/revalidacion; luego
revisar atomicidad y contrato de aplicacion de plantillas; cerrar con QA e2e
focal y documentacion.

## 3. Mapa del dominio task-templates

| Archivo | Responsabilidad | Riesgo | Recomendacion |
| ------- | --------------- | ------ | ------------- |
| `index.ts` | Barrel publico del dominio. Exporta servicios, validaciones y contratos compartidos desde `types.ts`. | Bajo. | Mantener como API publica del dominio. |
| `task-template-validation.ts` | Valida nombre y descripcion de plantilla; define field errors e input. | Bajo. | Mantener y reexportar tipos desde `types.ts` si se crea. |
| `task-template-task-validation.ts` | Reutiliza `parsePedidoTaskTitle` para parsear titulo, tipo y cantidad de tarea de plantilla. | Bajo: buena reutilizacion con Pedidos. | Mantener esta dependencia explicita; no duplicar parseo. |
| `list-task-templates.ts` | Lista plantillas para Configuracion, con conteo de tareas. Requiere `configuracion.view`. | Medio: hace query de plantillas y conteo manual por tareas. | Mantener por ahora; si crece, extraer mapper/query helper. |
| `get-task-template-by-id.ts` | Carga detalle de plantilla por UUID. Requiere `configuracion.view`. | Bajo. | Mantener; compartir tipo `TaskTemplateDetail`. |
| `list-task-template-tasks.ts` | Valida UUID, confirma plantilla existente y lista tareas ordenadas. Requiere `configuracion.view`. | Bajo-medio por doble query. | Aceptable; documentar que evita mostrar tareas de plantilla inexistente. |
| `create-task-template.ts` | Crea cabecera de plantilla con `created_by`/`updated_by`. Requiere `configuracion.manage`. | Bajo. | Mantener; centralizar reasons y errores genericos. |
| `update-task-template.ts` | Edita nombre/descripcion y `updated_by`. Requiere `configuracion.manage`. | Bajo. | Mantener; compartir input/reasons. |
| `toggle-task-template-active.ts` | Activa/desactiva plantilla. Requiere `configuracion.manage`. | Bajo. | Mantener; usar helper comun de UUID/boolean si aparece mas repeticion. |
| `create-task-template-task.ts` | Crea tarea, calcula siguiente `sort_order` y guarda tipo/cantidad. Requiere `configuracion.manage`. | Medio: lectura de max sort + insert no es transaccional. | Aceptable MVP; evaluar RPC si hay concurrencia real. |
| `update-task-template-task.ts` | Edita titulo, tipo y cantidad de una tarea. Requiere `configuracion.manage`. | Bajo. | Mantener; centralizar tipos de values/fieldErrors. |
| `delete-task-template-task.ts` | Elimina tarea y normaliza orden de las restantes. Requiere `configuracion.manage`. | Medio: delete + normalizacion son varias operaciones. | Considerar RPC o helper transaccional en fase explicita si se detectan fallos de orden. |
| `reorder-task-template-task.ts` | Mueve tarea arriba/abajo reescribiendo `sort_order`. Requiere `configuracion.manage`. | Medio: varias actualizaciones secuenciales. | Mantener si volumen bajo; evaluar RPC para atomicidad si crece. |
| `list-active-task-templates-for-order.ts` | Lista plantillas activas con tareas para selector de pedido. Requiere usuario interno activo; RLS filtra visibilidad. | Bajo-medio: no valida `pedidos.manage` aqui, porque solo lista plantillas activas. | Mantener; la aplicacion real queda protegida por RPC. |
| `apply-task-template-to-pedido.ts` | Valida UUIDs, usuario activo y llama RPC `aplicar_plantilla_tareas_pedido`; mapea errores seguros. | Medio: parser de mensajes RPC local y sensible a textos. | Extraer `rpc.ts`/`errors.ts` si se agregan mas RPCs o cambios de mensajes. |

## 4. Flujo de Configuracion

Ruta: `/dashboard/configuracion`.

Pagina: `src/app/dashboard/configuracion/page.tsx`.

La pagina llama `listTaskTemplates()` server-side. Si el resultado falla,
renderiza `Alert`; si funciona, pasa DTOs a `TaskTemplatesSection`.

Permisos:

- La ruta esta limitada a `admin` por `canAccessDashboardRoute`.
- `listTaskTemplates()` repite validacion server-side:
  - usuario interno activo;
  - `configuracion.view`.
- En la matriz vigente `configuracion.view` pertenece solo a `admin`.
- RLS refuerza lectura: usuarios internos activos ven plantillas activas;
  `admin` ve activas e inactivas.

Componentes:

- `TaskTemplatesSection` compone cabecera, alerta informativa, formulario de
  creacion y listado.
- `TaskTemplateForm` es Client Component con `useActionState`; envia solo
  `name`, `description` y, en edicion, `template_id`.
- `TaskTemplatesList` muestra DTOs de plantilla, conteo de tareas, editar,
  activar/desactivar y enlace a "Gestionar tareas".

Actions:

- `createTaskTemplateAction`
- `updateTaskTemplateAction`
- `toggleTaskTemplateActiveAction`

Las actions llaman servicios y revalidan `/dashboard/configuracion`. No
contienen reglas de negocio fuertes.

DTOs visibles:

- `TaskTemplateListItem`: `id`, `name`, `description`, `is_active`,
  `created_at`, `updated_at`, `tasksCount`.
- No expone `created_by`, `updated_by`, metadata cruda, datos Auth ni errores
  SQL/Supabase.

## 5. Flujo de detalle de plantilla

Ruta: `/dashboard/configuracion/plantillas/[templateId]`.

Pagina: `src/app/dashboard/configuracion/plantillas/[templateId]/page.tsx`.

La pagina carga en paralelo:

- `getTaskTemplateById(templateId)`;
- `listTaskTemplateTasks(templateId)`.

Si el id es invalido o la plantilla no existe, llama `notFound()`. Si hay otro
error, muestra `Alert` seguro. La pagina bindea `templateId` a las actions de
tareas y lo pasa a componentes.

Componentes:

- `TaskTemplateDetailHeader`: muestra nombre, descripcion, estado y fechas.
- `TaskTemplateTasksSection`: muestra formulario de creacion y listado.
- `TaskTemplateTaskForm`: crea/edita titulo de tarea con `useActionState`.
- `TaskTemplateTasksList`: muestra tareas, botones subir/bajar/eliminar y
  formulario de edicion.

Actions:

- `createTaskTemplateTaskAction`;
- `updateTaskTemplateTaskAction`;
- `deleteTaskTemplateTaskAction`;
- `moveTaskTemplateTaskAction`.

Revalidacion:

- Existe helper centralizado `revalidateTaskTemplateDetail(templateId)` en
  `src/lib/actions/revalidation.ts` que revalida:
  - `/dashboard/configuracion`;
  - `/dashboard/configuracion/plantillas/${templateId}`.

Errores seguros:

- Los servicios devuelven `unauthorized`, `forbidden`, `invalid_id`,
  `not_found`, `validation` o `error` con mensajes de UI.
- Los errores de Supabase se loguean server-side con `console.error` y se
  reemplazan por mensajes genericos.

Riesgo principal: crear/eliminar/reordenar tareas de plantilla no usa RPC
transaccional. Para volumen bajo es aceptable, pero puede ser una consolidacion
futura si el orden se vuelve critico o concurrente.

## 6. Aplicacion de plantilla a pedido

Componentes y ruta:

- `src/app/dashboard/pedidos/[id]/page.tsx` decide si cargar plantillas.
- `PedidoTasksSection` recibe `applyTaskTemplateAction` solo cuando aplica.
- `ApplyTaskTemplateForm` muestra selector de plantillas activas con tareas.

Condicion UI para mostrar selector:

- `result.pedido.workflow_type === WORKFLOW_TYPES.ENCARGO`;
- `canManagePedidoTasksInStatus(result.pedido.status)`.

La UI no muestra el selector para `impresion`, pero esto es solo ayuda de UX.
La defensa real vive en el servicio y la RPC.

Server Action:

- `applyTaskTemplateAction(pedidoId, prevState, formData)` lee `template_id`,
  llama `applyTaskTemplateToPedido`, revalida detalle de pedido con
  `revalidatePedidoDetail(pedidoId)` y devuelve mensaje con cantidad insertada.

Servicio:

- `applyTaskTemplateToPedido` valida UUID de pedido y plantilla.
- Exige usuario interno activo.
- Llama RPC `aplicar_plantilla_tareas_pedido`.
- Convierte errores conocidos de RPC a razones y mensajes seguros.

RPC `public.aplicar_plantilla_tareas_pedido`:

- Es `security definer` con `search_path = public, private`.
- Valida `auth.uid()` y usuario interno activo.
- Bloquea/carga el pedido `for update`.
- Rechaza pedidos que no sean `workflow_type = encargo`.
- Valida `private.can_manage_pedido_tasks(pedido_id)`.
- Distingue estado bloqueado de falta de permiso.
- Verifica plantilla existente y activa.
- Verifica que la plantilla tenga tareas.
- Calcula el maximo `sort_order` actual del pedido.
- Copia tareas de plantilla al final de `pedido_tareas` en una operacion
  transaccional, preservando orden relativo.
- Devuelve `insertedCount`.
- Tiene `execute` solo para `authenticated`; `anon` no tiene grant.

Por que solo `encargo`:

- En el modelo vigente, `encargo` requiere tareas para orientar progreso y
  avanzar estados.
- `impresion` es flujo directo y puede avanzar sin tareas obligatorias.
- Esta regla esta alineada con Pedidos y Dashboard Beta 2.7.4: las senales de
  "sin tareas" solo aplican a `encargo`.

Intento sobre `impresion`:

- La UI no muestra selector.
- La RPC devuelve "Esta plantilla solo puede aplicarse a pedidos de tipo
  Encargo."
- El servicio mapea ese mensaje a reason `workflow_blocked`.

## 7. Permisos y seguridad

Permisos TypeScript:

- `configuracion.view`: solo `admin`.
- `configuracion.manage`: solo `admin`.
- No existe permiso `pedidos.tasks.manage` en la matriz TS actual.
- Para aplicar plantillas a pedidos se usa el permiso efectivo de gestionar
  tareas del pedido via `private.can_manage_pedido_tasks`.

Rutas:

- `/dashboard/configuracion` y subrutas estan limitadas a `admin` por proxy/rutas.
- `supervisor` y `trabajador` no deben ver navegacion de Configuracion.

Servicios:

- Lecturas de Configuracion validan `getCurrentProfile()` y
  `configuracion.view`.
- Mutaciones de plantillas y tareas validan `configuracion.manage`.
- Aplicar plantilla valida usuario activo y delega permisos reales a RPC.

RLS:

- `trabajo_plantillas` y `trabajo_plantilla_tareas` tienen RLS activo.
- Lectura: usuarios internos activos ven plantillas activas y sus tareas;
  `admin` ve todas.
- Mutacion: insert/update/delete solo `admin`.

RPC:

- `aplicar_plantilla_tareas_pedido` valida usuario, permiso efectivo,
  workflow, estado, plantilla activa y plantilla no vacia.
- La operacion de copia a `pedido_tareas` es transaccional.

Ausencias verificadas:

- No se detecta Supabase directo en `src/components/configuracion`.
- No se detecta Supabase directo en `ApplyTaskTemplateForm` ni
  `PedidoTasksSection`.
- No se detecta uso operativo de `service_role`.
- No se agrega ni lee `SUPABASE_SERVICE_ROLE_KEY`.
- No se consulta `auth.users` desde app code.
- No se exponen `file_path`, metadata cruda ni datos sensibles en DTOs de
  plantillas.

## 8. DTOs, tipos y validaciones

Tipos existentes:

- `TaskTemplateListItem`
- `TaskTemplateDetail`
- `TaskTemplateTask`
- `ActiveTaskTemplateForOrder`
- Inputs/resultados por servicio
- `TaskTemplateFieldErrors`
- `TaskTemplateTaskFieldErrors`
- `ApplyTaskTemplateFieldErrors`

Estado final: los tipos compartidos viven en
`src/lib/task-templates/types.ts`. Esto incluye DTOs, inputs, field errors y
reasons. Los `ServiceResult` especificos permanecen locales por operacion.

Validaciones:

- Nombre/descripcion de plantilla:
  - `validateTaskTemplateInput`;
  - nombre requerido, 2 a 120 caracteres;
  - descripcion maximo 2000 caracteres;
  - constraints equivalentes existen en base.
- Titulo de tarea de plantilla:
  - `parseTaskTemplateTaskTitle`;
  - reutiliza `parsePedidoTaskTitle`;
  - detecta tarea simple o cuantificada;
  - valida entero positivo si hay cantidad.
- UUIDs:
  - `isValidUuid` en servicios de detalle, update, toggle, tasks y apply.
- Boolean de activar/desactivar:
  - parseado en Server Action a `true`, `false` o `null`;
  - servicio valida boolean.

Errores seguros:

- Los servicios devuelven `ServiceResult`.
- SQL/Supabase no llega al usuario; solo se loguea server-side.
- `fieldErrors` se devuelven para inputs editables.

Riesgo: los `ErrorReason` y `ActionState` se repiten por servicio/action. No es
bug, pero es buen primer objetivo de consolidacion.

## 9. Server Actions y revalidacion

Actions de Configuracion:

- `createTaskTemplateAction`;
- `updateTaskTemplateAction`;
- `toggleTaskTemplateActiveAction`.

Actions de detalle de plantilla:

- `createTaskTemplateTaskAction`;
- `updateTaskTemplateTaskAction`;
- `deleteTaskTemplateTaskAction`;
- `moveTaskTemplateTaskAction`.

Action de pedido:

- `applyTaskTemplateAction`.

Patrones:

- Todas leen `FormData` con `getFormValue`.
- Todas llaman servicios en `src/lib`.
- Todas devuelven `{ ok, message, fieldErrors?, values? }` o helpers comunes
  de action state en Pedido.
- Actions de Configuracion definen `TaskTemplateActionState` local.
- Actions de detalle definen cuatro estados locales muy parecidos.
- Action de Pedido usa `actionFailure`/`actionSuccess` desde
  `src/lib/actions/action-state`.

Revalidaciones:

- Configuracion usa `revalidateTaskTemplatesList()`.
- Detalle usa `revalidateTaskTemplateDetail(templateId)`.
- Pedido usa helper transversal `revalidatePedidoDetail(pedidoId)`.

Estado final: los helpers de revalidacion de Configuracion viven en
`src/lib/actions/revalidation.ts`; las Server Actions usan helpers comunes de
action-state y permanecen como adaptadores finos.

## 10. Relacion con Pedidos y workflow_type

Las plantillas son para pedidos tipo `encargo`. En encargos, las tareas modelan
progreso real y condicionan avances operativos. En `impresion`, el pedido puede
avanzar por flujo directo sin tareas obligatorias.

Relacion con Pedidos:

- La plantilla copia tareas a `pedido_tareas`.
- Las tareas copiadas quedan como tareas normales del pedido.
- El progreso se calcula con los mismos helpers de Pedidos.
- El estado de pedido controla si las tareas pueden mutarse mediante
  `canManagePedidoTasksInStatus` en UI y `private.can_manage_pedido_tasks` en
  DB.

Relacion con Dashboard Beta 2.7.4:

- Dashboard ya usa `workflow_type` para que "sin tareas" solo marque encargos.
- Cambiar reglas de plantillas sin ajustar Dashboard podria reintroducir
  drift entre tareas, progreso y work-items.

Riesgo de tocar esta regla:

- Permitir plantillas en `impresion` requeriria revisar Pedidos, Dashboard,
  RPC `actualizar_estado_pedido`, RPC `aplicar_plantilla_tareas_pedido`, docs,
  RLS/QA y UX. No debe hacerse como refactor tecnico incidental.

## 11. QA existente y huecos

Cobertura actual:

- `full-visual-qa.spec.ts` cubre:
  - creacion/conversion de pedidos;
  - tareas manuales de pedido;
  - bloqueo de avance de `encargo` sin tareas;
  - avance de `impresion` sin tareas;
  - permisos generales por rol.
- `dashboard.spec.ts` cubre ausencia de enlace a `/dashboard/configuracion`
  para supervisor y trabajador, pero no visita la ruta de Configuracion.

Huecos detectados en Beta 2.8.1 y cerrados en Beta 2.8.5:

- Spec e2e focal de Configuracion/templates.
- Crear plantilla.
- Editar plantilla.
- Activar/desactivar plantilla.
- Detalle de plantilla.
- Crear/editar/eliminar/reordenar tareas de plantilla.
- Aplicar plantilla a pedido `encargo`.
- Confirmar ausencia de selector en pedido `impresion`.
- Confirmar que supervisor/worker no puedan acceder a
  `/dashboard/configuracion`.

Casos recomendados sin crear datos peligrosos:

- Crear plantilla QA con nombre unico.
- Agregar dos tareas y reordenarlas.
- Desactivar y reactivar plantilla.
- Crear pedido `encargo` QA y aplicar plantilla.
- Verificar que tareas se agregan al final.
- Crear pedido `impresion` QA y confirmar que no aparece selector o que backend
  bloquea intento.
- Confirmar ausencia de terminos sensibles visibles.
- Confirmar rutas protegidas para supervisor y trabajador.

## 12. Hallazgos clasificados

| Severidad | Area | Hallazgo | Riesgo | Recomendacion |
| --------- | ---- | -------- | ------ | ------------- |
| Medio | Tipos | Tipos, DTOs y reasons estan distribuidos por archivo. | Imports mas largos y mayor costo al cambiar contratos. | Crear `src/lib/task-templates/types.ts` en Beta 2.8.2. |
| Medio | RPC/errors | `apply-task-template-to-pedido.ts` parsea mensajes de RPC localmente. | Drift si cambian textos SQL o se agregan mas RPCs. | Extraer mapper de errores o `rpc.ts` del dominio. |
| Medio | Atomicidad | Crear/eliminar/reordenar tareas de plantilla usa varias operaciones Supabase secuenciales. | Orden parcialmente normalizado ante error intermedio o concurrencia. | Evaluar RPC transaccional solo si QA/uso real lo justifica. |
| Medio | QA | No existe e2e focal de Configuracion/templates. | Cambios futuros dependen de full QA indirecto. | Crear spec focal en Beta 2.8.5. |
| Bajo | Server Actions | ActionState y mensajes se repiten en actions de Configuracion/detalle. | Mantenimiento repetitivo. | Reusar helpers de `src/lib/actions` o crear helpers locales. |
| Bajo | Revalidacion | Resuelto en Beta 2.8.3: Configuracion usa helpers centralizados. | Bajo; mantener los helpers al agregar rutas. | Usar `revalidateTaskTemplatesList` y `revalidateTaskTemplateDetail`. |
| Bajo | Listados | Conteo de tareas se calcula con segunda query y Map. | Suficiente para MVP; puede crecer en costo. | Medir antes de optimizar; evitar RPC prematura. |
| Bajo | Permisos TS | No existe `pedidos.tasks.manage`; se usa permiso efectivo DB para tareas. | Puede confundir lectura de codigo. | Documentar; no crear permiso nuevo sin fase de permisos/RLS. |
| Observacion | Seguridad | Configuracion esta limitada a `admin` en ruta, servicios y RLS. | N/A | Mantener triple defensa. |
| Observacion | Componentes | No se detecta Supabase directo en componentes de Configuracion/Pedidos revisados. | N/A | Mantener componentes como UI y actions. |
| Observacion | Workflow | UI y RPC bloquean plantillas para `impresion`. | N/A | Mantener alineado con Pedidos y Dashboard. |
| Observacion | Secretos | No se detecta uso operativo de `service_role`, `SUPABASE_SERVICE_ROLE_KEY` ni `auth.users`. | N/A | Mantener reglas actuales. |

No se detecta hallazgo critico: no hay evidencia de bypass real de permisos,
exposicion de secretos, mutacion anonima o Supabase directo desde componentes.

## 13. Plan recomendado para Beta 2.8

1. Beta 2.8.2 - Consolidar tipos, errores y validaciones de task-templates.
   - Crear `src/lib/task-templates/types.ts`.
   - Centralizar DTOs, inputs compartidos, field errors y reasons.
   - Mantener `task-template-validation.ts` y
     `task-template-task-validation.ts` como reglas runtime.

2. Beta 2.8.3 - Consolidar Server Actions y revalidacion de Configuracion.
   - Extraer helpers de revalidacion a `src/lib/actions/revalidation.ts`.
   - Reducir duplicacion de ActionState sin cambiar UI.
   - Mantener actions finas y cercanas a la ruta.

3. Beta 2.8.4 - Revisar aplicacion de plantillas a pedidos.
   - Extraer mapper seguro de errores RPC.
   - Confirmar contrato de `workflow_type = encargo`.
   - Evaluar si crear `rpc.ts` para task-templates.
   - No cambiar RPC ni RLS salvo fase explicita.

4. Beta 2.8.5 - QA e2e focal de Configuracion/templates.
   - Cubrir ruta admin, rutas protegidas, CRUD basico de plantilla,
     tareas de plantilla, aplicacion a encargo y bloqueo de impresion.
   - Mantener datos QA controlados.

5. Beta 2.8.6 - Documentar y cerrar Configuracion/templates.
   - Actualizar README/modelo correspondiente.
   - Registrar deudas restantes y resultados de QA.

## 14. Que NO conviene hacer

- No cambiar la UI visual.
- No convertir Beta 2.8 en fase UI/UX.
- No cambiar permisos.
- No tocar RLS/migrations.
- No modificar RPCs sin fase explicita.
- No mover reglas de negocio a componentes.
- No aplicar plantillas a `impresion`.
- No crear abstracciones globales prematuras.
- No crear `src/services`.
- No tocar Pedidos/Dashboard salvo integracion estrictamente necesaria.
- No cambiar textos visibles durante consolidacion tecnica.
- No agregar dependencias.
- No editar `src/types/database.types.ts` sin cambio real de DB.

## 15. Checklist de cierre de auditoria

- [x] Reviso `src/lib/task-templates`.
- [x] Reviso pagina de Configuracion.
- [x] Reviso detalle de plantilla.
- [x] Reviso Server Actions.
- [x] Reviso aplicacion de plantilla a pedido.
- [x] Reviso permisos.
- [x] Reviso RLS/RPC/migrations relevantes.
- [x] Reviso componentes consumidores.
- [x] Reviso QA existente.
- [x] Propuso subfases.
- [x] No modifico codigo funcional.

## 16. Cierre documental Beta 2.8.6

Beta 2.8 queda cerrada documentalmente para el dominio
Configuracion/templates.

Subfases:

- Beta 2.8.1 completada: auditoria focal de Configuracion y plantillas de
  tareas.
- Beta 2.8.2 completada: consolidacion de tipos, errores y validaciones de
  `task-templates`.
- Beta 2.8.3 completada: consolidacion de Server Actions y revalidacion de
  Configuracion.
- Beta 2.8.4 completada: revision de aplicacion de plantillas a pedidos.
- Beta 2.8.5 completada: QA e2e focal de Configuracion/templates.
- Beta 2.8.6 completada: cierre documental del dominio.

Estado final:

- `src/lib/task-templates/types.ts` existe como contrato compartido del dominio.
- Los DTOs, inputs, field errors y reasons compartidos viven en `types.ts`.
- Los `ServiceResult` especificos permanecen locales por operacion para mantener
  cada contrato cerca del servicio que lo devuelve.
- `task-template-validation.ts` conserva la validacion runtime de cabecera de
  plantilla.
- `task-template-task-validation.ts` conserva la validacion runtime de tareas de
  plantilla reutilizando el parser de tareas de pedido.
- `errors.ts` se creo en Beta 2.8.4 para el mapper seguro de errores RPC.
- `errors.ts` contiene `mapApplyTaskTemplateRpcError()`.
- No se creo `rpc.ts` porque no hay repeticion suficiente: existe una sola RPC
  consumida desde este dominio.
- La revalidacion de Configuracion quedo centralizada en
  `src/lib/actions/revalidation.ts`.
- `revalidateTaskTemplatesList()` revalida `/dashboard/configuracion`.
- `revalidateTaskTemplateDetail(templateId)` revalida listado y detalle de
  plantilla.
- Las Server Actions siguen siendo adaptadores finos: leen `FormData`, llaman
  servicios, devuelven estados seguros y revalidan.
- La aplicacion de plantillas a pedido mantiene la RPC transaccional
  `aplicar_plantilla_tareas_pedido`.
- El bloqueo de `workflow_type = impresion` permanece intacto.
- La UI oculta el selector en pedidos `impresion`, pero la defensa real sigue en
  la RPC.
- `tests/e2e/task-templates.spec.ts` agrega QA focal del dominio.
- La suite e2e total esperada en Chromium queda en 26 tests.
- La suite serial pasa 26/26.
- La suite paralela con 8 workers sigue inestable por auth/timeouts/navegacion y
  pasa como deuda a Beta 2.9.

Mapa operativo final:

- `src/lib/task-templates/README.md` documenta arquitectura actual, mapa de
  archivos, contratos, validaciones, errores RPC, permisos, RLS, relacion con
  Pedidos, relacion con `workflow_type`, helpers de revalidacion, QA y deudas.

## 17. QA focal Beta 2.8.5

`tests/e2e/task-templates.spec.ts` cubre:

- admin accede a Configuracion;
- supervisor y worker quedan bloqueados;
- crear plantilla QA;
- editar descripcion;
- desactivar y reactivar plantilla;
- crear tarea simple;
- crear tarea cuantificada;
- reordenar tarea;
- editar tarea;
- eliminar tarea;
- aplicar plantilla a pedido `encargo`;
- confirmar ausencia de selector en pedido `impresion`;
- ausencia de terminos sensibles en pantallas donde aplica.

Estado QA documentado:

- Total e2e Chromium esperado: 26 tests.
- `tests/e2e/task-templates.spec.ts`: 3/3.
- `tests/e2e/full-visual-qa.spec.ts`: 1/1.
- Suite serial Chromium: 26/26.
- Suite paralela Chromium: pendiente por flakiness de auth/timeouts/navegacion.

## 18. Seguridad final documentada

- Configuracion esta limitada a `admin`.
- `configuracion.view` y `configuracion.manage` pertenecen solo a `admin`.
- Los componentes no consultan Supabase.
- Las Server Actions no contienen reglas fuertes de negocio.
- Los servicios validan perfil activo y permisos.
- RLS refuerza lectura y mutacion de plantillas.
- `aplicar_plantilla_tareas_pedido` es la defensa transaccional para copiar
  tareas de plantilla al pedido.
- No aplicar plantillas a `workflow_type = impresion`.
- No usar `service_role`.
- No agregar `SUPABASE_SERVICE_ROLE_KEY`.
- No consultar `auth.users` desde app code.
- No exponer errores SQL/Postgres/Supabase al usuario.
- No crear permiso `pedidos.tasks.manage` sin fase explicita de permisos, RLS,
  docs y QA.

## 19. Deuda tecnica restante

Pendientes reales, no fallas criticas:

- Crear, eliminar y reordenar tareas de plantilla usa operaciones Supabase
  secuenciales.
- Evaluar RPC transaccional para gestion de tareas de plantilla solo si aparece
  concurrencia real.
- El conteo de tareas en listado usa segunda query y `Map`; aceptable para MVP.
- No crear `rpc.ts` hasta que haya mas RPCs o repeticion real.
- La suite e2e paralela con 8 workers sigue inestable por
  auth/timeouts/navegacion.
- `build`/`verify` sigue dependiendo de Google Fonts/red.
- Cualquier cambio de `workflow_type` debe coordinar Pedidos, Dashboard, RPC,
  docs y QA.
- Cualquier cambio de permisos debe coordinar TS, RLS, docs y QA.
