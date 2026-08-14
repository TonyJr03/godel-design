# SH-03.2A — Inventario core y baseline production-like de solo lectura

## Estado

```text
SH-03.0 = CLOSED / APPROVED
SH-03.1 = CLOSED / APPROVED
SH-03.2 = ACTIVE
SH-03.2A = CLOSED / APPROVED
SH-03.2B = CLOSED / APPROVED
SH-03.2C = CLOSED / APPROVED
SH-03.2D = IN PROGRESS
SH-03.2D.1 = CLOSED / APPROVED
SH-03.2D.2 = CLOSED / APPROVED
SH-03.2D.3 = CLOSED / APPROVED
SH-03.2D.4 = CLOSED / APPROVED
SH-03.2D.5 = IMPLEMENTED / PENDING ARCHITECTURAL REVIEW
SH-03.2E = NOT STARTED
SH-03.3 = NOT STARTED
```

## Alcance y límites

SH-03.2A prepara los gates funcionales production-like de dashboard, clientes,
solicitudes, pedidos, tareas, pagos, configuración y tracking público. No
modifica acciones, componentes, tests, runtime, Compose, Nginx, Dockerfile,
Supabase upstream, migraciones 01–06 ni tipos generados. Storage/TUS y sus
mutaciones quedan fuera: corresponden a SH-03.3.

TD-NEXT-001 permanece activo. Esta fase no aplica el fallback documental de
forma preventiva: cada acción marcada `TEST IN SH-03.2` debe ejecutar primero
su patrón actual por Nginx. Solo una reproducción production-like de mutación
completada con fallo de `ActionState`/`pending`/frescura autoriza retirar la
revalidación concreta, aplicar el fallback aprobado y ampliar TD-NEXT-001.

## Inventario de Server Actions y riesgo TD-NEXT-001

El inventario contiene **36 acciones de mutación/control** de la superficie
examinada: 31 `SAFE / ALREADY FALLBACK`, 0 `TEST IN SH-03.2` y 5 `NOT
APPLICABLE`. Las dos acciones públicas de firma/finalize de Storage no entran
en ese total; las acciones de archivos de Pedido se registran como no aplicables
en SH-03.2A y se entregan a SH-03.3.

| Domain | Action | Component | Mutation | Revalidation | Returns ActionState | useActionState | Current route | Client refresh/navigation | Existing E2E | TD-NEXT classification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Clientes | `createClienteAction` | `ClienteForm` / create dialog | crear cliente | no success revalidation | Sí | Sí | `/dashboard/clientes` | `window.location.assign` | `clientes.spec.ts`; gate transversal | SAFE / ALREADY FALLBACK |
| Clientes | `updateClienteAction` | `ClienteEditForm` / edit dialog | editar perfil | no success revalidation | Sí | Sí | detalle cliente | `window.location.assign` | `clientes.spec.ts` | SAFE / ALREADY FALLBACK |
| Configuración servicios | `createServiceTypeAction` | `ServiceTypeForm` / create dialog | crear servicio | no success revalidation | Sí | Sí | `/dashboard/configuracion/servicios` | `window.location.assign` | `configuracion-servicios.spec.ts`; gate transversal | SAFE / ALREADY FALLBACK |
| Configuración servicios | `updateServiceTypeAction` | `ServiceTypeForm` / edit dialog | editar/ocultar servicio | no success revalidation | Sí | Sí | servicios | `window.location.assign` | `configuracion-servicios.spec.ts` | SAFE / ALREADY FALLBACK |
| Configuración plantillas | `createTaskTemplateAction` | `TaskTemplateForm` / create dialog | crear plantilla | no success revalidation | Sí | Sí | `/dashboard/configuracion/plantillas` | `window.location.assign` | `task-templates.spec.ts`; gate transversal | SAFE / ALREADY FALLBACK |
| Configuración plantillas | `updateTaskTemplateAction` | `TaskTemplateForm` / edit dialog | editar metadata/estado de plantilla | no success revalidation | Sí | Sí | detalle plantilla | `window.location.assign` | `task-templates.spec.ts` | SAFE / ALREADY FALLBACK — SH-03.2B reproduced |
| Configuración plantillas | `toggleTaskTemplateActiveAction` | sin consumidor runtime/UI actual | toggle de estado | `revalidateTaskTemplateDetail` | Sí | No | N/A | N/A | ninguno | NOT APPLICABLE — no current runtime/UI consumer |
| Tareas de plantilla | create, update, delete y move task actions | `TaskTemplateTaskForm` / `TaskTemplateTasksList` | CRUD y orden de tarea | no success revalidation | Sí | Sí | detalle plantilla | `window.location.assign` | `task-templates.spec.ts` | SAFE / ALREADY FALLBACK |
| Mantenimiento | `runExpiredUploadsCleanupAction` | `ExpiredUploadsCleanupAction` | cleanup de uploads | ninguna | Sí | Sí | mantenimiento | feedback local | `mantenimiento.spec.ts` | NOT APPLICABLE — Storage/PPO-03F, no SH-03.2 mutante |
| Pedidos | `createPedidoAction` | `PedidoForm` / create dialog | crear pedido | no success revalidation | Sí | Sí | `/dashboard/pedidos` | `window.location.assign` | `pedidos.spec.ts`; gate transversal | SAFE / ALREADY FALLBACK |
| Pedidos | `updatePedidoDataAction` | `PedidoEditForm` / edit dialog | editar pedido | no success revalidation | Sí | Sí | detalle pedido | `window.location.assign(canonical href)` | `pedidos-core-selfhosted.spec.ts` | SAFE / ALREADY FALLBACK — SH-03.2D.1 reproduced |
| Pedidos | `startPedidoReviewOnOpenAction` | `AutoReviewOnOpen` | iniciar revisión automática | no success revalidation | resultado directo | No | detalle pedido | `AutoReviewOnOpen` opt-in → `replace(canonical href)` | `pedidos-core-selfhosted.spec.ts` | SAFE / ALREADY FALLBACK — SH-03.2D.1 reproduced |
| Pedidos | `updatePedidoStatusAction` | `PedidoStatusForm` / `StatusFlowPanel` | transición de estado | no success revalidation | Sí | Sí | detalle pedido | `successNavigationHref` opt-in | `pedidos-core-selfhosted.spec.ts` | SAFE / ALREADY FALLBACK — SH-03.2D.1 reproduced |
| Pedidos | `assignPedidoWorkerAction` | `PedidoWorkerAssignmentForm` | asignar trabajador | no success revalidation | Sí | Sí | detalle pedido | `successNavigationHref` compartido | `pedidos-personal-selfhosted.spec.ts` | SAFE / ALREADY FALLBACK — SH-03.2D.2 reproduced |
| Pedidos | `removePedidoWorkerAction` | `PedidoWorkerAssignmentForm` | quitar trabajador | no success revalidation | Sí | Sí | detalle pedido | `successNavigationHref` compartido | `pedidos-personal-selfhosted.spec.ts` | SAFE / ALREADY FALLBACK — SH-03.2D.2 reproduced |
| Pedidos | `createPedidoTaskAction`, `updatePedidoTaskTitleAction`, `updatePedidoTaskProgressAction`, `completePedidoTaskAction`, `reopenPedidoTaskAction`, `deletePedidoTaskAction` | `PedidoTasksSection` / `PedidoTaskItem` | CRUD/progreso de tareas | no success revalidation | Sí | Sí | detalle pedido | `window.location.assign(canonical href)` | `pedidos-tasks-selfhosted.spec.ts` | SAFE / ALREADY FALLBACK — SH-03.2D.3 reproduced, 3/3 independent processes |
| Pedidos | `applyTaskTemplateAction` | `ApplyTaskTemplateForm` / tasks section | aplicar plantilla | no success revalidation | Sí | Sí | detalle pedido | `window.location.assign(canonical href)` | `pedidos-tasks-selfhosted.spec.ts`; `task-templates.spec.ts` | SAFE / ALREADY FALLBACK — SH-03.2D.3 reproduced, 3/3 independent processes |
| Pedidos | `updatePedidoPaymentAction` | `PedidoPaymentForm` / section | registrar pago | no success revalidation | Sí | Sí | detalle pedido | `successNavigationHref` opt-in → `window.location.assign` | `pedidos-payment-comments-selfhosted.spec.ts`; `pedido-edit.spec.ts` | SAFE / ALREADY FALLBACK — SH-03.2D.4 reproduced, PASS 3/3 |
| Pedidos | `createPedidoCommentAction` | `PedidoCommentComposer` | comentario | no success revalidation | Sí | Sí | detalle pedido | `successNavigationHref` opt-in → `window.location.assign` | `pedidos-payment-comments-selfhosted.spec.ts` | SAFE / ALREADY FALLBACK — SH-03.2D.4 reproduced, PASS 3/3 |
| Pedidos archivos | reserve/finalize file actions | upload components | reserva/finalize de archivo | detalle pedido | resultado propio | No | detalle pedido | control de upload | `pedido-upload-direct.spec.ts` | NOT APPLICABLE — SH-03.3 Storage/TUS |
| Solicitudes | `startSolicitudReviewOnOpenAction` | `AutoReviewOnOpen` | iniciar revisión automática | detalle solicitud | resultado directo | No | detalle solicitud | `replace(pathname)` | `solicitudes-core-selfhosted.spec.ts` | SAFE / ALREADY FALLBACK — PASS 3/3 |
| Solicitudes | `associateSolicitudClienteAction` | `SolicitudClienteForm` | asociar cliente | solicitud + cliente | Sí | Sí | detalle solicitud | `assign(pathname)` + guarda específica | `solicitudes-core-selfhosted.spec.ts` | SAFE / ALREADY FALLBACK — PASS 3/3 |
| Solicitudes | `createClienteFromSolicitudAction` | `SolicitudClienteForm` | crear cliente | solicitud + clientes | Sí | Sí | detalle solicitud | `assign(pathname)` | `solicitudes-core-selfhosted.spec.ts` | SAFE / ALREADY FALLBACK — PASS 3/3 |
| Solicitudes | `createSolicitudCommentAction` | `SolicitudCommentComposer` | comentario | detalle solicitud | Sí | Sí | detalle solicitud | `assign(pathname)` | `solicitudes-core-selfhosted.spec.ts` | SAFE / ALREADY FALLBACK — tres comentarios frescos |
| Solicitudes | `updateSolicitudStatusAction` | `SolicitudStatusForm` / `StatusFlowPanel` | transición de estado | dashboard, lista y detalle solicitud | Sí | Sí | detalle solicitud | `successNavigationHref` opt-in | `solicitudes-core-selfhosted.spec.ts` | SAFE / ALREADY FALLBACK — avance, aprobación y rechazo |
| Solicitudes | `convertSolicitudToPedidoAction` | `SolicitudConvertPedidoForm` | conversión a pedido | solicitud, dashboard y pedidos | Sí | Sí | detalle solicitud | `assign(pathname)` | `solicitudes-core-selfhosted.spec.ts` | SAFE / ALREADY FALLBACK — PASS 3/3 |
| Solicitud pública | `startPublicSolicitudAction` sin archivos | `PublicSolicitudForm` | crear solicitud pública | ninguna | resultado propio | No | `/solicitud` | estado local; refresh solo ante servicio invalidado | `public-solicitud.spec.ts` | NOT APPLICABLE — no `ActionState`; gate funcional en SH-03.2C |

`signPublicSolicitudFileAction` y `finalizePublicSolicitudFileAction` no se
incluyen en el total porque su contrato es Storage/TUS de SH-03.3.

## Baseline read-only por Nginx

Se ejecutó `npm run qa:bootstrap:selfhosted`: confirmó runtime self-hosted y
login de admin, supervisor y trabajador sin imprimir credenciales. El runner
usó `http://localhost:8080` y Chromium serial.

| Superficie | Resultado |
| --- | --- |
| Smoke, login y rutas públicas básicas | PASS: 6/6 |
| Dashboard por admin, supervisor y trabajador; rutas denegadas | PASS: 10/10 |
| Shell desktop/móvil y visibilidad por rol | PASS: 3/3; 1 skip legítimo sin workspace de Pedido existente |
| Clientes: listado, búsqueda, detalle, paginación, móvil y roles | PASS: 5/5 |
| Configuración/Servicios: acceso, validación, filtros, URL, móvil y roles | PASS: 5/5 |
| Tracking público, referencia inválida y ausencia de datos sensibles | PASS |
| Solicitud pública no-Storage: catálogo, formulario, validación requerida, desktop y móvil | PASS; no se envió solicitud ni archivo |
| Pedidos/Solicitudes: acceso por rol | PASS: 2/2 |
| Listados operativos: escritorio/móvil, accesibilidad, filtros y overflow | PASS: 11/14 |

Los tres fallos read-only de `internal-listings.spec.ts` son hallazgos de
baseline, no mutaciones ni evidencia TD-NEXT-001: (1) Enter en la búsqueda de
Pedidos no llevó `q=qa` a la URL; (2) dos checks de banda de filtros exigían una
tabla visible aun cuando los filtros activos devolvieron estado vacío. La
captura desktop confirmó el input con `qa` y el listado sin URL filtrada. No se
cambió código ni test en SH-03.2A.

El gate de paginación de Pedidos no pudo ejecutar su resto porque su fixture de
números de pedido no está presente tras bootstrap. El gate de Solicitudes llegó
a su lectura de datos, pero difirió en contrato de URL: espera `service_id=` y
la normalización canónica lo omite (`null`). Ambos se registran como
dependencia de fixture/expectativa de test para el bloque correspondiente; no
se modifican aquí. Tracking válido queda sin ejecutar: no hay fixture pública
estable y esta fase no inventa una por SQL.

La revisión visual autenticada usó Chromium en `1366×768` y `390×844`; la
solicitud pública se inspeccionó en esos mismos viewports. No hubo errores de
página ni exposición de credenciales o datos sensibles en las superficies
comprobadas.

## Corrección SH-03.2A.1 — diferencial de navegación de listados

SH-03.2A.1 modifica solamente `ListingToolbar`, su gate focal y este informe.
No modifica runtime, Compose, Nginx, Dockerfile, Supabase upstream,
migraciones 01–06 ni tipos generados.

El diferencial se ejecutó autenticado como admin, por Nginx en
`http://localhost:8080`, Chromium y con tabla o empty state legítimo como
superficie de resultados. No se usó `page.goto` después de Enter ni después de
seleccionar un filtro.

| Gate | Hallazgo inicial | Resultado final |
| --- | --- | --- |
| Pedidos search | La limpieza quedó en `?q=qa4` en el ciclo 4 | PASS 5/5 |
| Solicitudes search | Sin clasificación antes de reproducir el fallo compartido | PASS 5/5 |
| Clientes search | Consumidor adicional sin cambios de página | PASS 3/3 |
| Pedidos status | Seleccionar `nuevo` no añadió `status` a la URL | PASS 3/3 |
| Solicitudes status | Mismo contrato compartido | PASS 3/3 |

La clasificación inicial es **CASE 3 — search y filters reproducen**. Por
ello, `replaceSearchParams()` aplica el fallback documental común: conserva los
mismos `URLSearchParams`, elimina `page` y navega con
`window.location.replace(targetUrl)`. No introduce `router.push`, `refresh`,
timeouts, nonces ni cache busting. El diferencial final completó **19/19**
ciclos sin errores de página.

TD-NEXT-001 se amplía como compatibilidad temporal, exclusivamente para la
navegación same-route de `ListingToolbar`. No se afirma un bug upstream
confirmado ni se vincula este hallazgo con la causa de Server Actions.

`internal-listings.spec.ts` queda en **14/14 PASS** production-like. El helper
semántico de resultados de Pedidos espera tabla visible o empty state válido;
el test de desplazamiento conserva el límite de una banda compacta, calculado
desde la altura real de la banda más 8 px. El antiguo test de spinner pendiente
se convierte en una comprobación de limpieza canónica mediante navegación
documental real, sin introducir una demora artificial para forzar un frame
pending.

Se reconstruyó y recreó exclusivamente `app`; Nginx no cambió. La imagen final
quedó healthy y el gate completo se ejecutó después del recreate.

La revisión arquitectónica aprobó SH-03.2A y SH-03.2A.1. La sincronización de
TD-NEXT-001 deja trazabilidad source-code sobre cada fallback aprobado y no
modifica su comportamiento. Los handoffs permanecen: fixture de paginación de
Pedido para SH-03.2D; expectativa canónica `service_id` y fixture válido de
tracking para SH-03.2C. Esta fue la entrega de SH-03.2A; SH-03.2B se registra
más abajo como implementada y pendiente de revisión arquitectónica.

## Mapeo de specs y próximos gates

La suite actual contiene **21 specs Playwright**. SH-03.2A reutiliza solamente
gates de lectura y navegación de `smoke`, `dashboard`, `dashboard-shell`,
`clientes`, `configuracion-servicios`, `internal-listings`, `pedidos`,
`solicitudes-internas`, `public-tracking` y `public-solicitud`. No ejecuta
`storage.spec.ts`, `pedido-upload-direct.spec.ts` ni
`public-solicitud-upload-direct.spec.ts`.

| Bloque | Alcance mutante posterior | Fixtures y repetición | Regla TD-NEXT-001 |
| --- | --- | --- | --- |
| SH-03.2B — Clientes + Configuración | editar cliente; editar/ocultar servicio; editar/activar plantilla; CRUD/orden de tareas de plantilla | fixtures QA reversibles; restaurar valores; repetir cada patrón sospechoso según el gate focal | probar patrón actual primero; fallback solo si reproduce |
| SH-03.2C — Solicitudes | asociación/alta de cliente, estados, comentarios, conversión y permiso/tracking derivado; solicitud pública sin Storage | solicitudes/cliente QA aislados y restauración por contrato de dominio | probar patrón actual primero; sumar a TD solo ante reproducción |
| SH-03.2D — Pedidos | edición, workflow/estado, trabajadores, tareas, plantilla, pagos y comentarios | pedido QA aislado; restaurar cambios de perfil/estado cuando aplique; Storage separado | probar patrón actual primero; sumar a TD solo ante reproducción |
| SH-03.2E — Regresión core y handoff | regresión agregada de flujos ya aprobados, dashboard/listados/tracking y cierre de SH-03.2 | fixtures producidas por B/C/D; sin incluir TUS/Storage | confirmar que los fallback existentes siguen acotados |

Al cierre de SH-03.2A, SH-03.2B era el siguiente bloque. Las subfases C, D, E
y SH-03.3 no se iniciaron en ese cierre.

## SH-03.2B — Clientes + Configuración production-like mutation gates

```text
SH-03.2 = ACTIVE
SH-03.2A = CLOSED / APPROVED
SH-03.2B = CLOSED / APPROVED
SH-03.2C = NOT STARTED
SH-03.2D = NOT STARTED
SH-03.2E = NOT STARTED
SH-03.3 = NOT STARTED
```

La ejecución usó admin QA creado por el bootstrap idempotente, Chromium serial
contra Nginx en `http://localhost:8080` y entidades únicas creadas por UI. No
se mutaron `Impresión`, `Otro`, seeds canónicos, usuarios ni datos mediante SQL.

El patrón inicial de Cliente, Servicio, Plantilla y las cuatro acciones de
tareas combinaba revalidación server-side con `ActionState`; Cliente, Servicio,
metadata/status de plantilla mediante `updateTaskTemplateAction` y las acciones
create/update/move/delete de tareas reprodujeron el bloqueo production-like.
El ajuste mínimo aprobado retira únicamente la revalidación
de éxito de cada acción comprobada y, solo tras `state.ok`, navega a su URL
canónica con `window.location.assign()`. Los cinco consumidores contienen el
comentario TD-NEXT-001 inmediato. No se añadieron timeout, nonce, cache busting,
doble refresh ni estado optimista.

| Gate focal | Resultado final |
| --- | --- |
| Cliente: error de nombre, teléfono/notas y lectura fresca | PASS; error mantiene modal y pending se limpia; update 3/3 |
| Servicio QA: descripción y disponibilidad `true → false → true` | PASS; update/availability 3/3 y listado fresco |
| Plantilla QA: metadata/status mediante `updateTaskTemplateAction`, `active → inactive → active` | PASS 3/3; no ejercita `toggleTaskTemplateActiveAction` |
| Tareas QA: create/update/move/delete | Initial pattern `mutate → revalidateTaskTemplateDetail → ActionState`; TD-NEXT-001 reproduced para cada action; final `mutate → ActionState → document navigation after state.ok`; PASS 3/3. Move confirma orden DOM; delete confirma ausencia de tarea. |
| Permisos | PASS; admin opera y supervisor/trabajador quedan bloqueados en Configuración |

La revisión visual autenticada inspeccionó el detalle actualizado de Cliente en
Chromium desktop `1366×768` y móvil `390×844`: la ficha, teléfono/notas frescos,
jerarquía y adaptación móvil se mantuvieron correctos, sin overflow horizontal
ni datos sensibles. No se detectaron errores de página.

Se ejecutaron `lint`, `build`, bootstrap self-hosted y se reconstruyó/recreó
únicamente `app`. `clientes.spec.ts`, `configuracion-servicios.spec.ts` y
`task-templates.spec.ts` contienen los gates focales de regresión. Un test
ajeno de aplicación de plantilla a Pedido sigue pendiente de su bloque SH-03.2D;
no se modificó en esta fase. SH-03.2C es el próximo bloque y no se inicia aquí.

## SH-03.2C — Solicitudes production-like core lifecycle

Estado: `CLOSED / APPROVED`.

| Action | Patrón inicial | Resultado inicial | TD-NEXT | Patrón final | Gate |
| --- | --- | --- | --- | --- | --- |
| `startSolicitudReviewOnOpenAction` | mutate + revalidate | reproducido previamente | Sí | `AutoReviewOnOpen` opt-in → `replace(canonical href)` | PASS 3/3 |
| `associateSolicitudClienteAction` | mutate + revalidate | reproducido previamente | Sí | `assign(pathname)` con guarda específica | PASS 3/3 |
| `createClienteFromSolicitudAction` | mutate + revalidaciones de solicitud/clientes | `pending` sin ActionState | Sí | mutate → ActionState → `assign(pathname)` | PASS 3/3 |
| `createSolicitudCommentAction` | mutate + revalidate | `pending` sin ActionState | Sí | mutate → ActionState → `assign(pathname)` | tres comentarios frescos |
| `updateSolicitudStatusAction` | mutate + revalidate | `en_revision → contactada` bloqueó ActionState | Sí | opt-in de Solicitud → `assign(canonical href)` | avance, aprobación y rechazo PASS |
| `convertSolicitudToPedidoAction` | mutate + revalidate conversión | `pending` sin ActionState | Sí | mutate → pedidoId → `assign(pathname)` | validación + conversión UI PASS 3/3 |

El fallback de estado es opt-in: `StatusFlowPanel` no navega en otros dominios
si no recibe `successNavigationHref`; Pedidos no fue alterado. El fallback de
Al cierre de SH-03.2C, el fallback de auto-review también era opt-in:
Solicitudes pasaba su URL canónica explícita a `AutoReviewOnOpen`, mientras
Pedidos conservaba `router.refresh()` y quedaba `TEST IN SH-03.2D`. D.1
reprodujo ese caso y aplicó el `replace(canonical href)` opt-in aprobado. La ausencia de
`useActionState` no basta para clasificar una action como `NOT APPLICABLE`:
una action de resultado directo con mutación, revalidación y consumidor real
de refresh/navegación requiere evidencia production-like antes de generalizar
un fallo o un fallback. La guarda
`sessionStorage` continúa siendo exclusiva de asociación de cliente, para evitar
su repetición real tras rehidratación; no es un patrón general de TD-NEXT-001.

Evidencia integrada: `solicitudes-core-selfhosted.spec.ts` PASS 9/9,
`solicitudes-internas.spec.ts` PASS 12/12 y regresiones públicas
`public-solicitud.spec.ts` + `public-tracking.spec.ts` PASS 8/8, siempre
Browser → Nginx → Next standalone → Supabase self-hosted.

### Evidencia final de gates funcionales

| Área | Evidencia production-like final |
| --- | --- |
| Public Solicitud | Encargo público sin Storage y auto-review PASS 3/3. |
| Cliente, comentarios y estado | Asociación PASS 3/3; alta PASS 3/3; tres comentarios frescos; avance, aprobación y rechazo frescos. |
| Conversión | Tres Solicitudes públicas independientes completaron cliente, estado y conversión por UI. Tras navegación documental permanecen en el detalle convertido, sin botón duplicado, con `Ver pedido`; el detalle del Pedido identifica el nuevo pedido y no presenta error boundary. |
| Tracking | Referencias creadas por UI: recién creada `Solicitud recibida`, revisión `En revisión`, aprobada `Aprobada`, convertida `Pedido / Solicitud recibida` y rechazada `No aprobada`; sin datos internos ni técnicos. |
| `service_id` | Filtro operativo, chip, selector y limpieza por UI PASS. UUID válido inexistente conserva URL/chip y produce resultado válido vacío; sintaxis inválida conserva URL y warning seguro sin chip. Al combinar inválido con `page=1`, la canonicalización elimina ambos parámetros. Clasificación: PRODUCT CORRECT / TEST STALE; sin cambio de producto. |
| Permisos | Admin: lectura y seis flujos. Supervisor: lectura, Cliente, Comentarios, Estado y Conversión según `solicitudes.manage`. Worker: sin lista, detalle ni triggers por ruta directa; servicios mantienen la defensa de permiso y no exponen errores RLS crudos. |
| Paginación | Evidencia focal: 102 solicitudes y 3 páginas; href correcto, `next/link` FAIL 3/3, navegación documental PASS, ancla nativa Next PASS 5/5 y Previous PASS 5/5. La fixture histórica final acumulada observó 147 solicitudes y 3 páginas; histórico PASS 12/12. |
| Visual | Chromium verificó desktop smoke y móvil 390×844: paneles accionables, confirmación de rechazo, foco, paginación 40×40, sin overflow, spinner infinito, data leak ni error boundary. |

## SH-03.2D.1 — Pedido Edit + Auto-review + Status

Estado del checkpoint: evidencia implementada; `SH-03.2D` permanece `IN PROGRESS`.
No inicia Personal, Tasks/Templates, Payments/Comments, agregación ni Storage.

| Action | Patrón inicial production-like | Resultado inicial | Patrón final | Gate |
| --- | --- | --- | --- | --- |
| `updatePedidoDataAction` | mutate → `revalidatePedidoDetail` → `ActionState`; diálogo → `router.refresh()` | Persistió, pero `ActionState` quedó pending y el diálogo no cerró. | Sin revalidación de éxito; `state.ok` → cerrar → `assign(canonical href)`. | Validación segura y update PASS 3/3; detalle, encabezado e historial frescos. |
| `startPedidoReviewOnOpenAction` | mutate → `revalidatePedidoDetail` → resultado directo; `AutoReviewOnOpen` → `router.refresh()` | Persistió `Creado → En revisión`, pero el detalle quedó obsoleto. | Sin revalidación de éxito; prop opt-in → `replace(canonical href)`. | PASS 3/3; una sola transición de historial por fixture, sin loop ni estado residual. |
| `updatePedidoStatusAction` | mutate → `revalidatePedidoDetail` → `ActionState`; `StatusFlowPanel` sin href. | Persistió `En revisión → En producción`, pero el panel quedó pending. | Sin revalidación de éxito; href canónico opt-in propagado a `StatusFlowPanel`. | Avance y cancelación PASS; badge/detail/historial frescos, mensaje de cerrado y controles retirados. |

El fallback de cada action quedó condicionado a su reproducción propia. Las tres
usan URL canónica explícita y el comentario TD-NEXT-001 inmediato junto a la
llamada `window.location` real; no se añadieron timeout, nonce, `sessionStorage`,
reload ni doble refresh. Las once actions de Pedido restantes continúan `TEST
IN SH-03.2` y no fueron modificadas.

`pedidos-core-selfhosted.spec.ts` PASS 3/3 por Chromium serial a través de
Nginx. La regresión histórica `pedido-edit.spec.ts` actualizó la expectativa
directamente afectada de estado a navegación documental y confirmó los asserts
de D.1; su recorrido posterior alcanza `assignTrabajador`, que pertenece a
SH-03.2D.2 y continúa pendiente, por lo que no se usa como evidencia de D.1.

## SH-03.2D.2 — Personal assignment/removal

Estado del checkpoint: evidencia implementada; `SH-03.2D` permanece `IN PROGRESS`.
No inicia Tasks/Templates, Payments/Comments, agregación ni Storage.

| Action | Patrón inicial production-like | Resultado inicial | Patrón final | Gate |
| --- | --- | --- | --- | --- |
| `assignPedidoWorkerAction` | mutate → `revalidatePedidoDetail` → `ActionState` | La asignación persistió por UI, pero `ActionState` quedó pending. | Sin revalidación de éxito; `state.ok` → `assign(canonical href)`. | Validación del combobox y asignación fresca PASS 3/3; fila y badge visibles. |
| `removePedidoWorkerAction` | mutate → `revalidatePedidoDetail` → `ActionState` | La remoción persistió por UI, pero `ActionState` quedó pending. | Sin revalidación de éxito; `state.ok` → `assign(canonical href)`. | Remoción fresca PASS 3/3; fila y badge ausentes. |

La prop `successNavigationHref` es compartida porque ambos casos se
reprodujeron de forma independiente. El formulario conserva `pedidoId` y solo
este consumidor de Pedido recibe la URL canónica. Cada efecto contiene el
comentario TD-NEXT-001 inmediato junto a `window.location.assign()`; no usa
`router.refresh`, reload, timeout, nonce, `sessionStorage` ni doble refresh.

`pedidos-personal-selfhosted.spec.ts` PASS 1/1 por Chromium serial a través de
Nginx: Encargo con auto-review fresco, validación async, assign/remove 3/3,
Worker asignado con detalle y Personal de solo lectura, y Supervisor con
controles de gestión. Tras remove, el Worker recibe el `notFound()` del segmento
sin título, datos del Pedido ni asignaciones expuestas y sin error técnico/RLS.
La respuesta HTTP observada es 200 porque Next sirve el `not-found.tsx` del
segmento como respuesta streaming; el contrato de acceso es not-found lógico,
no una respuesta no-streaming 404.

La fixture histórica `pedido-edit.spec.ts` reemplazó el selector del primer
trabajador activo por la identidad exacta autenticable de Worker QA: autentica
el cliente QA, obtiene su `auth.user`, valida perfil activo con rol
`trabajador`, devuelve id/nombre y cierra esa sesión. La clasificación anterior
es `STALE / NON-DETERMINISTIC FIXTURE`. Con ello la regresión confirma D.1,
asignación D.2 y acceso positivo del Worker QA; su primer bloqueo posterior es
Pagos (`updatePayment`), perteneciente a D.4, donde falta feedback local tras
la mutación. No se corrigió en este checkpoint.

## SH-03.2D.3 — Pedido Tasks + Task Templates

Estado: `CLOSED / APPROVED`. `SH-03.2D` permanece `IN PROGRESS`; D.4 está en
curso y D.5 no se inició.

| Action | Patrón inicial production-like | Resultado inicial | TD-NEXT | Patrón final | Gate final |
| --- | --- | --- | --- | --- | --- |
| `createPedidoTaskAction` | mutate → `revalidatePedidoDetail` → `ActionState` | Persistía; detalle fresco solo tras navegación diagnóstica. | Sí | sin revalidación; `PedidoTasksSection` → `assign(canonical href)` | PASS 3/3 procesos independientes |
| `updatePedidoTaskTitleAction` | mutate → `revalidatePedidoDetail` → `ActionState` | Igual patrón reproducido. | Sí | sin revalidación; `PedidoTaskItem` → `assign(canonical href)` | PASS 3/3 procesos independientes |
| `updatePedidoTaskProgressAction` | mutate → `revalidatePedidoDetail` → `ActionState` | Igual patrón reproducido. | Sí | sin revalidación; `PedidoTaskItem` → `assign(canonical href)` | PASS 3/3 procesos independientes |
| `completePedidoTaskAction` | mutate → `revalidatePedidoDetail` → `ActionState` | Igual patrón reproducido. | Sí | sin revalidación; `PedidoTaskItem` → `assign(canonical href)` | PASS 3/3 procesos independientes |
| `reopenPedidoTaskAction` | mutate → `revalidatePedidoDetail` → `ActionState` | Igual patrón reproducido. | Sí | sin revalidación; `PedidoTaskItem` → `assign(canonical href)` | PASS 3/3 procesos independientes |
| `deletePedidoTaskAction` | mutate → `revalidatePedidoDetail` → `ActionState` | Igual patrón reproducido. | Sí | sin revalidación; `PedidoTaskItem` → `assign(canonical href)` | PASS 3/3 procesos independientes |
| `applyTaskTemplateAction` | mutate → `revalidatePedidoDetail` → `ActionState` | Igual patrón reproducido. | Sí | sin revalidación; `ApplyTaskTemplateForm` → `assign(canonical href)` | PASS 3/3 procesos independientes |

La evidencia histórica de plantillas queda segmentada por el límite externo de
60 s: los primeros cinco gates terminaron en `3 PASS + 2 SKIP` legítimos por
dataset insuficiente de paginación; el apply aislado pasó `1/1`; no hubo fallo
funcional. La fixture de apply dejó de reutilizar una plantilla CRUD vacía
(`STALE / CROSS-TEST FIXTURE DEPENDENCY`), la apertura temprana de Tareas tras
auto-review quedó clasificada `STALE / RACY FIXTURE`, y la expectativa de
frescura same-document como `STALE EXPECTATION DUE TD-NEXT`; no son deuda nueva.

Gates adicionales por Nginx/Chromium: Encargo auto-revisado bloquea
`En revisión → En producción` con “Agrega al menos una tarea…” y se habilita
tras una tarea, sin ejecutar la transición. El Worker QA exacto, asignado por
el flujo D.2 aprobado, abre el detalle y crea tarea; no recibe Editar pedido.
Supervisor abre y gestiona Tareas. En visual 1366×768 y 390×844 se verificaron
selector de plantilla, tarea cuantificada, foco/Escape de título, confirmación
de delete/Escape, blancos táctiles ≥40 px, sin overflow, spinner residual ni
fuga técnica. Este cierre dejó 29 SAFE, 2 TEST (Pago y Comentario) y 5 N/A.

## SH-03.2D.4 — Payments + Comments

Estado: `CLOSED / APPROVED`. D.5 se entrega para revisión arquitectónica;
Storage no se inicia.

| Action | Initial pattern | Initial result | TD-NEXT | Final pattern | Final gate |
| --- | --- | --- | --- | --- | --- |
| `updatePedidoPaymentAction` | mutate → `revalidatePedidoDetail` → `ActionState` | Persistió `100/0`, pero `ActionState=false`, `pending=true` y el resumen no quedó fresco hasta navegación diagnóstica. | Sí | sin revalidación; `PedidoPaymentForm` recibe href opt-in → `assign(canonical href)` | Validación de exceso; 100/0, 100/100 y 300/200 PASS 3/3, parcial → pagado fresco. |
| `createPedidoCommentAction` | mutate → `revalidatePedidoDetail` → `ActionState` | Persistió comentario, pero `ActionState=false`, `pending=true` y no apareció en documento actual. | Sí | sin revalidación; reset existente y href opt-in → `assign(canonical href)` | Validación trim segura; tres comentarios ordenados, con autor/timestamp PASS 3/3. |

Los roles focales por Nginx confirman: Supervisor ve formulario de pago y
composer; Worker asignado ve el resumen financiero sin inputs/botón de update y
puede crear comentario con su autor/timestamp. `pedido-edit.spec.ts` sustituyó
el feedback local + `page.reload()` por navegación canónica y resumen fresco;
pasó 4/4. Visual Chromium: Pagos desktop 1366×768 y Comentarios móvil 390×844,
sin overflow, spinner residual ni fuga técnica. Inventario final: 31 SAFE, 0
TEST, 5 N/A (36 total).

## SH-03.2D.5 — Aggregate Pedido regression

Estado: `IMPLEMENTED / PENDING ARCHITECTURAL REVIEW`.

| Gate | Resultado production-like |
| --- | --- |
| Historical Storage scope leak | `pedidos.spec.ts` retiró solo `setInputFiles` / upload / estado completado y su contador derivado; mantiene accesibilidad pasiva y hrefs seguros de Archivos. `pedido-upload-direct.spec.ts` conserva el owner de TUS/download/resume en SH-03.3. |
| Histórico Pedidos | PASS `15/15`, `2 SKIP` legítimos. Los helpers esperan navegación documental D.1–D.4 y asignan el Worker QA exacto. |
| Focal D.1–D.4 | PASS: D.1 3/3, D.2 1/1, D.3 4/4, D.4 3/3; `pedido-edit` PASS 4/4. |
| Encargo aggregate | PASS: auto-review, tareas 0, bloqueo de producción, tarea pendiente, producción, bloqueo de ready, tarea completada, ready, bloqueo de entrega por pago, pago, entregado y controles cerrados. |
| Cancelación e Impresión | PASS: cancelación aislada y estado cerrado; Impresión no muestra Tareas, avanza sin ellas y exige pago completo antes de Entregado. |
| Roles/acceso | PASS: Supervisor gestiona paneles; Worker asignado opera tareas/comentario y permanece read-only en pagos/personal; tras remove recibe not-found lógico sin fuga. |
| Listado/tracking | PASS: búsqueda, filtro de Entregado y clear del listado; paginación histórica con seis páginas; `public-tracking.spec.ts` PASS 1/1. |
| Visual | PASS: Chromium/Nginx en 1366×768 y 390×844, sin overflow, clipping, spinner residual ni texto técnico. |

Clasificación documental: `HISTORICAL STORAGE SCOPE LEAK / OUT-OF-SCOPE
HISTORICAL MUTATION`. No hay cambio de producto, Storage, DB, infraestructura
ni nueva deuda TD-NEXT. El inventario queda en 31 SAFE, 0 TEST, 5 N/A (36).
