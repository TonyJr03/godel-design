# SH-03.2A — Inventario core y baseline production-like de solo lectura

## Estado

```text
SH-03.0 = CLOSED / APPROVED
SH-03.1 = CLOSED / APPROVED
SH-03.2 = ACTIVE
SH-03.2A = CLOSED / APPROVED
SH-03.2B = IMPLEMENTED / PENDING ARCHITECTURAL REVIEW
SH-03.2C = NOT STARTED
SH-03.2D = NOT STARTED
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
examinada: 12 `SAFE / ALREADY FALLBACK`, 18 `TEST IN SH-03.2` y 6 `NOT
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
| Configuración plantillas | `updateTaskTemplateAction`, `toggleTaskTemplateActiveAction` | `TaskTemplateForm` / edit dialog | editar/activar plantilla | no success revalidation | Sí | Sí | detalle plantilla | `window.location.assign` | `task-templates.spec.ts` | SAFE / ALREADY FALLBACK |
| Tareas de plantilla | create, update, delete y move task actions | `TaskTemplateTaskForm` / `TaskTemplateTasksList` | CRUD y orden de tarea | no success revalidation | Sí | Sí | detalle plantilla | `window.location.assign` | `task-templates.spec.ts` | SAFE / ALREADY FALLBACK |
| Mantenimiento | `runExpiredUploadsCleanupAction` | `ExpiredUploadsCleanupAction` | cleanup de uploads | ninguna | Sí | Sí | mantenimiento | feedback local | `mantenimiento.spec.ts` | NOT APPLICABLE — Storage/PPO-03F, no SH-03.2 mutante |
| Pedidos | `createPedidoAction` | `PedidoForm` / create dialog | crear pedido | no success revalidation | Sí | Sí | `/dashboard/pedidos` | `window.location.assign` | `pedidos.spec.ts`; gate transversal | SAFE / ALREADY FALLBACK |
| Pedidos | `updatePedidoDataAction` | `PedidoEditForm` / edit dialog | editar pedido | dashboard, lista y detalle pedido | Sí | Sí | detalle pedido | `router.refresh()` | `pedido-edit.spec.ts` | TEST IN SH-03.2 |
| Pedidos | `startPedidoReviewOnOpenAction` | `AutoReviewOnOpen` | iniciar revisión automática | detalle pedido | resultado directo | No | detalle pedido | `router.refresh()` | `pedidos.spec.ts` | NOT APPLICABLE — no `useActionState` |
| Pedidos | `updatePedidoStatusAction` | `PedidoStatusForm` / `StatusFlowPanel` | transición de estado | dashboard, lista y detalle pedido | Sí | Sí | detalle pedido | feedback local | `pedidos.spec.ts` | TEST IN SH-03.2 |
| Pedidos | assign/remove worker actions | `PedidoWorkerAssignmentForm` | asignación de trabajador | dashboard, lista y detalle pedido | Sí | Sí | detalle pedido | feedback local | `pedidos.spec.ts` | TEST IN SH-03.2 |
| Pedidos | create, title, progress, complete, reopen y delete task actions | `PedidoTasksSection` / `PedidoTaskItem` | CRUD/progreso de tareas | dashboard, lista y detalle pedido | Sí | Sí | detalle pedido | feedback local | `pedidos.spec.ts` | TEST IN SH-03.2 |
| Pedidos | `applyTaskTemplateAction` | `ApplyTaskTemplateForm` / tasks section | aplicar plantilla | dashboard, lista y detalle pedido | Sí | Sí | detalle pedido | feedback local | `task-templates.spec.ts`, `pedidos.spec.ts` | TEST IN SH-03.2 |
| Pedidos | `updatePedidoPaymentAction` | `PedidoPaymentForm` / section | registrar pago | dashboard, lista y detalle pedido | Sí | Sí | detalle pedido | feedback local | `pedidos.spec.ts` | TEST IN SH-03.2 |
| Pedidos | `createPedidoCommentAction` | `PedidoCommentComposer` | comentario | dashboard, lista y detalle pedido | Sí | Sí | detalle pedido | feedback local | `pedidos.spec.ts` | TEST IN SH-03.2 |
| Pedidos archivos | reserve/finalize file actions | upload components | reserva/finalize de archivo | detalle pedido | resultado propio | No | detalle pedido | control de upload | `pedido-upload-direct.spec.ts` | NOT APPLICABLE — SH-03.3 Storage/TUS |
| Solicitudes | associate/create-client actions | `SolicitudClienteForm` | asociar o crear cliente | solicitud + clientes | Sí | Sí | detalle solicitud | feedback local | `solicitudes-internas.spec.ts` | TEST IN SH-03.2 |
| Solicitudes | `startSolicitudReviewOnOpenAction` | `AutoReviewOnOpen` | iniciar revisión automática | detalle solicitud | resultado directo | No | detalle solicitud | `router.refresh()` | `solicitudes-internas.spec.ts` | NOT APPLICABLE — no `useActionState` |
| Solicitudes | `updateSolicitudStatusAction` | `SolicitudStatusForm` / `StatusFlowPanel` | transición de estado | dashboard, lista y detalle solicitud | Sí | Sí | detalle solicitud | feedback local | `solicitudes-internas.spec.ts` | TEST IN SH-03.2 |
| Solicitudes | `createSolicitudCommentAction` | `SolicitudCommentComposer` | comentario | dashboard, lista y detalle solicitud | Sí | Sí | detalle solicitud | feedback local | `solicitudes-internas.spec.ts` | TEST IN SH-03.2 |
| Solicitudes | `convertSolicitudToPedidoAction` | `SolicitudConvertPedidoForm` | conversión a pedido | solicitud, dashboard y pedidos | Sí | Sí | detalle solicitud | feedback local | `solicitudes-internas.spec.ts` | TEST IN SH-03.2 |
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
SH-03.2B = IMPLEMENTED / PENDING ARCHITECTURAL REVIEW
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
metadatos/toggle de plantilla y creación de tarea reprodujeron el bloqueo
production-like. El ajuste mínimo aprobado retira únicamente la revalidación
de éxito de cada acción comprobada y, solo tras `state.ok`, navega a su URL
canónica con `window.location.assign()`. Los cinco consumidores contienen el
comentario TD-NEXT-001 inmediato. No se añadieron timeout, nonce, cache busting,
doble refresh ni estado optimista.

| Gate focal | Resultado final |
| --- | --- |
| Cliente: error de nombre, teléfono/notas y lectura fresca | PASS; error mantiene modal y pending se limpia; update 3/3 |
| Servicio QA: descripción y disponibilidad `true → false → true` | PASS; update/availability 3/3 y listado fresco |
| Plantilla QA: metadata y estado `active → inactive → active` | PASS; metadata/toggle 3/3 |
| Tareas QA: tres creates, invalidación, update, move y delete | PASS; create/update/move/delete 3/3 y orden DOM comprobado |
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
