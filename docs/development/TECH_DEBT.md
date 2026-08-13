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
| TD-UPLOAD-001 | Upload/Infraestructura | Alta | Sí, hasta validar la infraestructura o adoptar un flujo adecuado | Activa |
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

> Actualización 2026-08-11: el riesgo de archivos atravesando Next está
> resuelto por PPO-03D/E. TD-UPLOAD-001 permanece activa únicamente por los
> límites transitorios de payload de `next.config.ts` y su gate
> production-like pendiente en PPO-03G.

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

## Deudas activas

### TD-UPLOAD-001 - Estado histórico anterior

- Área: Upload/Infraestructura.
- Severidad: Alta.
- Bloquea producción pública: Sí, hasta validar la infraestructura o adoptar un flujo adecuado.
- Estado: Activa.

La rama interna de Pedidos ya usa reserva/finalize y TUS directo, por lo que no
envía bytes de archivo a Next.js. La rama pública de Solicitudes sigue pasando
por Server Actions; para su límite funcional de hasta cinco archivos de 20 MB,
`next.config.ts` mantiene `serverActions.bodySizeLimit = "110mb"` y
`proxyClientMaxBodySize = "110mb"`.

El compromiso es razonable para MVP y QA local, pero en producción puede causar
presión de memoria, timeouts o incompatibilidad con límites del hosting, proxy o
plataforma de despliegue. Antes de exposición pública debe validarse con la
infraestructura real.

Solución recomendada:

- Completar PPO-03E con upload directo y controlado a Supabase Storage mediante
  TUS presigned para Solicitudes.
- Mantener validaciones de permisos y metadata en servidor.
- No debilitar RLS, grants ni policies de Storage.
- No abrir rutas privadas, `file_path` ni credenciales administrativas al cliente.

Actualización PPO-03E: el upload público directo con TUS presigned ya está
implementado y cubierto por gates E2E; permanece pendiente de revisión/cierre
arquitectónico. La deuda operativa activa continúa por expiración,
reconciliación y la retirada de límites transitorios en PPO-03G.

Seguimiento: PPO-03 inició con el
[contrato de cargas y almacenamiento](../production/PPO_03_UPLOAD_STORAGE_CONTRACT.md).
La rama interna queda resuelta por PPO-03D.1; la deuda continúa activa por
Solicitudes y por la retirada de límites transitorios en PPO-03G.

### TD-UPLOAD-001 - Límites transitorios de payload de Next

- Área: Upload/Infraestructura.
- Severidad: Media.
- Bloquea producción pública: Sí, hasta completar el gate production-like de
  PPO-03G.
- Estado: Activa.

PPO-03D/E resolvieron Browser → Storage directo: los bytes ya no atraviesan
Next, ni para Pedido ni para Solicitudes. El contrato vigente es hasta diez
archivos de 20 MiB por sesión, TUS directo y finalize autoritativo.

La deuda residual es que `next.config.ts` conserva
`serverActions.bodySizeLimit = "110mb"` y `proxyClientMaxBodySize = "110mb"`.
Esos límites son transitorios hasta PPO-03G, que debe demostrar el gate
production-like final y retirarlos o normalizarlos sin reabrir tráfico de bytes
por Next.

No se deben debilitar RLS, grants o policies de Storage ni abrir rutas privadas,
`file_path` o credenciales administrativas al cliente durante ese cierre.

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
Usuario create 3/3; Usuario edit PASS; Auth Admin reset PASS; y una mutación
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
