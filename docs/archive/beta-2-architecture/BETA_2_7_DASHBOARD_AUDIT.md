# Beta 2.7.1 - Auditoria focal de Dashboard, actividad y work-items

## 1. Objetivo

Auditar el estado actual del dashboard operativo sin modificar código
funcional. El alcance cubre `/dashboard`, `src/lib/dashboard`,
`src/components/dashboard`, layout protegido, permisos, auth, relación con
Pedidos, Solicitudes, Clientes, Usuarios, Storage y cobertura e2e vigente.

La auditoría busca decidir como consolidar Beta 2.7 sin romper visibilidad por
rol, permisos, RLS, separación de responsabilidades ni contratos seguros de
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
- Admin y supervisor reciben vista global de operación.
- Trabajador recibe resumen y work-items de pedidos asignados.
- El proxy bloquea rutas protegidas con `canAccessDashboardRoute`.
- RLS refuerza pedidos, tareas, clientes, perfiles e historial.
- La UI no recibe `file_path`, bucket, signed URLs ni metadata cruda.
- El dashboard no muestra pagos ni métricas financieras agregadas.

Riesgos principales:

- `get-dashboard-activity.ts` es denso y transforma metadata de historial en
  textos visibles; es correcto hoy, pero sensible si crece.
- `get-dashboard-work-items.ts` duplica parte del calculo de progreso que ya
  existe para listados de pedidos.
- La métrica "sin tareas" todavía no distingue `workflow_type`; puede marcar
  impresiones válidas como pendientes.
- Actividad reciente de trabajador consulta `pedido_historial` y depende de RLS
  para filtrar pedidos asignados; conviene mantener QA por rol.
- No hay spec e2e focal solo de dashboard por rol; la cobertura vive en
  full visual QA y specs de dominios relacionados.
- `docs/DASHBOARD_OPERATIVE_MODEL.md` conserva una referencia histórica a
  `WorkerDashboardPanel.tsx`, archivo que ya no existe.

Recomendación general: consolidar primero tipos/mappers y loaders internos del
dashboard, después revisar work-items y semántica por `workflow_type`, cerrar
con QA e2e focal por rol y documentación final. No cambiar permisos, RLS,
migraciones ni UI visual grande dentro de esta auditoría.

## 3. Mapa del dominio Dashboard

### `src/lib/dashboard`

| Archivo | Responsabilidad actual |
|---|---|
| `index.ts` | API pública del dominio: exporta `getDashboard` y tipos consumidos por componentes. |
| `types.ts` | DTOs y resultados para resumen, work-items, actividad, roles management/worker y errores seguros. |
| `context.ts` | Lee `getCurrentProfile`, valida `dashboard.view` y clasifica contexto como `management` o `worker`. |
| `get-dashboard.ts` | Orquestador único de `/dashboard`; carga summary, work-items y activity en paralelo. |
| `get-dashboard-summary.ts` | Conteos globales para admin/supervisor y delegación al resumen de trabajador. |
| `get-worker-dashboard.ts` | Metricas de trabajador basadas en pedidos asignados. |
| `get-dashboard-work-items.ts` | Solicitudes pendientes, pedidos que requieren atención y pedidos asignados del trabajador. |
| `get-dashboard-activity.ts` | Actividad reciente desde `pedido_historial` y `solicitud_historial`, mapeada a textos seguros. |
| `helpers.ts` | Ventana de fechas, estados finales/pendientes y helpers de vencimiento. |
| `README.md` | Mapa operativo vigente del dashboard. |

### Paginas relacionadas

- `src/app/dashboard/page.tsx`: Server Component principal. Consume
  `getDashboard()` y compone `PageHeader`, atención, work panels, overview y
  actividad reciente.
- `src/app/dashboard/layout.tsx`: carga `getCurrentProfile()` y pasa el rol al
  sidebar.
- Rutas hermanas bajo `/dashboard/*`: solicitudes, pedidos, clientes, usuarios
  y configuración. El dashboard enlaza hacia detalle/listados de esas rutas,
  pero no ejecuta mutaciones.

### Componentes relacionados

| Archivo | Responsabilidad |
|---|---|
| `DashboardAttentionPanel.tsx` | Destaca métricas prioritarias de resumen según rol. |
| `DashboardOverview.tsx` | Convierte métricas DTO en tarjetas visibles. |
| `DashboardSummaryCards.tsx` | Grid presentacional de tarjetas. |
| `DashboardWorkPanels.tsx` | Renderiza solicitudes pendientes, pedidos de atención o pedidos asignados. |
| `DashboardRecentActivity.tsx` | Renderiza actividad reciente ya mapeada por el servidor. |
| `DashboardSection.tsx` | Wrapper visual de secciones. |

No existe `WorkerDashboardPanel.tsx` en el árbol actual; la vista de trabajador
esta integrada en `DashboardOverview`, `DashboardAttentionPanel` y
`DashboardWorkPanels`.

### Dependencias

- Auth: `getCurrentProfile()` confirma usuario con perfil activo mínimo
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

Página: `src/app/dashboard/page.tsx`.

Loader: `getDashboard()`.

Flujo:

1. `getDashboard()` llama `getDashboardContext()`.
2. `getDashboardContext()` obtiene perfil activo y valida `dashboard.view`.
3. Si no hay contexto válido, devuelve el mismo error a summary, work-items y
   activity.
4. Si hay contexto, carga en paralelo `loadDashboardSummary`,
   `loadDashboardWorkItems` y `loadDashboardRecentActivity`.
5. La página decide título según si algún resultado es `worker`.
6. Componentes renderizan errores seguros o DTOs.

Permisos:

- `/dashboard` esta permitido a `admin`, `supervisor` y `trabajador` por
  `canAccessDashboardRoute`.
- La página y loaders repiten perfil activo y `dashboard.view`.
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

Admin/supervisor reciben métricas globales:

- solicitudes nuevas;
- solicitudes pendientes;
- solicitudes aprobadas sin convertir;
- pedidos activos;
- pedidos en producción;
- pedidos listos para entrega;
- pedidos sin tareas;
- pedidos atrasados;
- pedidos proximos a entrega;
- clientes registrados.

Trabajador recibe métricas propias:

- pedidos asignados activos;
- pedidos asignados en producción;
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

Las métricas se calculan server-side. Los componentes solo seleccionan tarjetas,
textos y tonos visuales. Riesgo principal: la métrica "sin tareas" no distingue
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

- El mapper de actividad es largo y podría filtrar metadata no deseada si se
  agregan eventos sin cuidado.
- Hay lógica parecida en historiales de Pedidos/Solicitudes.
- La actividad de trabajador debe seguir probandose por rol, porque descansa en
  RLS para no mostrar pedidos no asignados.

### 4.4 Work-items o trabajos pendientes

Loader: `loadDashboardWorkItems(context)`.

Admin/supervisor ven:

- solicitudes pendientes (`nueva`, `en_revision`, `contactada`, `aprobada` sin
  conversion);
- pedidos activos ordenados por atención operativa.

Trabajador ve:

- pedidos asignados activos ordenados por atención operativa.

Los pedidos se priorizan por:

- pendiente de revisión;
- atrasado;
- próximo a entrega;
- en revisión sin tareas;
- en producción con tareas pendientes;
- listo para entrega.

Relación con Pedidos:

- usa `calculatePedidoTasksProgressByPedidoId` desde `src/lib/pedidos`;
- vuelve a declarar `TASK_PROGRESS_SELECT`, similar al loader de progreso de
  listados de pedidos;
- usa `pedido_trabajadores!inner` para filtrar trabajador asignado.

Relación con Solicitudes:

- muestra cliente, telefono, tipo de servicio, estado, fechas y enlace al
  detalle interno para admin/supervisor;
- trabajador no recibe solicitudes.

Riesgos:

- `clienteTelefono` llega a work-items de management; es interno y aceptable
  para admin/supervisor, pero no debe llegar a trabajador ni rutas públicas.
- El ranking operativo no considera `workflow_type`, por lo que puede tratar
  impresiones sin tareas como atención pendiente.

### 4.5 Dashboard de trabajador

El dashboard de trabajador no es una página separada; usa los mismos componentes
con DTOs `kind: "worker"`.

Loaders específicos:

- `loadWorkerDashboardSummary(context)` para métricas.
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
- configuración;
- pagos agregados o métricas financieras;
- pedidos no asignados;
- archivos asociados solo a solicitudes;
- `file_path`, bucket, signed URLs o metadata cruda.

Relación con RLS:

- `private.can_access_pedido` permite admin/supervisor o trabajador asignado.
- `pedidos_select_accessible`, `pedido_tareas_select_accessible` y
  `pedido_historial_select_accessible` se apoyan en ese helper.
- `solicitud_historial_select_manager` exige admin/supervisor.
- `clientes_select_accessible` permite clientes globales a admin/supervisor y
  clientes por pedido accesible a trabajador.
- `perfiles_select_visible` permite perfil propio, admin/supervisor y perfiles
  relacionados con pedidos accesibles.

## 5. Visibilidad por rol

| Rol | Que puede ver en dashboard | Que no debe ver | Validación actual |
|---|---|---|---|
| `admin` | Resumen global, solicitudes pendientes, pedidos de atención, actividad de pedidos y solicitudes, navegación a solicitudes, pedidos, clientes, usuarios y configuración. | No debe ver secretos, `auth.users`, `service_role`, `file_path`, bucket, signed URLs ni metadata cruda. | Proxy permite `/dashboard`; `getDashboardContext` valida `dashboard.view`; RLS permite vista global por admin/supervisor. |
| `supervisor` | Resumen global, solicitudes pendientes, pedidos de atención, actividad de pedidos y solicitudes, navegación a solicitudes, pedidos y clientes. | Usuarios, configuración, secretos, datos Auth, `file_path`, bucket, signed URLs y metadata cruda. | Proxy bloquea usuarios/configuración; permisos no incluyen `usuarios.view`; servicios/RLS refuerzan admin/supervisor. |
| `trabajador` | Resumen de pedidos asignados, pedidos asignados que requieren seguimiento, actividad de pedidos accesibles, navegación a dashboard y pedidos. | Solicitudes generales, clientes generales, usuarios/perfiles globales, configuración, pedidos no asignados, archivos solo de solicitudes, pagos agregados, métricas globales, metadata cruda. | Proxy permite `/dashboard` y `/dashboard/pedidos`; loaders worker filtran por `pedido_trabajadores`; RLS usa `private.can_access_pedido`. |

## 6. Evaluación de archivos principales

| Archivo | Responsabilidad | Riesgo | Recomendación |
| ------- | --------------- | ------ | ------------- |
| `src/app/dashboard/page.tsx` | Componer la vista principal desde `getDashboard()`. | Bajo. Server Component simple. | Mantener sin lógica de negocio; si crece, mover decisiones de vista a helper. |
| `src/app/dashboard/layout.tsx` | Cargar perfil y sidebar. | Bajo-medio por navegación visible. | Mantener sidebar como UX, no como seguridad. |
| `src/lib/dashboard/index.ts` | API pública del dominio. | Bajo. | Mantener `getDashboard()` como entrada principal. |
| `src/lib/dashboard/types.ts` | DTOs y contratos por rol. | Medio si crece sin subtipos. | Consolidar en Beta 2.7.2; dividir solo si reduce complejidad real. |
| `src/lib/dashboard/context.ts` | Perfil activo y rol de dashboard. | Alto por frontera de permisos. | Mantener `dashboard.view`, perfil mínimo y roles explícitos. |
| `src/lib/dashboard/get-dashboard.ts` | Orquestador paralelo. | Bajo. | Mantener como fachada; no meter queries aquí. |
| `src/lib/dashboard/get-dashboard-summary.ts` | Conteos globales management. | Medio por múltiples queries y semántica sin tareas. | Revisar métricas y extraer mappers/queries si crecen. |
| `src/lib/dashboard/get-worker-dashboard.ts` | Resumen de trabajador. | Medio por visibilidad de asignaciones. | Mantener filtro por `pedido_trabajadores` y RLS; revisar reuse de progreso. |
| `src/lib/dashboard/get-dashboard-work-items.ts` | Work-items management/worker y ranking operativo. | Medio-alto por densidad y datos de clientes. | Consolidar queries/mappers, alinear progreso con Pedidos y revisar `workflow_type`. |
| `src/lib/dashboard/get-dashboard-activity.ts` | Actividad reciente y mapeo de metadata. | Medio-alto por metadata de historial. | Extraer mappers seguros por source/action; mantener allowlist. |
| `src/lib/dashboard/helpers.ts` | Fechas y helpers de estados. | Bajo-medio por semántica operativa. | Mantener cerca del dashboard; revisar workflow si cambia ranking. |
| `src/components/dashboard/DashboardAttentionPanel.tsx` | Selecciona indicadores prioritarios visibles. | Bajo-medio: filtra tarjetas en UI, pero recibe datos ya autorizados. | Mantener presentacional; no mover permisos aquí. |
| `src/components/dashboard/DashboardOverview.tsx` | Mapea métricas a tarjetas. | Bajo. | Puede beneficiarse de definiciones de cards por rol si crece. |
| `src/components/dashboard/DashboardWorkPanels.tsx` | Renderiza work-items y enlaces. | Medio por datos internos de solicitud/cliente. | Mantener solo para dashboard protegido; no reutilizar en rutas públicas. |
| `src/components/dashboard/DashboardRecentActivity.tsx` | Render de actividad. | Bajo si recibe DTO seguro. | Mantener sin metadata cruda ni consultas. |
| `src/lib/auth/current-user.ts` | Usuario y perfil activo mínimo. | Bajo-medio por frontera auth. | Mantener select explícito `id, role, is_active`. |
| `src/lib/permissions/permissions.ts` | Matriz de permisos por rol. | Alto si cambia sin SQL/RLS. | No tocar en Beta 2.7 salvo fase explícita con DB/docs/QA. |
| `src/lib/permissions/routes.ts` | Reglas de rutas del dashboard. | Medio por acceso conceptual. | Mantener sincronizado con sidebar/proxy; no resolver `/pedidos/nuevo` aquí sin fase. |
| `src/lib/supabase/proxy.ts` | Protección por sesión, perfil activo y ruta. | Alto por seguridad de dashboard. | No relajar; cualquier cambio requiere QA por rol. |

## 7. DTOs, tipos y contratos

Ya existe `src/lib/dashboard/types.ts`. Contiene:

- roles `DashboardRole`, `ManagementDashboardRole`, `WorkerDashboardRole`;
- métricas management y worker;
- resultados discriminados `ok`;
- DTOs de solicitudes pendientes;
- DTOs de pedidos work-item;
- DTOs de actividad reciente;
- errores seguros.

Esto es una buena base. No hace falta crear un `types.ts` nuevo; la pregunta de
Beta 2.7 es si conviene dividir cuando se consoliden subflujos. Opciones:

- Mantener `types.ts` si los cambios son pequeños.
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
- pagos agregados o deuda si no hay decisión funcional explícita.

## 8. Patrones repetidos o deuda técnica

- `get-dashboard-activity.ts` contiene mappers extensos por action; conviene
  separarlos antes de agregar más eventos.
- Actividad de dashboard e historiales de Pedidos/Solicitudes construyen textos
  desde metadata con patrones parecidos.
- `get-dashboard-work-items.ts` y `src/lib/pedidos/list-internal-pedidos-progress.ts`
  declaran select de progreso y usan `calculatePedidoTasksProgressByPedidoId`.
- `get-dashboard-summary.ts` usa muchas queries de conteo independientes;
  aceptable para MVP, pero puede crecer en costo si se agregan métricas.
- La métrica de pedidos sin tareas no considera `workflow_type`.
- Parte de la seleccion de tarjetas y atención vive en componentes; no es
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

| Severidad | Área | Hallazgo | Riesgo | Recomendación |
| --------- | ---- | -------- | ------ | ------------- |
| Medio | Actividad | `get-dashboard-activity.ts` transforma metadata de historial en un archivo denso. | Si crecen eventos, puede filtrar textos inconsistentes o metadata no deseada. | Extraer mappers seguros por source/action y mantener allowlist. |
| Medio | Work-items | `get-dashboard-work-items.ts` duplica parte de la carga de progreso usada por Pedidos. | Drift entre listado de pedidos y dashboard. | Reutilizar helper compartido de progreso o centralizar select/mapping. |
| Medio | Métricas | "Sin tareas" no distingue `workflow_type`. | Impresiones válidas pueden aparecer como atención pendiente. | Ajustar semántica en Beta 2.7.4 sin cambiar reglas de negocio. |
| Medio | Visibilidad worker | Actividad reciente de trabajador se apoya en RLS de `pedido_historial`. | Una regression de RLS podría mostrar actividad de pedidos no asignados. | Agregar QA e2e focal worker y no reemplazar RLS por filtros de UI. |
| Medio | Performance | Summary management ejecuta varios conteos y queries separadas. | Crecimiento futuro puede hacer lenta la carga del dashboard. | Medir antes de optimizar; considerar RPC/queries agregadas solo en fase explícita. |
| Bajo | Componentes | Algunos componentes seleccionan tarjetas/indicadores a partir de métricas. | Duplicación visual si crecen roles o métricas. | Extraer definiciones puras por rol si Beta 2.7.2 lo justifica. |
| Bajo | Documentación | `docs/DASHBOARD_OPERATIVE_MODEL.md` menciona `WorkerDashboardPanel.tsx`, inexistente hoy. | Confusión menor para futuros cambios. | Corregir en cierre documental de Beta 2.7. |
| Bajo | QA | No hay spec e2e focal de dashboard por rol. | Cambios futuros dependen de full visual QA. | Crear spec pequeno en Beta 2.7.5. |
| Observación | Seguridad | No se detecta Supabase directo en `src/components/dashboard`. | N/A | Mantener componentes como UI. |
| Observación | Seguridad | No se detecta exposición de `file_path`, bucket o signed URLs en dashboard. | N/A | Mantener DTOs sin Storage interno. |
| Observación | Arquitectura | `getDashboard()` ya evita repetir contexto de perfil en cada loader. | N/A | Mantener este patrón. |

No se detecta hallazgo crítico: no hay evidencia de bypass de permisos,
Supabase directo en Client Components, exposición de `file_path`, signed URLs,
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
   - Ajustar semántica de "sin tareas" según `workflow_type`.
   - Confirmar que trabajador no recibe solicitudes generales ni clientes
     globales.

4. Beta 2.7.5 - QA e2e focal de Dashboard por rol.
   - Verificar admin, supervisor y trabajador en `/dashboard`.
   - Cubrir ausencia de enlaces/datos prohibidos por rol.
   - Cubrir ausencia visible de `file_path`, bucket, signed URLs y metadata
     cruda.
   - Mantener full visual QA como aceptación general, no único diagnóstico.

5. Beta 2.7.6 - Documentar y cerrar dominio Dashboard.
   - Actualizar `src/lib/dashboard/README.md`.
   - Actualizar `docs/DASHBOARD_OPERATIVE_MODEL.md` si sigue desactualizado.
   - Registrar deudas reales y suite e2e actual.

## 11. Que NO conviene hacer

- No mover dashboard a Client Components.
- No consultar Supabase desde componentes.
- No exponer datos internos innecesarios.
- No duplicar reglas de permisos fuera de services/RLS.
- No cambiar permisos sin fase explícita.
- No tocar RLS/migrations.
- No mezclar rediseño UI con consolidación de código.
- No convertir el dashboard en sistema analítico complejo.
- No crear `src/services`.
- No agregar métricas financieras o productividad individual sin decisión
  funcional y de seguridad.
- No devolver metadata cruda de historial a componentes.
- No filtrar trabajador solo ocultando UI; mantener loaders server-side y RLS.

## 12. Checklist de cierre de auditoría

- [x] Reviso `src/lib/dashboard`.
- [x] Reviso `src/components/dashboard`.
- [x] Reviso `src/app/dashboard`.
- [x] Reviso visibilidad por rol.
- [x] Reviso permisos.
- [x] Reviso relación con Pedidos.
- [x] Reviso relación con Solicitudes.
- [x] Reviso relación con Clientes.
- [x] Reviso relación con Usuarios.
- [x] Reviso relación con Storage.
- [x] Reviso riesgos de exposición.
- [x] Propuso subfases.
- [x] No modifico código funcional.

## 13. Cierre documental Beta 2.7.6

Estado de subfases:

- [x] Beta 2.7.1 - Auditoria focal de Dashboard, actividad y work-items.
- [x] Beta 2.7.2 - Consolidar tipos y DTOs de Dashboard.
- [x] Beta 2.7.3 - Consolidar loaders y mappers de resumen/actividad.
- [x] Beta 2.7.4 - Revisar work-items y dashboard de trabajador.
- [x] Beta 2.7.5 - QA e2e focal de Dashboard por rol y estabilizacion de login e2e.
- [x] Beta 2.7.6 - Cierre documental del dominio Dashboard.

Estado final del dominio:

- `/dashboard` consume `getDashboard()` como fachada principal.
- `getDashboardContext()` resuelve perfil activo, valida `dashboard.view` y
  clasifica el resultado como `management` o `worker`.
- `types.ts` se mantiene como archivo único de contratos del dominio; no se
  dividió porque la separación no reducía complejidad real.
- DTOs y errores seguros quedaron consolidados sin metadata cruda, `file_path`,
  bucket, signed URLs, datos Auth, `service_role`, `SUPABASE_SERVICE_ROLE_KEY`
  ni errores SQL/Postgres expuestos a componentes.
- `activity-mappers.ts` extrae mappers seguros de historial de pedidos y
  solicitudes con allowlist de campos visibles.
- Work-items y summary usan `workflow_type` para la regla "sin tareas".
- `workflow_type` confirmado para Dashboard: `encargo` e `impresion`.
- Solo `encargo` requiere tareas obligatorias; `impresion` puede avanzar sin
  tareas internas.
- `doesPedidoWorkflowRequireTasks()` centraliza esta decisión.
- El progreso de tareas se reutiliza desde Pedidos mediante
  `loadTaskProgressByPedidoId`.
- El dashboard de trabajador esta integrado en `DashboardOverview`,
  `DashboardAttentionPanel` y `DashboardWorkPanels` con DTOs `kind: "worker"`;
  no existe `WorkerDashboardPanel.tsx`.
- `trabajador` no recibe solicitudes generales, clientes globales,
  usuarios/perfiles globales ni pedidos no asignados.
- `admin` y `supervisor` mantienen vista global de operación; `supervisor` no
  recibe usuarios/configuración.
- Los componentes de Dashboard no consultan Supabase y no son autoridad de
  permisos.
- Proxy, loaders server-side y RLS siguen siendo la defensa efectiva por rol.

QA final registrado:

- `tests/e2e/dashboard.spec.ts` cubre dashboard admin, supervisor y trabajador,
  rutas protegidas, visibilidad por rol y ausencia visible de términos
  sensibles.
- `tests/e2e/helpers/assertions.ts` incluye términos sensibles de Dashboard y
  Storage: `file_path`, bucket, `godel-files`, signed URLs, `metadata`,
  `auth.users`, `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, `SQL`, `Postgres`
  y stack traces.
- `tests/e2e/helpers/auth.ts` quedó endurecido para ejecución paralela:
  limpia cookies/storage, espera botón habilitado, espera URL final
  `/dashboard` y espera heading renderizado.
- Suite e2e Chromium local actual: 23 tests, 23/23 pasando en paralelo después
  del ajuste de `loginAs`.

Deudas técnicas reales:

- Summary management usa varias queries independientes; aceptable para MVP,
  medir antes de optimizar.
- Si crecen métricas o volumen, evaluar RPC o agregación dedicada en fase
  explícita.
- El dashboard no debe convertirse en sistema analítico complejo sin decisión
  funcional.
- Full visual QA sigue dependiendo del build con Google Fonts/red.
- Mantener vigilancia de QA por rol si cambian permisos, RLS o navegación.
- Cualquier cambio de permisos debe coordinar TypeScript, RLS, documentación y
  QA.
- La estabilidad e2e paralela debe seguir observándose en CI, aunque la suite
  local paso 23/23 en paralelo después del ajuste.

Restricciones de cierre:

- No se modifico código funcional en Beta 2.7.6.
- No se tocaron componentes, servicios TypeScript, tests, migraciones, RLS,
  policies, route handlers ni dependencias.
