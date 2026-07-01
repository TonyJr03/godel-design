# Beta 2.7.1 - Auditoria focal de Dashboard, actividad y work-items

## 1. Objetivo

Auditar el estado actual del dashboard operativo sin modificar codigo
funcional. El alcance cubre `/dashboard`, `src/lib/dashboard`,
`src/components/dashboard`, layout protegido, permisos, auth, relacion con
Pedidos, Solicitudes, Clientes, Usuarios, Storage y cobertura e2e vigente.

La auditoria busca decidir como consolidar Beta 2.7 sin romper visibilidad por
rol, permisos, RLS, separacion de responsabilidades ni contratos seguros de
datos.

## 2. Resumen ejecutivo

El estado general es bueno. El dashboard ya funciona como una capa de lectura
server-side sobre dominios existentes. `/dashboard` consume `getDashboard()`,
que obtiene contexto de perfil/rol una vez y carga resumen, work-items y
actividad reciente en paralelo. Los componentes de dashboard renderizan DTOs y
no consultan Supabase directamente.

Puntos fuertes:

- `src/lib/dashboard/types.ts` centraliza DTOs principales por rol.
- `getDashboardContext()` valida perfil activo y `dashboard.view`.
- Admin y supervisor reciben vista global de operacion.
- Trabajador recibe resumen y work-items de pedidos asignados.
- El proxy bloquea rutas protegidas con `canAccessDashboardRoute`.
- RLS refuerza pedidos, tareas, clientes, perfiles e historial.
- La UI no recibe `file_path`, bucket, signed URLs ni metadata cruda.
- El dashboard no muestra pagos ni metricas financieras agregadas.

Riesgos principales:

- `get-dashboard-activity.ts` es denso y transforma metadata de historial en
  textos visibles; es correcto hoy, pero sensible si crece.
- `get-dashboard-work-items.ts` duplica parte del calculo de progreso que ya
  existe para listados de pedidos.
- La metrica "sin tareas" todavia no distingue `workflow_type`; puede marcar
  impresiones validas como pendientes.
- Actividad reciente de trabajador consulta `pedido_historial` y depende de RLS
  para filtrar pedidos asignados; conviene mantener QA por rol.
- No hay spec e2e focal solo de dashboard por rol; la cobertura vive en
  full visual QA y specs de dominios relacionados.
- `docs/DASHBOARD_OPERATIVE_MODEL.md` conserva una referencia historica a
  `WorkerDashboardPanel.tsx`, archivo que ya no existe.

Recomendacion general: consolidar primero tipos/mappers y loaders internos del
dashboard, despues revisar work-items y semantica por `workflow_type`, cerrar
con QA e2e focal por rol y documentacion final. No cambiar permisos, RLS,
migraciones ni UI visual grande dentro de esta auditoria.

## 3. Mapa del dominio Dashboard

### `src/lib/dashboard`

| Archivo | Responsabilidad actual |
|---|---|
| `index.ts` | API publica del dominio: exporta `getDashboard` y tipos consumidos por componentes. |
| `types.ts` | DTOs y resultados para resumen, work-items, actividad, roles management/worker y errores seguros. |
| `context.ts` | Lee `getCurrentProfile`, valida `dashboard.view` y clasifica contexto como `management` o `worker`. |
| `get-dashboard.ts` | Orquestador unico de `/dashboard`; carga summary, work-items y activity en paralelo. |
| `get-dashboard-summary.ts` | Conteos globales para admin/supervisor y delegacion al resumen de trabajador. |
| `get-worker-dashboard.ts` | Metricas de trabajador basadas en pedidos asignados. |
| `get-dashboard-work-items.ts` | Solicitudes pendientes, pedidos que requieren atencion y pedidos asignados del trabajador. |
| `get-dashboard-activity.ts` | Actividad reciente desde `pedido_historial` y `solicitud_historial`, mapeada a textos seguros. |
| `helpers.ts` | Ventana de fechas, estados finales/pendientes y helpers de vencimiento. |
| `README.md` | Mapa operativo vigente del dashboard. |

### Paginas relacionadas

- `src/app/dashboard/page.tsx`: Server Component principal. Consume
  `getDashboard()` y compone `PageHeader`, atencion, work panels, overview y
  actividad reciente.
- `src/app/dashboard/layout.tsx`: carga `getCurrentProfile()` y pasa el rol al
  sidebar.
- Rutas hermanas bajo `/dashboard/*`: solicitudes, pedidos, clientes, usuarios
  y configuracion. El dashboard enlaza hacia detalle/listados de esas rutas,
  pero no ejecuta mutaciones.

### Componentes relacionados

| Archivo | Responsabilidad |
|---|---|
| `DashboardAttentionPanel.tsx` | Destaca metricas prioritarias de resumen segun rol. |
| `DashboardOverview.tsx` | Convierte metricas DTO en tarjetas visibles. |
| `DashboardSummaryCards.tsx` | Grid presentacional de tarjetas. |
| `DashboardWorkPanels.tsx` | Renderiza solicitudes pendientes, pedidos de atencion o pedidos asignados. |
| `DashboardRecentActivity.tsx` | Renderiza actividad reciente ya mapeada por el servidor. |
| `DashboardSection.tsx` | Wrapper visual de secciones. |

No existe `WorkerDashboardPanel.tsx` en el arbol actual; la vista de trabajador
esta integrada en `DashboardOverview`, `DashboardAttentionPanel` y
`DashboardWorkPanels`.

### Dependencias

- Auth: `getCurrentProfile()` confirma usuario con perfil activo minimo
  (`id`, `role`, `is_active`).
- Permissions: `hasPermission`, `isAdmin`, `isSupervisor`, `isTrabajador` y
  `canAccessDashboardRoute`.
- Pedidos: estados, labels, progreso de tareas, pedidos asignados, historial y
  `pedido_trabajadores`.
- Solicitudes: estados, labels, solicitudes pendientes e historial.
- Clientes: conteo de clientes y nombres de cliente en pedidos/work-items.
- Usuarios/perfiles: perfil actual y nombres de actores en historial via RLS o
  RPCs de historial.
- Storage: solo indirecto mediante eventos de archivo en historial. No se
  exponen rutas privadas ni descargas.

## 4. Flujos actuales de dashboard

### 4.1 Dashboard general

Pagina: `src/app/dashboard/page.tsx`.

Loader: `getDashboard()`.

Flujo:

1. `getDashboard()` llama `getDashboardContext()`.
2. `getDashboardContext()` obtiene perfil activo y valida `dashboard.view`.
3. Si no hay contexto valido, devuelve el mismo error a summary, work-items y
   activity.
4. Si hay contexto, carga en paralelo `loadDashboardSummary`,
   `loadDashboardWorkItems` y `loadDashboardRecentActivity`.
5. La pagina decide titulo segun si algun resultado es `worker`.
6. Componentes renderizan errores seguros o DTOs.

Permisos:

- `/dashboard` esta permitido a `admin`, `supervisor` y `trabajador` por
  `canAccessDashboardRoute`.
- La pagina y loaders repiten perfil activo y `dashboard.view`.
- RLS sigue limitando filas reales.

DTOs:

- `GetDashboardSummaryResult`
- `GetDashboardWorkItemsResult`
- `GetDashboardRecentActivityResult`
- `GetDashboardResult`

Componentes:

- `DashboardAttentionPanel`
- `DashboardWorkPanels`
- `DashboardOverview`
- `DashboardRecentActivity`

### 4.2 Resumen operativo

Admin/supervisor reciben metricas globales:

- solicitudes nuevas;
- solicitudes pendientes;
- solicitudes aprobadas sin convertir;
- pedidos activos;
- pedidos en produccion;
- pedidos listos para entrega;
- pedidos sin tareas;
- pedidos atrasados;
- pedidos proximos a entrega;
- clientes registrados.

Trabajador recibe metricas propias:

- pedidos asignados activos;
- pedidos asignados en produccion;
- pedidos asignados listos para entrega;
- pedidos asignados sin tareas;
- pedidos asignados atrasados;
- pedidos asignados proximos a entrega;
- total de pedidos asignados.

Origen de datos:

- `solicitudes`
- `pedidos`
- `pedido_tareas`
- `pedido_trabajadores`
- `clientes`

Las metricas se calculan server-side. Los componentes solo seleccionan tarjetas,
textos y tonos visuales. Riesgo principal: la metrica "sin tareas" no distingue
si el pedido es `encargo` o `impresion`.

### 4.3 Actividad reciente

Loader: `loadDashboardRecentActivity(context)`.

Admin/supervisor:

- consulta `pedido_historial`;
- consulta `solicitud_historial`;
- mezcla ambos resultados y ordena por `createdAt`.

Trabajador:

- consulta solo `pedido_historial`;
- depende de RLS `pedido_historial_select_accessible`, que usa
  `private.can_access_pedido(pedido_id)`.

Datos expuestos:

- `id` sintetico con prefijo `pedido-` o `solicitud-`;
- `source`;
- `action`;
- `href`;
- `title`;
- `description`;
- `createdAt`.

El loader lee `metadata`, `old_value`, `new_value` y `summary`, pero no pasa
metadata cruda al componente. Extrae campos allowlist como `file_name`, `title`,
`client_name`, `pedido_numero` u `order_number` y construye frases visibles.
`getSafeFileName()` elimina segmentos de ruta al mostrar nombres de archivo.

Riesgos:

- El mapper de actividad es largo y podria filtrar metadata no deseada si se
  agregan eventos sin cuidado.
- Hay logica parecida en historiales de Pedidos/Solicitudes.
- La actividad de trabajador debe seguir probandose por rol, porque descansa en
  RLS para no mostrar pedidos no asignados.

### 4.4 Work-items o trabajos pendientes

Loader: `loadDashboardWorkItems(context)`.

Admin/supervisor ven:

- solicitudes pendientes (`nueva`, `en_revision`, `contactada`, `aprobada` sin
  conversion);
- pedidos activos ordenados por atencion operativa.

Trabajador ve:

- pedidos asignados activos ordenados por atencion operativa.

Los pedidos se priorizan por:

- pendiente de revision;
- atrasado;
- proximo a entrega;
- en revision sin tareas;
- en produccion con tareas pendientes;
- listo para entrega.

Relacion con Pedidos:

- usa `calculatePedidoTasksProgressByPedidoId` desde `src/lib/pedidos`;
- vuelve a declarar `TASK_PROGRESS_SELECT`, similar al loader de progreso de
  listados de pedidos;
- usa `pedido_trabajadores!inner` para filtrar trabajador asignado.

Relacion con Solicitudes:

- muestra cliente, telefono, tipo de servicio, estado, fechas y enlace al
  detalle interno para admin/supervisor;
- trabajador no recibe solicitudes.

Riesgos:

- `clienteTelefono` llega a work-items de management; es interno y aceptable
  para admin/supervisor, pero no debe llegar a trabajador ni rutas publicas.
- El ranking operativo no considera `workflow_type`, por lo que puede tratar
  impresiones sin tareas como atencion pendiente.

### 4.5 Dashboard de trabajador

El dashboard de trabajador no es una pagina separada; usa los mismos componentes
con DTOs `kind: "worker"`.

Loaders especificos:

- `loadWorkerDashboardSummary(context)` para metricas.
- Rama worker de `loadDashboardWorkItems(context)` para pedidos asignados.
- Rama worker de `loadDashboardRecentActivity(context)` para actividad de
  pedidos accesibles.

Que muestra:

- resumen de pedidos asignados;
- pedidos asignados que requieren seguimiento;
- actividad reciente de pedidos accesibles por RLS.

Que no debe ver:

- solicitudes generales;
- clientes generales;
- usuarios/perfiles globales;
- configuracion;
- pagos agregados o metricas financieras;
- pedidos no asignados;
- archivos asociados solo a solicitudes;
- `file_path`, bucket, signed URLs o metadata cruda.

Relacion con RLS:

- `private.can_access_pedido` permite admin/supervisor o trabajador asignado.
- `pedidos_select_accessible`, `pedido_tareas_select_accessible` y
  `pedido_historial_select_accessible` se apoyan en ese helper.
- `solicitud_historial_select_manager` exige admin/supervisor.
- `clientes_select_accessible` permite clientes globales a admin/supervisor y
  clientes por pedido accesible a trabajador.
- `perfiles_select_visible` permite perfil propio, admin/supervisor y perfiles
  relacionados con pedidos accesibles.

## 5. Visibilidad por rol

| Rol | Que puede ver en dashboard | Que no debe ver | Validacion actual |
|---|---|---|---|
| `admin` | Resumen global, solicitudes pendientes, pedidos de atencion, actividad de pedidos y solicitudes, navegacion a solicitudes, pedidos, clientes, usuarios y configuracion. | No debe ver secretos, `auth.users`, `service_role`, `file_path`, bucket, signed URLs ni metadata cruda. | Proxy permite `/dashboard`; `getDashboardContext` valida `dashboard.view`; RLS permite vista global por admin/supervisor. |
| `supervisor` | Resumen global, solicitudes pendientes, pedidos de atencion, actividad de pedidos y solicitudes, navegacion a solicitudes, pedidos y clientes. | Usuarios, configuracion, secretos, datos Auth, `file_path`, bucket, signed URLs y metadata cruda. | Proxy bloquea usuarios/configuracion; permisos no incluyen `usuarios.view`; servicios/RLS refuerzan admin/supervisor. |
| `trabajador` | Resumen de pedidos asignados, pedidos asignados que requieren seguimiento, actividad de pedidos accesibles, navegacion a dashboard y pedidos. | Solicitudes generales, clientes generales, usuarios/perfiles globales, configuracion, pedidos no asignados, archivos solo de solicitudes, pagos agregados, metricas globales, metadata cruda. | Proxy permite `/dashboard` y `/dashboard/pedidos`; loaders worker filtran por `pedido_trabajadores`; RLS usa `private.can_access_pedido`. |

## 6. Evaluacion de archivos principales

| Archivo | Responsabilidad | Riesgo | Recomendacion |
| ------- | --------------- | ------ | ------------- |
| `src/app/dashboard/page.tsx` | Componer la vista principal desde `getDashboard()`. | Bajo. Server Component simple. | Mantener sin logica de negocio; si crece, mover decisiones de vista a helper. |
| `src/app/dashboard/layout.tsx` | Cargar perfil y sidebar. | Bajo-medio por navegacion visible. | Mantener sidebar como UX, no como seguridad. |
| `src/lib/dashboard/index.ts` | API publica del dominio. | Bajo. | Mantener `getDashboard()` como entrada principal. |
| `src/lib/dashboard/types.ts` | DTOs y contratos por rol. | Medio si crece sin subtipos. | Consolidar en Beta 2.7.2; dividir solo si reduce complejidad real. |
| `src/lib/dashboard/context.ts` | Perfil activo y rol de dashboard. | Alto por frontera de permisos. | Mantener `dashboard.view`, perfil minimo y roles explicitos. |
| `src/lib/dashboard/get-dashboard.ts` | Orquestador paralelo. | Bajo. | Mantener como fachada; no meter queries aqui. |
| `src/lib/dashboard/get-dashboard-summary.ts` | Conteos globales management. | Medio por multiples queries y semantica sin tareas. | Revisar metricas y extraer mappers/queries si crecen. |
| `src/lib/dashboard/get-worker-dashboard.ts` | Resumen de trabajador. | Medio por visibilidad de asignaciones. | Mantener filtro por `pedido_trabajadores` y RLS; revisar reuse de progreso. |
| `src/lib/dashboard/get-dashboard-work-items.ts` | Work-items management/worker y ranking operativo. | Medio-alto por densidad y datos de clientes. | Consolidar queries/mappers, alinear progreso con Pedidos y revisar `workflow_type`. |
| `src/lib/dashboard/get-dashboard-activity.ts` | Actividad reciente y mapeo de metadata. | Medio-alto por metadata de historial. | Extraer mappers seguros por source/action; mantener allowlist. |
| `src/lib/dashboard/helpers.ts` | Fechas y helpers de estados. | Bajo-medio por semantica operativa. | Mantener cerca del dashboard; revisar workflow si cambia ranking. |
| `src/components/dashboard/DashboardAttentionPanel.tsx` | Selecciona indicadores prioritarios visibles. | Bajo-medio: filtra tarjetas en UI, pero recibe datos ya autorizados. | Mantener presentacional; no mover permisos aqui. |
| `src/components/dashboard/DashboardOverview.tsx` | Mapea metricas a tarjetas. | Bajo. | Puede beneficiarse de definiciones de cards por rol si crece. |
| `src/components/dashboard/DashboardWorkPanels.tsx` | Renderiza work-items y enlaces. | Medio por datos internos de solicitud/cliente. | Mantener solo para dashboard protegido; no reutilizar en rutas publicas. |
| `src/components/dashboard/DashboardRecentActivity.tsx` | Render de actividad. | Bajo si recibe DTO seguro. | Mantener sin metadata cruda ni consultas. |
| `src/lib/auth/current-user.ts` | Usuario y perfil activo minimo. | Bajo-medio por frontera auth. | Mantener select explicito `id, role, is_active`. |
| `src/lib/permissions/permissions.ts` | Matriz de permisos por rol. | Alto si cambia sin SQL/RLS. | No tocar en Beta 2.7 salvo fase explicita con DB/docs/QA. |
| `src/lib/permissions/routes.ts` | Reglas de rutas del dashboard. | Medio por acceso conceptual. | Mantener sincronizado con sidebar/proxy; no resolver `/pedidos/nuevo` aqui sin fase. |
| `src/lib/supabase/proxy.ts` | Proteccion por sesion, perfil activo y ruta. | Alto por seguridad de dashboard. | No relajar; cualquier cambio requiere QA por rol. |

## 7. DTOs, tipos y contratos

Ya existe `src/lib/dashboard/types.ts`. Contiene:

- roles `DashboardRole`, `ManagementDashboardRole`, `WorkerDashboardRole`;
- metricas management y worker;
- resultados discriminados `ok`;
- DTOs de solicitudes pendientes;
- DTOs de pedidos work-item;
- DTOs de actividad reciente;
- errores seguros.

Esto es una buena base. No hace falta crear un `types.ts` nuevo; la pregunta de
Beta 2.7 es si conviene dividir cuando se consoliden subflujos. Opciones:

- Mantener `types.ts` si los cambios son pequenos.
- Dividir en `summary-types.ts`, `work-items-types.ts` y `activity-types.ts`
  solo si Beta 2.7.2/2.7.3 reduce complejidad real.

DTOs que deben mantenerse seguros:

- Work-items de trabajador sin solicitudes generales ni clientes globales.
- Actividad sin metadata cruda.
- Pedidos sin datos financieros agregados.
- Storage sin `file_path`, bucket ni signed URLs.
- Usuarios/perfiles sin datos Auth ni emails.

Datos sensibles que no deben llegar a componentes:

- `file_path`;
- bucket;
- signed URLs;
- metadata cruda;
- errores SQL/Postgres/Supabase;
- `service_role`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- filas completas de tablas;
- pagos agregados o deuda si no hay decision funcional explicita.

## 8. Patrones repetidos o deuda tecnica

- `get-dashboard-activity.ts` contiene mappers extensos por action; conviene
  separarlos antes de agregar mas eventos.
- Actividad de dashboard e historiales de Pedidos/Solicitudes construyen textos
  desde metadata con patrones parecidos.
- `get-dashboard-work-items.ts` y `src/lib/pedidos/list-internal-pedidos-progress.ts`
  declaran select de progreso y usan `calculatePedidoTasksProgressByPedidoId`.
- `get-dashboard-summary.ts` usa muchas queries de conteo independientes;
  aceptable para MVP, pero puede crecer en costo si se agregan metricas.
- La metrica de pedidos sin tareas no considera `workflow_type`.
- Parte de la seleccion de tarjetas y atencion vive en componentes; no es
  seguridad, pero puede moverse a definiciones puras si crece.
- Falta e2e focal de Dashboard por rol.
- `full-visual-qa.spec.ts` ya toma screenshots de dashboard admin y revisa
  restricciones de supervisor/trabajador, pero no valida especificamente DTOs
  de dashboard worker ni ausencia de datos globales en todas las secciones.
- `docs/DASHBOARD_OPERATIVE_MODEL.md` conserva referencia a
  `WorkerDashboardPanel.tsx`; deuda documental menor.
- Cada loader crea su propio cliente Supabase. Es claro y seguro, aunque se
  puede medir si el dashboard crece.

## 9. Hallazgos clasificados

| Severidad | Area | Hallazgo | Riesgo | Recomendacion |
| --------- | ---- | -------- | ------ | ------------- |
| Medio | Actividad | `get-dashboard-activity.ts` transforma metadata de historial en un archivo denso. | Si crecen eventos, puede filtrar textos inconsistentes o metadata no deseada. | Extraer mappers seguros por source/action y mantener allowlist. |
| Medio | Work-items | `get-dashboard-work-items.ts` duplica parte de la carga de progreso usada por Pedidos. | Drift entre listado de pedidos y dashboard. | Reutilizar helper compartido de progreso o centralizar select/mapping. |
| Medio | Metricas | "Sin tareas" no distingue `workflow_type`. | Impresiones validas pueden aparecer como atencion pendiente. | Ajustar semantica en Beta 2.7.4 sin cambiar reglas de negocio. |
| Medio | Visibilidad worker | Actividad reciente de trabajador se apoya en RLS de `pedido_historial`. | Una regression de RLS podria mostrar actividad de pedidos no asignados. | Agregar QA e2e focal worker y no reemplazar RLS por filtros de UI. |
| Medio | Performance | Summary management ejecuta varios conteos y queries separadas. | Crecimiento futuro puede hacer lenta la carga del dashboard. | Medir antes de optimizar; considerar RPC/queries agregadas solo en fase explicita. |
| Bajo | Componentes | Algunos componentes seleccionan tarjetas/indicadores a partir de metricas. | Duplicacion visual si crecen roles o metricas. | Extraer definiciones puras por rol si Beta 2.7.2 lo justifica. |
| Bajo | Documentacion | `docs/DASHBOARD_OPERATIVE_MODEL.md` menciona `WorkerDashboardPanel.tsx`, inexistente hoy. | Confusion menor para futuros cambios. | Corregir en cierre documental de Beta 2.7. |
| Bajo | QA | No hay spec e2e focal de dashboard por rol. | Cambios futuros dependen de full visual QA. | Crear spec pequeno en Beta 2.7.5. |
| Observacion | Seguridad | No se detecta Supabase directo en `src/components/dashboard`. | N/A | Mantener componentes como UI. |
| Observacion | Seguridad | No se detecta exposicion de `file_path`, bucket o signed URLs en dashboard. | N/A | Mantener DTOs sin Storage interno. |
| Observacion | Arquitectura | `getDashboard()` ya evita repetir contexto de perfil en cada loader. | N/A | Mantener este patron. |

No se detecta hallazgo critico: no hay evidencia de bypass de permisos,
Supabase directo en Client Components, exposicion de `file_path`, signed URLs,
bucket, `service_role`, `SUPABASE_SERVICE_ROLE_KEY` o datos Auth en dashboard.

## 10. Plan recomendado para Beta 2.7

1. Beta 2.7.2 - Consolidar tipos y DTOs de Dashboard.
   - Revisar `types.ts`, exports del barrel y contratos usados por componentes.
   - Decidir si se mantiene un solo `types.ts` o se divide por subflujo.
   - Mantener DTOs sin metadata cruda, Storage interno ni datos financieros.

2. Beta 2.7.3 - Consolidar loaders y mappers de resumen/actividad.
   - Extraer mappers de actividad por pedido/solicitud si reduce densidad.
   - Revisar textos visibles derivados de metadata.
   - Mantener errores seguros y RLS como defensa final.

3. Beta 2.7.4 - Revisar work-items y dashboard de trabajador.
   - Reutilizar o centralizar progreso de tareas con Pedidos.
   - Ajustar semantica de "sin tareas" segun `workflow_type`.
   - Confirmar que trabajador no recibe solicitudes generales ni clientes
     globales.

4. Beta 2.7.5 - QA e2e focal de Dashboard por rol.
   - Verificar admin, supervisor y trabajador en `/dashboard`.
   - Cubrir ausencia de enlaces/datos prohibidos por rol.
   - Cubrir ausencia visible de `file_path`, bucket, signed URLs y metadata
     cruda.
   - Mantener full visual QA como aceptacion general, no unico diagnostico.

5. Beta 2.7.6 - Documentar y cerrar dominio Dashboard.
   - Actualizar `src/lib/dashboard/README.md`.
   - Actualizar `docs/DASHBOARD_OPERATIVE_MODEL.md` si sigue desactualizado.
   - Registrar deudas reales y suite e2e actual.

## 11. Que NO conviene hacer

- No mover dashboard a Client Components.
- No consultar Supabase desde componentes.
- No exponer datos internos innecesarios.
- No duplicar reglas de permisos fuera de services/RLS.
- No cambiar permisos sin fase explicita.
- No tocar RLS/migrations.
- No mezclar rediseno UI con consolidacion de codigo.
- No convertir el dashboard en sistema analitico complejo.
- No crear `src/services`.
- No agregar metricas financieras o productividad individual sin decision
  funcional y de seguridad.
- No devolver metadata cruda de historial a componentes.
- No filtrar trabajador solo ocultando UI; mantener loaders server-side y RLS.

## 12. Checklist de cierre de auditoria

- [x] Reviso `src/lib/dashboard`.
- [x] Reviso `src/components/dashboard`.
- [x] Reviso `src/app/dashboard`.
- [x] Reviso visibilidad por rol.
- [x] Reviso permisos.
- [x] Reviso relacion con Pedidos.
- [x] Reviso relacion con Solicitudes.
- [x] Reviso relacion con Clientes.
- [x] Reviso relacion con Usuarios.
- [x] Reviso relacion con Storage.
- [x] Reviso riesgos de exposicion.
- [x] Propuso subfases.
- [x] No modifico codigo funcional.
