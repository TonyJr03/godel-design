# Deuda técnica activa

Este es el registro único de deuda técnica viva de Godel Diseño. Contiene
compromisos técnicos aceptados que pueden aumentar mantenimiento, fragilidad,
coste de cambio o riesgo operativo si el proyecto crece. No incluye narrativas
resueltas ni planes históricos completos.

## Criterios

- Deuda técnica: decisión temporal con coste técnico real.
- Bloqueador de producción pública: deuda o riesgo que debe resolverse antes de
  exponer el sistema a tráfico público no controlado.
- Riesgo operativo: condición que puede dificultar soporte, monitoreo o limpieza.
- Trabajo futuro que no es deuda: nueva capacidad de producto o negocio no
  requerida por el alcance actual.

## Resumen

| ID | Área | Severidad | Bloquea producción pública | Estado |
| --- | --- | --- | --- | --- |
| TD-QA-001 | QA | Media | No | Activa |
| TD-QA-002 | QA/Auth | Media | No | Activa |
| TD-QA-003 | QA/Datos | Media | No | Activa |
| TD-QA-004 | QA/Storage | Media | No | Activa |
| TD-TRACKING-001 | Tracking público | Media | No | Activa |
| TD-QA-005 | QA visual | Media | No | Activa |
| TD-NEXT-001 | Next.js/App Router | Media | No | Activa |
| TD-TEMPLATES-001 | Plantillas | Media | No | Activa |
| TD-SECURITY-001 | Seguridad pública | Alta | Sí | Activa |
| TD-STORAGE-002 | Escaneo de archivos | Media | Sí, con volumen de archivos | Activa |
| TD-OBS-001 | Observabilidad | Media | No | Activa |
| TD-DASHBOARD-001 | Métricas dashboard | Baja | No | Activa |
| TD-DB-001 | Contrato RPC impresión | Baja/Media | No | Activa |
| TD-ROUTES-001 | Acceso trabajador a ruta nueva | Baja | No | Activa |

## Bloqueadores antes de producción pública

> Actualización 2026-08-16: TD-UPLOAD-001 fue resuelta por PPO-03G. Los bytes
> de Pedido y Solicitud viajan Browser → Storage por TUS; los overrides Next de
> 110 MB y el límite global Nginx de 110m fueron retirados y validados en el
> runtime self-hosted production-like.

### TD-UPLOAD-001 - Estado histórico superseded

PPO-03D.1 retiró esta ruta para las cargas internas de Pedido: sus bytes viajan
del navegador a Storage por TUS. El flujo público de Solicitudes todavía atraviesa
Server Actions, por lo que `next.config.ts` conserva `110mb` en
`serverActions.bodySizeLimit` y `proxyClientMaxBodySize` hasta PPO-03E/G.

### TD-SECURITY-001 - Protección antiabuso de rutas públicas

Las rutas `/solicitud` y `/estado` no tienen todavía rate limiting, captcha,
honeypot u otra protección antiabuso avanzada. Antes de exposición pública deben
definirse mitigaciones por IP/proveedor, límites de frecuencia y criterio de
auditoría o métricas de intentos fallidos.

### TD-STORAGE-002 - Escaneo de archivos

El MVP valida MIME, extensión, tamaño y permisos, pero no inspecciona contenido
con antivirus ni motor especializado. Antes de producción pública con volumen
real de archivos debe evaluarse escaneo, cuarentena o workflow operativo de
revisión.

Seguimiento: PPO-03 conserva ZIP, RAR y CDR como contenido opaco y no resuelve
el escaneo profundo. Esta deuda continúa activa.

## Deudas resueltas

### TD-UPLOAD-001 - Límites transitorios de payload de Next

- Área: Upload/Infraestructura.
- Severidad histórica: Alta.
- Estado: Resuelta y aprobada arquitectónicamente por PPO-03G el 2026-08-16.

PPO-03D/E ya habían establecido Browser → Storage directo por TUS para
Pedido y Solicitud. PPO-03G retiró `serverActions.bodySizeLimit = "110mb"` y
`proxyClientMaxBodySize = "110mb"` de Next, y sustituyó el
`client_max_body_size 110m` global de Nginx por `1m` para el control plane y
`8m` localizado en `/storage/v1/` para chunks TUS de 6 MiB.

El runtime self-hosted production-like validó un archivo exacto de 20 MiB por
Pedido autenticado y por Solicitud pública signed, con finalize, metadata
committed y descarga funcional. Las Server Actions de upload se mantuvieron por
debajo de 128 KiB; los offsets TUS confirmaron 0/6/12/18/20 MiB. Un POST de 2
MiB hacia `/login` fue rechazado por Nginx con 413, sin volver a abrir los bytes
de archivo hacia Next. RLS, policies, rutas privadas y secretos no cambiaron.

La historia superseded de la deuda se conserva arriba y en los informes de
PPO-02/PPO-03. TD-STORAGE-002, TD-SECURITY-001 y TD-NEXT-001 siguen activas.

## Deudas activas

### TD-QA-001 - Suite e2e paralela no estable

La suite e2e Chromium serial es estable, pero la suite completa en paralelo no
debe usarse todavía como gate de CI. Requiere aislar usuarios, sesiones y datos
mutantes antes de aumentar workers.

### TD-QA-002 - Usuarios QA compartidos

Los specs autenticados usan usuarios compartidos por rol. Esto es suficiente en
serial, pero puede interferir con ejecuciones concurrentes. Evaluar
`storageState` por rol, usuarios por worker o una estrategia mixta.

### TD-QA-003 - Datos QA persistentes y falta de cleanup

Pedidos, solicitudes, plantillas y otros registros QA quedan persistidos después
de tests mutantes. Diseñar seed/cleanup seguro por prefijos QA, con allowlist
estricta y sin borrado genérico agresivo.

El warning histórico del smoke de Cliente en
`server-action-completion-selfhosted.spec.ts` es consistente con esta deuda: el
fixture puede quedar fuera de la primera página por datos QA persistentes y
paginación por nombre. No es una regresión de Next ni de transport limits.

### TD-QA-004 - Fixtures parciales de Storage

Algunos casos de Storage dependen de registros existentes o saltan si no hay
datos adecuados. Crear fixtures estables de objeto y metadata para pedido y
solicitud cuando se endurezca Storage QA.

### TD-TRACKING-001 - Tracking focal con referencia real

El spec focal de `/estado` cubre principalmente referencia inválida; la
referencia válida queda cubierta por full visual QA. Crear fixture focal estable
si evoluciona el contrato público.

### TD-QA-005 - Full visual QA grande

`full-visual-qa.spec.ts` conserva valor como aceptación transversal, pero cubre
varios dominios en un recorrido mutante grande. Extraer flujos hacia specs
focales solo cuando el diagnóstico o mantenimiento empiece a doler.

### TD-NEXT-001 - Compatibilidad de App Router self-hosted

- Área: Next.js / App Router / Server Actions / self-hosted runtime.
- Severidad: Media.
- Bloquea producción pública: No, mientras el fallback documentado siga pasando
  sus gates production-like.
- Estado: Activa.

TD-NEXT-001 cubre tres manifestaciones de compatibilidad App Router bajo el
runtime production-like self-hosted de Godel. El desarrollo histórico con
`next dev` no las reprodujo; el entorno afectado usa Next standalone dentro de
Docker y Nginx. No se afirma un bug upstream confirmado ni que las tres
manifestaciones compartan causa raíz.

**A. Server Actions / éxito de mutaciones.** Las mutaciones de DB/Auth
completan y PostgreSQL/Supabase conservan correctamente sus resultados, pero
`revalidatePath()` junto a un `ActionState` retornado puede dejar pendiente la
respuesta. `refresh()` server-side también reprodujo el bloqueo y
`router.refresh()` cliente no aseguró read-your-writes repetible.

El filesystem read-only fue descartado como cofactor. `proxy_buffering off` en
Nginx es la configuración correcta para streaming de App Router, pero no
resolvió este comportamiento. La navegación documental posterior obtiene el
estado fresco. Esto no afirma un bug confirmado de Next.js ni una causa raíz
upstream conocida.

El workaround temporal aprobado para mutaciones conserva `validate → mutate → return
ActionState`, sin revalidación server-side en los flujos donde el problema fue
demostrado. Ante error, el `ActionState` mantiene el modal abierto con feedback
local. Ante `state.ok`, el cliente cierra el diálogo y navega a la URL canónica
con `window.location.assign()`. No usa timeouts, query nonce, cache busting,
double refresh, SWR, React Query ni mirrors optimistas.

**B. ListingToolbar / navegación same-route.** SH-03.2A.1 reprodujo también
comportamiento no determinista de `router.replace()` tanto en búsqueda como en
filtros. El fallback temporal centralizado conserva `URLSearchParams`
canónicos, elimina `page` y usa `window.location.replace(targetUrl)` para
search, filter y clear, asegurando URL y nuevo server render deterministas. No
usa timeout, nonce, cache busting, `router.refresh` ni doble navegación.

**C. ListingPagination / next-link same-route.** SH-03.2C reprodujo en
Solicitudes que el `href` canónico `/dashboard/solicitudes?page=2` estaba
presente, pero el click de `next/link` no navegaba en el runtime
production-like. La navegación documental al mismo `href` entregó URL,
server render y contenido fresco de página 2. El fallback temporal se aplica
en el límite compartido `ListingPagination`: el control habilitado usa
`<a href>` nativo. No se afirma causa raíz upstream ni que los demás dominios
de listados hayan reproducido el fallo; conservan sus propios gates cuando
dispongan de datasets paginables.

El coste de este fallback es perder transición y prefetch SPA en paginación.
No es la arquitectura final deseada.

Cobertura production-like demostrada:

- Mutaciones: Pedido create PASS 5/5; Servicio, Cliente y Plantilla create
  PASS 3/3 cada uno; Usuario create PASS 3/3; Usuario edit PASS; password reset
  PASS; Auth Admin lifecycle PASS. SH-03.2B añadió Cliente update PASS 3/3;
  Servicio update/disponibilidad PASS 3/3; metadata/status de Plantilla vía
  `updateTaskTemplateAction` PASS
  3/3; y create/update/move/delete de tareas de Plantilla PASS 3/3, siempre
  por Nginx production-like.
- ListingToolbar: Pedidos search PASS 5/5; Solicitudes search PASS 5/5;
  Clientes search PASS 3/3; Pedidos filter PASS 3/3; Solicitudes filter PASS
  3/3; total focal PASS 19/19; `internal-listings` PASS 14/14.

Todo flujo posterior de SH-03.2 que reproduzca el problema y requiera el
fallback debe añadirse al alcance de TD-NEXT-001, cubrirse con gate
production-like y usar navegación documental canónica con el comentario
inmediato sobre la llamada:

```ts
// TD-NEXT-001: fallback temporal para navegación same-route en self-hosted.
```

SH-03.2B añadió los puntos mínimos comprobados: edición de Cliente, edición de
Servicio, metadata/status de Plantilla mediante `updateTaskTemplateAction`,
creación de tarea y acciones inline de update/move/delete de tarea. Sus actions
server-side ya no revalidan en éxito; los consumidores navegan únicamente tras
`state.ok` a la ruta canónica. `toggleTaskTemplateActiveAction` no tiene
consumidor runtime/UI actual y conserva su revalidación: no forma parte de
TD-NEXT-001. Los gates focales viven en `clientes.spec.ts`,
`configuracion-servicios.spec.ts` y `task-templates.spec.ts`.

El coste aceptado es perder navegación SPA en esos success paths y en
búsqueda/filtros de listados: todos realizan una navegación documental completa
con un coste menor de UX/rendimiento. Sesión y permisos permanecen correctos;
se prioriza consistencia/read-your-writes sobre la transición SPA. ESTA NO ES
LA ARQUITECTURA FINAL DESEADA: es un workaround de compatibilidad temporal.
Cada comentario source code TD-NEXT-001 identifica un punto candidato a
eliminación cuando la deuda pueda cerrarse.

Reevaluar TD-NEXT-001 al adoptar una versión estable relevante de Next, ante un
fix upstream confirmado relacionado con App Router/Server Actions, ante una
actualización importante de runtime o antes si la navegación documental genera
coste funcional real. No actualizar a preview/canary de Next únicamente para
cerrar esta deuda.

La deuda solo podrá resolverse con evidencia production-like sin navegación
documental. Para mutaciones: Pedido create 5/5; Servicio, Cliente, Plantilla y
Usuario create 3/3; Usuario edit PASS; Auth Admin reset PASS; las acciones D.1
(edit, auto-review, status), D.2 (assign/remove), D.3 (las siete actions de
tareas/plantilla) y D.4 (`updatePedidoPaymentAction` y
`createPedidoCommentAction`) deben demostrar su propio caso sin fallback; y una mutación
representativa de detalle 3/3. Todos deben completar `ActionState`, limpiar
`pending`, no colgarse y demostrar frescura same-route/read-your-writes sin
`window.location.assign()`.

Para listados: Pedidos search 5/5; Solicitudes search 5/5; Clientes search
3/3; Pedidos filter 3/3; Solicitudes filter 3/3. Todos deben usar navegación
SPA/App Router normal, producir URL y `searchParams` server-side correctos,
input/chip correctos y tabla o empty state válido, sin
`window.location.replace()`. Solo entonces se retiran los fallbacks y sus
comentarios TD-NEXT-001 asociados.

Para retirar el fallback de `ListingPagination`, Solicitudes debe demostrar
next 5/5 y previous 5/5 con navegación SPA/App Router normal, URL y
`searchParams` correctos, contenido de página fresco y sin imponer el enlace
documental nativo. Cuando Pedidos y los demás dominios dispongan de fixtures
paginables, sus gates ampliarán la evidencia sin bloquear este diagnóstico.

Los gates de retirada para Solicitudes exigen auto-review, asociación de
cliente, alta de cliente, comentarios, estado y conversión 3/3; y para
`ListingPagination`, Next 5/5 y Previous 5/5. La retirada requiere frescura
same-route correcta sin `window.location` documental, sin enlace nativo
impuesto por TD-NEXT y con `ActionState` completo cuando aplique.

### TD-TEMPLATES-001 - Operaciones secuenciales en tareas de plantilla

Crear, eliminar y reordenar tareas de plantilla usa varias operaciones
secuenciales. Evaluar una RPC transaccional si aparecen concurrencia,
inconsistencias de orden o errores intermedios reales.

### TD-OBS-001 - Observabilidad operativa limitada

Logs, métricas, alertas y monitoreo agregado son limitados. Antes de
preproducción conviene definir logs estructurados, métricas clave, alertas,
monitoreo de errores y seguimiento de Storage/jobs.

### TD-DASHBOARD-001 - Métrica de pedidos sin tareas

El dashboard genérico puede mezclar encargos e impresiones en indicadores donde
la ausencia de tareas solo bloquea a encargos. Filtrar por `workflow_type =
encargo` o reformular la métrica antes de usarla como indicador estricto.

### TD-DB-001 - Contrato DB de conversión de impresión

La aplicación normaliza título y descripción de solicitudes de impresión antes
de llamar a `convertir_solicitud_a_pedido`, pero la RPC exige esos campos no
vacíos. Decidir si el fallback debe seguir solo en aplicación o reforzarse en el
contrato transaccional.

### TD-ROUTES-001 - Respuesta de trabajador en `/dashboard/pedidos/nuevo`

Un trabajador puede recibir 200 en la ruta de nuevo pedido, aunque la pantalla
muestra falta de permiso y no expone formulario. La operación está bloqueada por
UI, action y servicio. Evaluar si conviene redirección o pantalla unificada de
acceso denegado.

### TD-NEXT-001 — SH-03.2D.3 / tareas y plantillas de Pedido

Las siete actions de D.3 persistían, pero el detalle sólo quedaba fresco tras
navegación diagnóstica con `revalidatePedidoDetail(pedidoId)`. Se retiró esa
revalidación exclusivamente de `createPedidoTaskAction`,
`updatePedidoTaskTitleAction`, `updatePedidoTaskProgressAction`,
`completePedidoTaskAction`, `reopenPedidoTaskAction`, `deletePedidoTaskAction`
y `applyTaskTemplateAction`. Cada una se reprodujo y pasó 3/3 en tres procesos
Playwright independientes por Nginx. Sus consumidores concretos navegan tras
`state.ok` al detalle canónico; no se aplicó fallback a pagos, comentarios,
Storage ni acciones D.1/D.2. No hubo timeout, reload, `router.refresh`, nonce
ni estado optimista. La deuda sigue abierta hasta que D.1, D.2 y D.3 satisfagan
sus gates de retirada sin fallback documental.

### TD-NEXT-001 — SH-03.2D.4 / pagos y comentarios de Pedido

`updatePedidoPaymentAction` y `createPedidoCommentAction` se reprodujeron por
separado: ambas persistieron bajo Nginx, pero `ActionState` no completó, dejó
pending y el detalle quedó obsoleto hasta navegación diagnóstica. Se retiró
únicamente `revalidatePedidoDetail(pedidoId)` de cada success path. La página
entrega su href canónico explícito a `PedidoPaymentSection`/`PedidoPaymentForm`
y a `PedidoCommentComposer`; tras `state.ok` usan `window.location.assign()`
con el comentario TD-NEXT-001 inmediato. El reset del compositor se conserva.

Pago pasó validación segura y tres updates independientes 100/0, 100/100 y
300/200 hasta `pagado`; Comentarios pasó validación trim y tres comentarios
frescos con orden ascendente, autor y timestamp. No se aplicó fallback a D.5,
Storage ni otra action. La deuda continúa activa hasta que los gates D.1–D.4
demuestren read-your-writes sin navegación documental.

### TD-NEXT-001 — SH-03.3B / finalize de Storage de Pedido

El TUS authenticated de Pedido completó bajo Nginx y
`finalizePedidoFileAction` persistió: una navegación diagnóstica canónica
mostró metadata committed y enlace de descarga. Sin embargo, el completion
local seguido de `router.refresh()` dejó la lista stale. La manifestación queda
acotada al success path `finalizePedidoFileAction` / `PedidoFileUploadForm`; no
hay evidencia de afectación en reserve ni en los flujos públicos.

Se retiró exclusivamente `revalidatePedidoDetail(pedidoId)` del éxito de
finalize. La cola conserva completion local de todos los ítems y navega una vez
al href canónico recibido mediante `window.location.assign()` sólo cuando el
batch queda completamente exitoso, con el comentario TD-NEXT-001 inmediato. Un
batch parcial conserva retry e ítems completed; el retry navega únicamente si
completa el último pendiente. No se añadieron timeout, nonce, `sessionStorage`,
doble refresh ni estado optimista.

El gate 7 MiB pasó 3/3 por procesos independientes bajo Nginx; también pasaron
resume, batch con concurrencia dos, partial batch con retry del mismo recurso,
sesión invalidada, límites y cancelación. La retirada exige que ese conjunto
demuestre metadata/list/download fresco sin navegación documental.
Worker/list/download deliberadamente queda para SH-03.3D, que necesita su
fixture de asignación.

## Riesgos operativos

### TD-NEXT-001 — Extensión SH-03.2C

SH-03.2C cubre seis actions de Solicitudes: `startSolicitudReviewOnOpenAction`,
`associateSolicitudClienteAction`, `createClienteFromSolicitudAction`,
`createSolicitudCommentAction`, `updateSolicitudStatusAction` y
`convertSolicitudToPedidoAction`. Auto-review usa `replace(current pathname)`;
la asociación usa `assign(pathname)` y una guarda `sessionStorage` anti-repeat
exclusiva de ese caso; alta de cliente, comentarios y conversión usan
`assign(pathname)` tras éxito. Estado usa `successNavigationHref` opt-in, sin
afectar el consumidor de Pedidos. Cada fallback conserva el comentario source
TD-NEXT-001 inmediato. Los gates self-hosted demostraron auto-review y
asociación 3/3, alta de cliente 3/3, tres comentarios frescos, estado
avance/aprobación/rechazo y conversión UI 3/3. La guarda `sessionStorage` de
asociación no es un patrón general y debe retirarse junto con ese fallback.

### TD-NEXT-001 — SH-03.2D.1 — Edit / Auto-review / Status de Pedido

`startPedidoReviewOnOpenAction` reprodujo el patrón de compatibilidad de forma
aislada: `ensurePedidoReviewStarted` persistió `creado → en_revision`, pero el
resultado directo seguido por `AutoReviewOnOpen → router.refresh()` no entregó
el detalle fresco por Nginx. Se retiró únicamente
`revalidatePedidoDetail(pedidoId)` del success path de esa action. La página de
Pedido entrega de forma explícita su URL canónica a `AutoReviewOnOpen`; el
componente compartido ejecuta su `replace()` opt-in y conserva el comentario
TD-NEXT-001 inmediato junto a la llamada real.

`updatePedidoDataAction` también reprodujo de forma independiente: la mutación
persistió, pero `ActionState` dejó el diálogo en pending. Se retiró únicamente
su `revalidatePedidoDetail(pedidoId)` de éxito. Tras `state.ok`,
`PedidoEditDialogButton` limpia su estado, cierra el diálogo y usa
`window.location.assign()` a la URL canónica con el comentario TD-NEXT-001
inmediato. No se añadieron timeout, nonce, sessionStorage, doble refresh ni
fallback a otras actions de Pedido.

Este registro cubre solo `startPedidoReviewOnOpenAction` y
`updatePedidoDataAction`. `updatePedidoStatusAction` también persistió su
transición, pero dejó el `StatusFlowPanel` en pending y sin detalle fresco. Se
retiró únicamente su `revalidatePedidoDetail(pedidoId)` de éxito;
`PedidoStatusForm` recibe un `successNavigationHref` opcional y la página de
Pedido entrega la URL canónica. `StatusFlowPanel` ya contiene el fallback
opt-in y su comentario TD-NEXT-001 inmediato, sin cambiar otros consumidores.
Los gates por Nginx demostraron edición 3/3, auto-review 3/3 y avance/cancelación
de estado; las demás actions de Pedido permanecen fuera de D.1.

### TD-NEXT-001 — SH-03.2D.2 / asignar personal de Pedido

`assignPedidoWorkerAction` reprodujo de forma independiente: la asignación
persistió por UI, pero `ActionState` quedó pending con
`revalidatePedidoDetail(pedidoId)` en el success path. Se retiró únicamente esa
revalidación. Tras `assignState.ok`, `PedidoWorkerAssignmentForm` navega a la
URL canónica recibida mediante `window.location.assign()` con el comentario
TD-NEXT-001 inmediato. El gate self-hosted validó assign 3/3, fila y badge
frescos, sin timeout, nonce, `sessionStorage`, reload ni doble refresh.

### TD-NEXT-001 — SH-03.2D.2 / quitar personal de Pedido

`removePedidoWorkerAction` reprodujo de forma independiente: la remoción
persistió por UI, pero `ActionState` quedó pending con
`revalidatePedidoDetail(pedidoId)` en el success path. Se retiró únicamente esa
revalidación. Tras `removeState.ok`, el mismo consumidor navega a su URL
canónica mediante `window.location.assign()` con el comentario TD-NEXT-001
inmediato. El gate self-hosted validó remove 3/3, fila y badge ausentes, sin
timeout, nonce, `sessionStorage`, reload ni doble refresh.

- Drift entre permisos TypeScript, RLS y RPCs.
- Cambios en `workflow_type` sin coordinar Pedidos, Dashboard, templates y QA.
- Reintroducir Supabase en Client Components.
- Crear `src/services` duplicando `src/lib`.
- Exponer rows, errores crudos, `file_path`, bucket o signed URLs en superficies cliente.
- Mover reglas críticas a UI o Server Actions sin defensa server-side/RLS.
- Editar tipos generados o migraciones históricas sin fase explícita.

## Trabajo futuro que no es deuda técnica

- Catálogo comercial.
- Tienda online.
- Carrito.
- Pagos online.
- Nuevas funcionalidades comerciales.
- Nuevas métricas de negocio.
- Reportes avanzados.
- Notificaciones reales.
- Panel de cliente.
- Normalización detallada de atributos de impresión sin necesidad real de búsqueda,
  cotización, automatización o métricas.
- Movimientos financieros, comprobantes y cierre de caja si el negocio lo requiere.

## Política de actualización

- Cada deuda debe tener ID estable.
- No agregar trabajo funcional futuro como deuda técnica.
- Actualizar severidad si cambia el contexto.
- Registrar el documento o commit donde se resuelva.
- Revisar este registro al cerrar cada beta o fase de preproducción.

## Contexto histórico

- [BETA_2_TECHNICAL_DEBT.md](../archive/beta-2-architecture/BETA_2_TECHNICAL_DEBT.md)
- [TECHNICAL_AUDIT.md](../archive/initial-development/TECHNICAL_AUDIT.md)
