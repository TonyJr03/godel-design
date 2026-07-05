# Beta 2.0 - Auditoria integral del codigo

## 1. Objetivo

Esta auditoria revisa la arquitectura actual del codigo de aplicacion de Godel Diseno despues del cierre de Beta 1. El objetivo es diagnosticar organizacion, responsabilidades, riesgos y oportunidades de consolidacion para ordenar Beta 2 sin refactorizar todavia.

Alcance revisado:

- `src/app/`
- `src/components/`
- `src/lib/`
- `src/types/`
- `supabase/migrations/`
- `tests/e2e/`
- `scripts/`
- `docs/`
- `.codex/skills/`
- `package.json`
- `playwright.config.ts`
- `src/proxy.ts` y `src/lib/supabase/proxy.ts`

No se modifico codigo funcional, UI, migraciones ni tipos generados. La unica modificacion prevista para esta subfase es este documento.

## 2. Estado general del proyecto

El proyecto esta en buen estado arquitectonico para seguir consolidando. La estructura actual muestra una separacion clara entre rutas App Router, componentes, servicios de dominio en `src/lib`, tipos, migraciones consolidadas, scripts de auditoria y documentacion funcional.

Que esta bien:

- `src/app` usa App Router con Server Components por defecto, Server Actions por ruta y Route Handlers para descargas controladas.
- `src/lib/<dominio>` ya funciona como capa real de servicios de dominio.
- Los componentes cliente no consultan Supabase directamente; la busqueda encontrada no mostro `createClient()` ni `supabase` operativo en `src/components`.
- Las operaciones criticas estan respaldadas por RPCs, RLS y policies de Storage.
- `proxy.ts` centraliza proteccion de dashboard con reglas por rol mediante `canAccessDashboardRoute`.
- La documentacion estable esta mucho mas alineada que en auditorias previas.
- `src/services` ya no existe, por lo que la deuda antigua de placeholders quedo resuelta.

Que esta en riesgo:

- Algunas Server Actions siguen siendo demasiado grandes como superficie de mantenimiento, especialmente `src/app/dashboard/pedidos/[id]/actions.ts` con 457 lineas.
- Hay servicios de dominio muy densos: `list-internal-pedidos.ts`, dashboard activity/work-items, conversion de solicitud a pedido, validacion de pedidos y mutaciones de tareas/pagos.
- Los wrappers manuales de RPC con `as unknown as ...RpcClient` se repiten en varios dominios.
- Hay patrones similares de formularios, tabs de `workflow_type`, estados de action, errores, revalidaciones y mensajes repetidos.
- `tests/e2e/full-visual-qa.spec.ts` funciona como prueba de cierre, pero concentra demasiados flujos en un unico spec serial.
- La fecha fija `2026-12-18` del full visual QA es futura al 28 de junio de 2026, pero se volvera fragil despues de esa fecha.

Que debe consolidarse:

- Estructura interna formal de `src/lib/<dominio>`.
- Helpers transversales para actions, revalidaciones, RPCs, mappers, labels y errores.
- Subcomponentes de formularios grandes sin cambiar diseno ni comportamiento.
- Tests e2e por dominio, conservando un recorrido completo de aceptacion.
- Documentacion de desarrollo obsoleta, especialmente auditorias historicas que ya no reflejan el estado actual.

Que no conviene tocar:

- No conviene reescribir la app ni mover todo a otra carpeta por nombre.
- No conviene tocar migraciones ni RLS en esta subfase.
- No conviene cambiar reglas de negocio durante Beta 2.0.
- No conviene introducir dependencias nuevas para validacion antes de agotar consolidacion de helpers propios.

## 3. Mapa actual de arquitectura

### `src/app`

Contiene rutas App Router, layouts, pages, Server Actions y Route Handlers.

Puntos relevantes:

- `src/proxy.ts` existe y delega en `src/lib/supabase/proxy.ts`.
- Las rutas publicas principales son `/solicitud` y `/estado`.
- Las rutas internas viven bajo `/dashboard`.
- Las props dinamicas revisadas usan el modelo de Next moderno con `params` o `searchParams` como promesas.
- `src/app/dashboard/pedidos/[id]/page.tsx` compone muchos loaders y secciones del detalle de pedido.
- Las actions por dominio estan cerca de sus rutas, lo cual ayuda a ubicar el flujo.

Actions mas grandes:

| Archivo | Lineas | Observacion |
|---|---:|---|
| `src/app/dashboard/pedidos/[id]/actions.ts` | 457 | Muchas actions, tipos de estado, mensajes y revalidaciones en un solo archivo. |
| `src/app/dashboard/solicitudes/[id]/actions.ts` | 197 | Correcta, pero comparte patrones con pedidos. |
| `src/app/solicitud/actions.ts` | 171 | Maneja `FormData`, validacion previa de archivos y orquestacion de upload. |
| `src/app/dashboard/configuracion/plantillas/[templateId]/actions.ts` | 136 | Mutaciones de tareas de plantilla concentradas. |
| `src/app/login/actions.ts` | 125 | Login/logout y validacion de perfil. |

### `src/components`

Organizado por dominios y UI comun:

- `auth`
- `clientes`
- `common`
- `configuracion`
- `dashboard`
- `layout`
- `pedidos`
- `solicitudes`
- `storage`
- `tracking`
- `ui`
- `usuarios`

Los componentes cliente tienen interactividad real: formularios, filtros, tabs, uploads, botones de copia y actions. No se encontro consulta directa a Supabase desde componentes.

Componentes mas grandes:

| Archivo | Lineas | Observacion |
|---|---:|---|
| `src/components/solicitudes/PublicSolicitudForm.tsx` | 599 | Formulario publico completo con tabs, validaciones visibles, archivos y exito. |
| `src/components/pedidos/PedidoForm.tsx` | 504 | Muy parecido a partes de `PublicSolicitudForm`; candidato a subcomponentes. |
| `src/components/solicitudes/SolicitudConvertPedidoForm.tsx` | 356 | Flujo de conversion con reglas por `workflow_type`. |
| `src/components/pedidos/InternalPedidosList.tsx` | 348 | Listado responsive con filtros y datos agregados. |
| `src/components/pedidos/InternalPedidoDetail.tsx` | 326 | Render complejo del detalle y secciones inyectadas. |

### `src/lib`

Es la capa real de backend de aplicacion. Contiene:

- `auth`
- `clientes`
- `dashboard`
- `format`
- `pedidos`
- `permissions`
- `public-tracking`
- `solicitudes`
- `storage`
- `supabase`
- `task-templates`
- `usuarios`
- `utils`
- `validators`
- `workflow-types.ts`
- `service-results.ts`

Los servicios combinan validacion, permisos, DTOs, queries Supabase, RPCs y mapeos.

Archivos de mayor complejidad:

| Archivo | Lineas | Observacion |
|---|---:|---|
| `src/lib/pedidos/list-internal-pedidos.ts` | 461 | Busqueda por varias relaciones, filtros, pagos y progreso de tareas. |
| `src/lib/dashboard/get-dashboard-activity.ts` | 349 | Mapeo de metadata de historial a textos seguros. |
| `src/lib/dashboard/get-dashboard-work-items.ts` | 336 | Ranking operativo y progreso agregado. |
| `src/lib/pedidos/create-pedido-from-solicitud.ts` | 327 | Validacion, fallback de impresion, permisos y RPC transaccional. |
| `src/lib/pedidos/order-validation.ts` | 326 | Validaciones de pedido manual y datos de impresion. |
| `src/lib/pedidos/update-pedido-task.ts` | 310 | Mutacion compleja de tareas y progreso. |
| `src/lib/pedidos/update-pedido-payment.ts` | 303 | Validacion financiera y RPC de pago. |

### `src/types`

Contiene tipos por dominio y `src/types/database.types.ts`. No se modifico. La arquitectura usa tipos generados como fuente de verdad para tablas/enums/RPCs, y encima define DTOs de dominio en `src/lib` y `src/types`.

### `supabase/migrations`

Beta 1 dejo cinco migraciones consolidadas:

| Archivo | Lineas | Rol |
|---|---:|---|
| `20260625000100_01_core_schema.sql` | 1379 | Schema, enums, triggers, historial base y funciones privadas. |
| `20260625000200_02_security_rls_grants.sql` | 910 | RLS, grants y policies base. |
| `20260625000300_03_business_rpcs.sql` | 1254 | RPCs transaccionales de negocio. |
| `20260625000400_04_storage.sql` | 569 | Bucket privado, helpers y policies de Storage. |
| `20260625000500_05_final_hardening.sql` | 403 | Revokes/grants finales y checks defensivos. |

No se detecta necesidad de tocar migraciones en Beta 2.0. Cualquier cambio futuro de DB debe ir en migracion nueva.

### `tests/e2e`

Contiene:

- `smoke.spec.ts` con 52 lineas.
- `full-visual-qa.spec.ts` con 434 lineas.
- `fixtures/sample-print-request.pdf`.

El smoke cubre carga basica de paginas publicas/login y login admin si hay credenciales. El full visual QA cubre solicitud publica, tracking, login, roles, conversion, pedidos, tareas, pagos, Storage y permisos en un recorrido serial.

### `scripts`

Scripts de auditoria:

- `audit-security.mjs`
- `audit-client-supabase.mjs`
- `audit-public-tracking.mjs`

Son utiles y simples. Sus coincidencias deben interpretarse porque incluyen referencias documentales esperadas.

### `docs`

La documentacion estable esta amplia y relativamente alineada con el codigo:

- Modelo de datos.
- Permisos.
- Storage.
- Flujos publicos e internos.
- Clientes.
- Pedidos.
- Usuarios.
- Dashboard.
- Comentarios e historial.
- Convenciones UI/UX.

La carpeta `docs/development` conserva documentos historicos. `docs/development/TECHNICAL_AUDIT.md` ya contiene informacion obsoleta sobre `src/services`; debe tratarse como historico, no como fuente vigente.

## 4. Evaluacion de capas

### 4.1 App Router y rutas

Las rutas estan bien agrupadas y el proyecto usa convenciones modernas de App Router. La guia local de Next revisada confirma que `params` y `searchParams` son promesas; el codigo revisado sigue ese patron en paginas y route handlers dinamicos.

Las pages son mayormente Server Components. Cargan datos server-side y pasan DTOs a componentes visuales. Esto respeta la regla de no consultar Supabase desde Client Components.

Los Route Handlers de descarga:

- `src/app/dashboard/pedidos/[id]/archivos/[fileId]/download/route.ts`
- `src/app/dashboard/solicitudes/[id]/archivos/[fileId]/download/route.ts`

validan UUIDs, pertenencia del archivo y generan URL firmada mediante `createSignedFileUrl`. El `file_path` se consulta solo server-side. Hay duplicacion manejable entre ambos handlers.

Server Actions:

- Estan en archivos cercanos a la ruta.
- Delegan la logica importante a `src/lib`.
- Usan `getFormValue`.
- Revalidan rutas manualmente.
- Devuelven estados de UI controlados.

Riesgo principal: las actions de detalle de pedido estan demasiado concentradas. No parecen contener reglas de dominio fuertes, pero si mucha adaptacion repetida.

### 4.2 Componentes

La capa de componentes esta bien organizada por dominio. Los componentes `ui` cubren primitives reutilizables como `Button`, `Input`, `Select`, `Textarea`, `Card`, `DetailPanel`, `MetadataGrid`, `StatusBadge` y `PageHeader`.

Puntos fuertes:

- No hay Supabase directo en componentes.
- Los formularios usan Server Actions.
- Los listados cliente solo sincronizan URL y estado visual.
- `ListFiltersBar` centraliza busqueda/filtros.
- Se mantiene un lenguaje operativo consistente.

Riesgos:

- `PublicSolicitudForm` y `PedidoForm` duplican tabs de `workflow_type`, campos de impresion y manejo de action state.
- `InternalPedidoDetail` recibe muchas secciones como props y tambien formatea metadata, enlaces y paneles.
- Algunos componentes de historial construyen summaries desde metadata; dashboard activity hace una tarea similar en `src/lib/dashboard/get-dashboard-activity.ts`.

Recomendacion: extraer subcomponentes y formatters puros por dominio, sin redisenar UI.

### 4.3 `src/lib`

`src/lib` funciona hoy como capa de servicios de dominio. Es la carpeta correcta para mantener logica server-side, consultas, mutaciones, validaciones, mappers y wrappers de RPC, siempre que se formalice su estructura interna.

Respuesta explicita:

- Si, esta bien mantener `src/lib`.
- No conviene crear `src/services` solo por nombre.
- Mover todo a `src/services` tendria alto costo mecanico, riesgo de imports rotos y duplicaria responsabilidades existentes.
- La alternativa mas limpia es formalizar `src/lib/<dominio>` con archivos de `types`, `validation`, `labels`, `queries`, `mutations`, `mappers` y `rpc` cuando el dominio lo necesite.

`src/lib` ya contiene buenas bases transversales:

- `src/lib/service-results.ts`
- `src/lib/validators/*`
- `src/lib/utils/*`
- `src/lib/permissions/*`
- `src/lib/supabase/*`

Lo que falta no es una carpeta nueva, sino una convencion interna mas explicita.

### 4.4 Dominio Pedidos

Es el dominio mas complejo del proyecto.

Servicios revisados relevantes:

- `src/lib/pedidos/list-internal-pedidos.ts`
- `src/lib/pedidos/get-internal-pedido-by-id.ts`
- `src/lib/pedidos/create-internal-pedido.ts`
- `src/lib/pedidos/create-pedido-from-solicitud.ts`
- `src/lib/pedidos/update-internal-pedido-status.ts`
- `src/lib/pedidos/update-pedido-payment.ts`
- `src/lib/pedidos/create-pedido-task.ts`
- `src/lib/pedidos/update-pedido-task.ts`
- `src/lib/pedidos/delete-pedido-task.ts`
- `src/lib/pedidos/list-pedido-comments.ts`
- `src/lib/pedidos/list-pedido-history.ts`
- `src/lib/pedidos/assign-internal-pedido-worker.ts`
- `src/lib/pedidos/remove-internal-pedido-worker.ts`

Lo bueno:

- Las reglas criticas de estado y pagos pasan por RPCs.
- La UI no decide sola transiciones criticas.
- Los trabajadores dependen de RLS/asignaciones.
- Las tareas tienen validadores y calculo de progreso.
- La creacion manual usa RPC transaccional.
- La conversion desde solicitud usa RPC transaccional y valida permisos.

Complejidad:

- `list-internal-pedidos.ts` mezcla filtros, busqueda relacional, pagos y progreso.
- `create-pedido-from-solicitud.ts` concentra fallback de impresion, validacion y mapeo de errores RPC.
- `update-pedido-payment.ts` y `update-pedido-task.ts` son correctos pero densos.
- `src/app/dashboard/pedidos/[id]/actions.ts` concentra muchas mutaciones en un archivo.
- Hay casts manuales de RPC y safe error mappings repetidos.

Recomendacion: consolidar Pedidos en una subfase propia, separando queries, mutations, validation, mappers y rpc wrappers.

### 4.5 Dominio Solicitudes

Servicios revisados relevantes:

- `src/lib/solicitudes/create-public-solicitud.ts`
- `src/lib/solicitudes/public-request-validation.ts`
- `src/lib/solicitudes/list-internal-solicitudes.ts`
- `src/lib/solicitudes/get-internal-solicitud-by-id.ts`
- `src/lib/solicitudes/update-internal-solicitud-status.ts`
- `src/lib/solicitudes/create-cliente-from-solicitud.ts`
- `src/lib/solicitudes/associate-solicitud-cliente.ts`
- `src/lib/solicitudes/list-solicitud-comments.ts`
- `src/lib/solicitudes/list-solicitud-history.ts`

Lo bueno:

- El flujo publico valida server-side.
- La impresion no confia en descripcion oculta del cliente; se construye server-side.
- El tracking publico usa RPC controlada y DTO minimo.
- La conversion a pedido conserva `workflow_type` desde la solicitud.
- Comentarios/historial son internos.

Riesgos:

- `public-request-validation.ts` es denso y comparte conceptos con `pedidos/order-validation.ts`.
- `src/app/solicitud/actions.ts` mezcla validacion previa de archivos con creacion y subida; es aceptable por ahora, pero debe mantenerse vigilado.
- `list-solicitud-history.ts` hace enriquecimiento con metadata, clientes y pedidos; conviene formalizar mappers de historial.

### 4.6 Clientes

El dominio Clientes esta bien contenido.

Archivos relevantes:

- `src/lib/clientes/create-internal-cliente.ts`
- `src/lib/clientes/update-internal-cliente.ts`
- `src/lib/clientes/list-internal-clientes.ts`
- `src/lib/clientes/get-internal-cliente-by-id.ts`
- `src/lib/clientes/client-validation.ts`

Lo bueno:

- CRUD actual limitado a crear, listar, detalle y editar.
- Validaciones server-side claras.
- No hay eliminacion prematura.
- La creacion desde solicitud vive en `src/lib/solicitudes` porque la autoridad del flujo es la solicitud.

Riesgos bajos:

- Patrones de create/update/list/detail son similares a usuarios y task templates; se podrian uniformar action states y revalidaciones.

### 4.7 Usuarios, perfiles y permisos

Archivos relevantes:

- `src/lib/auth/current-user.ts`
- `src/lib/usuarios/*`
- `src/lib/permissions/permissions.ts`
- `src/lib/permissions/routes.ts`
- `src/lib/supabase/proxy.ts`

Lo bueno:

- La app gestiona `public.perfiles`, no `auth.users`.
- No hay `service_role`.
- `canAccessDashboardRoute` centraliza reglas de ruta.
- El proxy valida sesion, perfil activo y permisos por seccion.
- Servicios de usuarios impiden dejar el sistema sin admin activo.

Riesgos:

- `getCurrentProfile()` hace `select("*")`; no es critico, pero podria crear DTOs minimos para contexts.
- La matriz TS y las funciones SQL privadas son dos mundos que deben actualizarse juntos cuando cambien permisos.
- La ruta `/dashboard/pedidos/nuevo` queda permitida por prefijo para trabajador y se bloquea luego por pagina/action; no es brecha, pero es una decision UX/arquitectura a formalizar.

### 4.8 Storage

Archivos relevantes:

- `src/lib/storage/constants.ts`
- `src/lib/storage/file-paths.ts`
- `src/lib/storage/file-validation.ts`
- `src/lib/storage/upload-public-solicitud-file.ts`
- `src/lib/storage/upload-pedido-file.ts`
- `src/lib/storage/list-solicitud-files.ts`
- `src/lib/storage/list-pedido-files.ts`
- `src/lib/storage/signed-url.ts`

Lo bueno:

- Bucket privado.
- `file_path` no llega a componentes.
- Rutas se construyen server-side.
- Descargas internas usan URL firmada de corta duracion.
- Public upload valida archivo antes de crear solicitud cuando corresponde.
- Metadata de archivos se guarda en `archivos`.

Riesgos:

- `next.config.ts` permite `proxyClientMaxBodySize` y `serverActions.bodySizeLimit` de `110mb`. Es aceptable para MVP/local, pero debe revisarse antes de produccion.
- La subida publica puede dejar objeto huerfano si falla metadata despues del upload; ya esta documentado en `TECH_DEBT.md`.
- La subida interna hace cleanup best-effort, pero Storage y DB no son transaccionales entre si.
- Los route handlers de descarga duplican validaciones parecidas.

### 4.9 Dashboard

Archivos relevantes:

- `src/lib/dashboard/get-dashboard.ts`
- `src/lib/dashboard/context.ts`
- `src/lib/dashboard/get-dashboard-summary.ts`
- `src/lib/dashboard/get-dashboard-work-items.ts`
- `src/lib/dashboard/get-dashboard-activity.ts`
- `src/lib/dashboard/get-worker-dashboard.ts`

La deuda antigua de carga de perfil repetida fue parcialmente resuelta: `getDashboard()` obtiene contexto una vez y carga resumen, paneles y actividad en paralelo.

Riesgos actuales:

- Cada loader abre su propio cliente Supabase y ejecuta varias queries. Es razonable para MVP, pero conviene medir si crece.
- `get-dashboard-activity.ts` construye textos seguros desde metadata; es valioso, pero denso.
- La metrica de pedidos sin tareas todavia incluye impresiones, aunque ese flujo no requiere tareas. Esta deuda esta documentada.
- Dashboard activity para trabajador se apoya en RLS para limitar `pedido_historial`; conviene conservar pruebas por rol.

### 4.10 Tests y QA

Estado actual:

- `smoke.spec.ts` es pequeno y util.
- `full-visual-qa.spec.ts` cubre mucho, pero es largo, serial, genera datos reales de QA y mezcla dominios.
- Playwright esta configurado para Chromium y Edge.
- No hay tests unitarios visibles para validadores puros.

Riesgos:

- El full visual QA sera costoso de mantener.
- La fecha fija `2026-12-18` debe hacerse dinamica antes de que deje de ser futura.
- Refactors de Beta 2 se beneficiarian de tests unitarios/focales para validadores, permisos y mappers.

## 5. Evaluacion de patrones actuales

### `ServiceResult`, `serviceSuccess`, `serviceFailure`

El patron existe y se usa ampliamente. Es una buena base. Permite distinguir `ok`, `reason`, `message`, `fieldErrors` y datos adicionales.

Riesgo: cada dominio define razones, extras y valores a su manera. No es grave, pero Beta 2 deberia documentar familias de resultado:

- list result;
- detail result;
- mutation result;
- upload result;
- rpc result.

### Validadores

Hay validadores transversales en:

- `src/lib/validators/form.ts`
- `src/lib/validators/date.ts`
- `src/lib/validators/uuid.ts`
- `src/lib/utils/search-params.ts`
- `src/lib/utils/form-data.ts`

Tambien hay validadores por dominio:

- `client-validation.ts`
- `user-validation.ts`
- `order-validation.ts`
- `task-validation.ts`
- `public-request-validation.ts`
- `task-template-validation.ts`
- `file-validation.ts`

Esto es correcto. Lo que falta es separar mejor helpers comunes de reglas especificas.

### Labels

Existen labels por dominio:

- pedidos;
- solicitudes;
- permisos;
- storage;
- workflow types;
- public tracking.

Riesgo: dashboard, historial y componentes vuelven a formatear ciertos valores. Conviene centralizar mappers de actividad/historial por dominio.

### Helpers de fecha

Existen helpers en `src/lib/utils/date.ts` y validadores de fecha en `src/lib/validators/date.ts`. El uso es correcto para inputs `YYYY-MM-DD` y fecha local. Debe evitarse `toISOString()` para reglas de negocio de fechas locales.

### FormData

`getFormValue` esta centralizado, pero las actions repiten lectura manual de muchos campos. Se puede crear un pequeno helper por action/familia para mapear FormData a input de servicio, sin meter negocio en la action.

### Manejo de errores y logging

El codigo usa `console.error` server-side y mensajes genericos para usuario. Es correcto para MVP. Si crece, conviene crear un helper de logging seguro para homogenizar contexto y evitar datos sensibles.

### `revalidatePath`

Las revalidaciones estan escritas a mano en cada action. Ya existen helpers locales como `revalidatePedidoDetail` y `revalidateSolicitudDetail`, pero no hay patron transversal por dominio.

### RPC wrappers

Hay varios casts manuales:

- `supabase as unknown as ConvertSolicitudRpcClient`
- `CreateManualPedidoRpcClient`
- `SolicitudStatusRpcClient`
- `PedidoCommentsRpcClient`
- `PedidoHistoryRpcClient`
- `UpdatePedidoPaymentRpcClient`

No es un bug, pero se repite. Conviene crear wrappers por dominio, por ejemplo `src/lib/pedidos/rpc.ts` y `src/lib/solicitudes/rpc.ts`, con tipos y mapeo de errores.

### Permisos

La matriz TS es clara y se complementa con RLS/RPCs. Debe mantenerse la regla de actualizar TS, SQL y docs en una misma tarea cuando cambie un permiso.

## 6. Procesos similares que deben uniformarse

Procesos parecidos con implementaciones similares:

- Create/update/list/detail en clientes, usuarios, task templates y pedidos.
- Lectura de `FormData` en actions.
- Estados de action con `{ ok, message, fieldErrors, values }`.
- Revalidaciones por dominio despues de mutaciones.
- Validacion de UUID antes de queries.
- Validacion de perfil activo y permisos.
- Mapeo de errores Supabase a mensajes genericos.
- Mapeo de errores RPC seguros a razones de dominio.
- Conversion de strings vacios a `null`.
- Busqueda por `q` en listados.
- Listado de comentarios/historial de pedidos y solicitudes.
- Upload y descarga de archivos de pedidos/solicitudes.
- Construccion de textos visibles desde metadata de historial.
- Tabs de `workflow_type` en solicitud publica y pedido manual.
- Labels de estados y roles en componentes, servicios y dashboard.

## 7. Hallazgos clasificados

| Severidad | Area | Hallazgo | Riesgo | Recomendacion |
|---|---|---|---|---|
| Alto | Server Actions | `src/app/dashboard/pedidos/[id]/actions.ts` concentra 457 lineas y muchas mutaciones. | Mayor costo de mantenimiento y mas probabilidad de omitir revalidaciones o estados. | Dividir por familias o extraer helpers de action/revalidacion sin cambiar contratos. |
| Alto | Pedidos | `src/lib/pedidos/list-internal-pedidos.ts` mezcla busqueda, filtros, relaciones, pagos y progreso. | Cambios futuros en listado pueden romper busqueda o rendimiento. | Separar query builders, mappers y progreso en archivos internos. |
| Alto | Tests | `tests/e2e/full-visual-qa.spec.ts` cubre demasiados dominios en un spec serial. | Lento, fragil y dificil de diagnosticar cuando falle. | Dividir por dominios y conservar un full QA de cierre. |
| Alto | Tests | El full visual QA usa `futureDate = "2026-12-18"`. | A partir del 18 de diciembre de 2026 puede fallar por fecha pasada. | Generar fecha futura dinamica desde la fecha de ejecucion. |
| Medio | Arquitectura | No hay `src/services`; `src/lib` es la capa real, pero falta estructura interna formal. | Futuros desarrolladores pueden reabrir debate por nombre de carpeta. | Adoptar oficialmente `src/lib/<dominio>` y documentar convencion. |
| Medio | RPC | Casts manuales de RPC y safe error mappings repetidos. | Tipado disperso y duplicacion de manejo de errores. | Crear wrappers `rpc.ts` por dominio. |
| Medio | Componentes | `PublicSolicitudForm` y `PedidoForm` duplican tabs, campos de impresion y action state. | Refactors de workflow pueden tocar dos lugares con riesgo de drift. | Extraer subcomponentes/form helpers compartidos. |
| Medio | Dashboard | Actividad reciente e historial transforman metadata en varios lugares. | Riesgo de mostrar textos inconsistentes o metadata no deseada si crece. | Centralizar mappers seguros de actividad/historial. |
| Medio | Storage | Server Actions procesan hasta 110 MB por request. | Riesgo de memoria/latencia antes de produccion. | Evaluar signed upload/control directo a Storage en fase posterior. |
| Medio | Storage | Objetos huerfanos posibles si falla metadata tras upload. | Basura operativa en bucket privado. | Disenar reconciliacion/cleanup seguro; no abrir borrado anonimo. |
| Medio | Seguridad | `/dashboard/pedidos/nuevo` es accesible por prefijo a trabajador, aunque pagina/action bloquean operacion. | No es fuga, pero crea UX/auditoria menos clara. | Decidir si se mantiene mensaje en pagina o se endurece ruta. |
| Medio | Docs | `docs/development/TECHNICAL_AUDIT.md` contiene hallazgos ya obsoletos como `src/services`. | Confusion si se usa como fuente vigente. | Marcar docs historicos como referencia no vigente o limpiar en Beta 2.9. |
| Bajo | Auth | `getCurrentProfile()` usa `select("*")`. | Mas datos de perfil de los necesarios en algunos contextos. | Crear helpers de perfil minimo si el patron se repite. |
| Bajo | Revalidacion | `revalidatePath` se repite por dominio. | Omisiones futuras. | Crear helpers por dominio. |
| Bajo | Scripts | Auditorias informativas imprimen coincidencias documentales esperadas. | Falsos positivos en reportes. | Mantener, pero documentar interpretacion de resultados. |
| Observacion | Seguridad | No se detecto uso operativo de `service_role`, `SUPABASE_SERVICE_ROLE_KEY` ni consultas a `auth.users` desde app code. | N/A | Mantener regla actual. |
| Observacion | Componentes | No se detecto Supabase directo en `src/components`. | N/A | Mantener Client Components como UI/interaccion solamente. |
| Observacion | Next.js | El proyecto usa `proxy.ts` y props dinamicas modernas. | N/A | Seguir consultando docs locales de Next antes de cambios. |

## 8. Decision recomendada sobre `src/lib` vs `src/services`

### Opcion A

Mantener `src/lib` como capa de servicios de dominio y formalizar su estructura interna.

Ventajas:

- Refleja el estado real del codigo.
- Evita churn mecanico de imports.
- Mantiene cercania con patrones existentes.
- Permite consolidar por dominio sin migracion masiva.
- Coincide con README actual.

Desventajas:

- `lib` puede sonar amplio si no se documenta bien.
- Requiere disciplina para que `src/lib` no mezcle utilidades globales y negocio sin estructura.

Riesgos:

- Si no se formaliza, la carpeta puede seguir creciendo con archivos grandes.

Impacto:

- Bajo impacto inicial.
- Alta mejora de mantenibilidad si se acompana con convenciones internas.

### Opcion B

Crear `src/services` y migrar progresivamente la logica de negocio.

Ventajas:

- Nombre explicito para servicios.
- Puede ser familiar para algunos equipos.

Desventajas:

- Introduce una segunda capa conceptual.
- Genera cambios mecanicos amplios.
- Puede duplicar responsabilidades de `src/lib/<dominio>`.
- No resuelve por si mismo archivos grandes, RPCs repetidas ni validadores dispersos.

Riesgos:

- Refactor de imports con bajo valor funcional.
- Mezcla temporal entre `lib` y `services`.
- Perdida de alineacion con documentacion actual.

Impacto:

- Medio/alto en churn.
- Bajo valor si solo cambia nombres.

### Opcion C

Estructura hibrida.

Ejemplo: mantener helpers en `src/lib` y mover negocio a `src/services`.

Ventajas:

- Permite separar utilidades puras de servicios.

Desventajas:

- Aumenta decisiones por archivo.
- Puede duplicar boundaries.
- Requiere reglas muy claras para imports cruzados.

Riesgos:

- Mayor carga cognitiva.
- Futuros cambios pueden no saber si crear en `lib` o `services`.

Impacto:

- Medio.
- Solo justificable si el equipo define una frontera fuerte que hoy no existe.

Recomendacion final: Opcion A. Mantener `src/lib` como capa de servicios de dominio y formalizar su estructura interna. La decision no debe tomarse por el nombre de la carpeta, sino por mantenibilidad real. Hoy `src/lib` ya contiene el backend de aplicacion, esta documentado en README y no existe `src/services`.

## 9. Propuesta de arquitectura objetivo para Beta 2

Estructura recomendada por dominio, aplicada progresivamente y solo donde el tamano lo justifique:

```txt
src/lib/<dominio>/
  index.ts
  types.ts
  labels.ts
  validation.ts
  mappers.ts
  queries.ts
  mutations.ts
  rpc.ts
  errors.ts
```

No todos los dominios necesitan todos los archivos. La regla debe ser extraer solo cuando reduzca complejidad real.

Aplicacion:

- `src/app/**/page.tsx`: carga server-side, decide `notFound`/errores y compone UI.
- `src/app/**/actions.ts`: lee `FormData`, llama servicios, devuelve estado UI y revalida.
- `src/app/**/route.ts`: handlers especificos, preferiblemente delegando a helpers de `src/lib`.

Server Actions:

- Mantener finas.
- Extraer helpers de `FormData` por formulario cuando haya muchos campos.
- Reutilizar helpers de revalidacion por dominio.
- No meter reglas de negocio nuevas en actions.

Servicios de dominio:

- `queries.ts` para lecturas complejas.
- `mutations.ts` para escrituras de tabla no transaccionales simples.
- `rpc.ts` para llamadas RPC tipadas y mapeo de errores.
- `mappers.ts` para DTOs UI-safe.
- `validation.ts` para reglas de input.
- `labels.ts` para textos de dominio.

Componentes:

- Mantener `src/components/<dominio>` como capa visual.
- Extraer subcomponentes de formularios grandes.
- Evitar que componentes construyan reglas de negocio complejas.
- Mantener `src/components/ui` como primitives.

Tests:

- `tests/e2e/smoke.spec.ts` para carga basica.
- `tests/e2e/public-request.spec.ts` para `/solicitud`.
- `tests/e2e/public-tracking.spec.ts` para `/estado`.
- `tests/e2e/auth-permissions.spec.ts` para login/roles.
- `tests/e2e/orders.spec.ts` para pedidos, tareas y pagos.
- `tests/e2e/storage.spec.ts` para uploads/downloads si el costo lo permite.
- `tests/e2e/full-visual-qa.spec.ts` como recorrido de cierre, mas pequeno o reservado a release.

## 10. Plan recomendado de subfases Beta 2

### Beta 2.1 - Decision formal de arquitectura de capas

- Aprobar Opcion A: `src/lib` como capa de servicios de dominio.
- Documentar estructura interna objetivo.
- Definir reglas para actions, queries, mutations, mappers y rpc wrappers.

### Beta 2.2 - Consolidar helpers transversales

- Revalidaciones por dominio.
- Helpers de action/FormData.
- Familias de `ServiceResult`.
- Logging seguro server-side, si se decide.
- Mappers comunes para errores RPC.

### Beta 2.3 - Consolidar dominio Pedidos

- Dividir `src/app/dashboard/pedidos/[id]/actions.ts` por helpers/familias.
- Separar `list-internal-pedidos.ts` en query builder, mapper y progress loader.
- Extraer `rpc.ts` para crear pedido, convertir, estado, pagos e historial.
- Mantener behavior y UI sin cambios.

### Beta 2.4 - Consolidar Solicitudes y Tracking Publico

- Revisar `public-request-validation.ts`.
- Extraer mappers de historial/metadata.
- Revisar `src/app/solicitud/actions.ts` y upload publico.
- Mantener DTO publico minimo de `/estado`.

### Beta 2.5 - Consolidar Clientes, Usuarios y Permisos

- Uniformar CRUD simple.
- Revisar `getCurrentProfile()` y DTOs minimos.
- Formalizar decision de `/dashboard/pedidos/nuevo` para trabajador.
- Confirmar matriz TS/docs/RLS.

### Beta 2.6 - Consolidar Storage

- Consolidar route handlers de descarga.
- Documentar y preparar estrategia futura de uploads grandes.
- Mantener `file_path` server-side.
- No abrir borrado anonimo.

### Beta 2.7 - Consolidar componentes UI

- Extraer subcomponentes de `PublicSolicitudForm`, `PedidoForm` y detalles grandes.
- No rediseno visual grande.
- Mantener accesibilidad y responsive.

### Beta 2.8 - Consolidar Playwright

- Dividir `full-visual-qa.spec.ts`.
- Hacer dinamica la fecha futura.
- Mantener smoke rapido.
- Agregar pruebas focales de permisos/validadores si se habilita test runner unitario.

### Beta 2.9 - Cierre documental

- Actualizar docs de desarrollo obsoletas.
- Marcar auditorias antiguas como historicas.
- Actualizar `TECH_DEBT.md` con deudas vigentes de Beta 2.
- Preparar reporte de cierre.

## 11. Que NO conviene hacer

- No reescribir toda la app.
- No mover todo a `src/services` por preferencia de nombre.
- No mezclar refactor con features nuevas.
- No tocar migraciones en Beta 2 salvo tarea explicita.
- No cambiar reglas de negocio de pedidos, solicitudes, pagos, Storage o permisos.
- No modificar `src/types/database.types.ts` sin cambio real de DB.
- No agregar `service_role` ni `SUPABASE_SERVICE_ROLE_KEY`.
- No consultar `auth.users` desde codigo de aplicacion.
- No consultar Supabase desde Client Components.
- No cambiar UI visual grande durante consolidacion arquitectonica.
- No introducir librerias de validacion sin decision del proyecto.
- No exponer `file_path`, metadata cruda, URLs privadas persistentes ni pagos en tracking publico.
- No eliminar documentos historicos sin acordar si deben conservarse como archivo de fase.

## 12. Checklist de cierre de Beta 2.0

- [x] Reviso `src/app`.
- [x] Reviso `src/lib`.
- [x] Reviso componentes.
- [x] Reviso tests.
- [x] Reviso scripts.
- [x] Reviso docs.
- [x] Reviso `.codex/skills`.
- [x] Reviso `package.json`.
- [x] Reviso `playwright.config.ts`.
- [x] Reviso `src/proxy.ts` y `src/lib/supabase/proxy.ts`.
- [x] Emitio recomendacion sobre `src/lib` vs `src/services`.
- [x] Propuso plan de subfases Beta 2.
- [x] No modifico codigo funcional.
- [x] No modifico UI.
- [x] No modifico migraciones.
- [x] No modifico `src/types/database.types.ts`.

Pendiente despues de crear este documento:

- Ejecutar `npm.cmd run diff:check`.
- Ejecutar `npm.cmd run audit:security`.
- Ejecutar `npm.cmd run audit:client-supabase`.
- Ejecutar `npm.cmd run audit:public-tracking`.
- Ejecutar `npm.cmd run verify`.
