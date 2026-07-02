# Servicios del Dashboard Operativo

Esta capa contiene servicios server-side para calcular métricas básicas del dashboard operativo de Godel Diseño.

`/dashboard` consume `getDashboard()`, que obtiene un contexto compartido de perfil/rol una sola vez y luego carga en paralelo resumen, paneles operativos y actividad reciente. La página sigue siendo Server Component: carga datos en servidor y delega el renderizado en componentes presentacionales.

## Roles soportados

- `admin`: recibe resumen global de operación.
- `supervisor`: recibe resumen global de operación.
- `trabajador`: recibe únicamente métricas derivadas de sus pedidos asignados.

## Servicios

| Servicio | Uso |
| --- | --- |
| `getDashboard()` | Punto de entrada único para `/dashboard`. Resuelve contexto una vez y carga resumen, paneles y actividad en paralelo. |
| `getDashboardContext()` | Helper interno del módulo. Lee el perfil actual, valida `dashboard.view` y clasifica el dashboard como `management` o `worker`. |
| `loadDashboardSummary(context)` | Loader interno para métricas de resumen. |
| `loadDashboardWorkItems(context)` | Loader interno para listas operativas. |
| `loadDashboardRecentActivity(context)` | Loader interno para actividad reciente. |

Los loaders internos no se exportan desde el barrel del módulo. La API pública prevista para la página es `getDashboard()`.

## Contratos de tipos y DTOs

Decision Beta 2.7.2: se mantiene `src/lib/dashboard/types.ts` como archivo
unico de contratos del dominio. El tamano actual sigue siendo legible y la
division en `summary-types.ts`, `work-items-types.ts` y `activity-types.ts`
agregaria imports sin reducir complejidad real.

Los tipos se organizan por rol y subflujo:

- roles `management` (`admin` y `supervisor`) y `worker` (`trabajador`);
- resumen operativo por rol;
- work-items por rol;
- actividad reciente por rol;
- errores seguros compartidos por los resultados del dashboard.

Los DTOs visibles son allowlists para componentes. No exponen filas completas
de tablas, metadata cruda, `file_path`, bucket, signed URLs, datos de Auth,
errores SQL/Postgres/Supabase ni metricas financieras agregadas no decididas.
Los tipos de filas y shapes de queries permanecen internos a los loaders.

## Métricas de admin y supervisor

- Solicitudes nuevas.
- Solicitudes pendientes (`nueva`, `en_revision`, `contactada`).
- Solicitudes aprobadas pendientes de convertir.
- Pedidos activos.
- Pedidos en producción.
- Pedidos listos para entrega.
- Pedidos pendientes de revisión o en revisión sin tareas. Esta métrica todavía
  incluye impresiones, aunque ese flujo no requiere tareas para avanzar.
- Pedidos atrasados.
- Pedidos próximos a entrega.
- Clientes registrados.

## Métricas de trabajador

- Pedidos asignados activos.
- Pedidos asignados en producción.
- Pedidos asignados listos para entrega.
- Pedidos asignados pendientes de revisión o en revisión sin tareas. Esta
  métrica todavía no diferencia el flujo de impresión.
- Pedidos asignados atrasados.
- Pedidos asignados próximos a entrega.
- Total de pedidos asignados.

El trabajador no recibe solicitudes generales, clientes generales ni usuarios internos desde esta capa.

## Paneles operativos

`admin` y `supervisor` reciben:

- solicitudes pendientes;
- pedidos que requieren atención.

`trabajador` recibe:

- pedidos asignados que requieren atención.

Estos paneles son listas simples con enlaces internos a detalles de solicitud o
pedido. Los pedidos `creado` y `solicitud_recibida` se consideran activos, se
priorizan como pendientes de revisión y siguen mostrando `Sin tareas` cuando
corresponde. Esa señal aún incluye impresiones sin tareas, aunque puedan avanzar
válidamente; el ajuste por `workflow_type` queda como deuda del dashboard. No
son reportes, no tienen paginación, no implementan filtros avanzados y no
representan un feed completo de actividad reciente.

## Actividad reciente mínima

`admin` y `supervisor` ven actividad reciente de pedidos y solicitudes.

`trabajador` ve únicamente actividad reciente de pedidos accesibles por RLS, es decir, pedidos asignados.

La actividad reciente usa resúmenes construidos de forma controlada. No se muestra `metadata` cruda, JSON completo, `file_path`, rutas privadas ni URLs. Esta sección no es un sistema de notificaciones ni un reporte avanzado.

Desde Beta 2.7.3, los mappers de actividad viven en `activity-mappers.ts`. Ese
archivo mantiene los tipos de rows internas de historial y una allowlist
explicita de campos de metadata que pueden convertirse en texto visible:
`file_name`, `title`, `client_name`, `pedido_numero` y `order_number`. El loader
`get-dashboard-activity.ts` conserva las queries, limites, orden y reglas por
rol, y delega solo la transformacion segura a DTO.

Los listados enlazados desde el dashboard mantienen sus búsquedas y filtros en
la URL mediante `ListFiltersBar`. La consulta se ejecuta server-side tras un
debounce de 200 ms y el trabajador continúa limitado a pedidos asignados.

## Seguridad

- Las consultas se ejecutan server-side.
- `/dashboard` no consulta Supabase directamente desde componentes cliente.
- Se usa `createClient` normal de Supabase.
- `getDashboard()` valida perfil interno activo y permiso `dashboard.view` una sola vez mediante `getDashboardContext()`.
- No se usa service role key.
- No se consulta `auth.users`.
- No se muestra `metadata` cruda en la UI.
- No se exponen `file_path`, rutas privadas ni URLs.
- RLS sigue siendo la defensa final para todas las consultas.

## Fuera de esta fase

- Gráficos.
- Reportes avanzados.
- Notificaciones.
- Exportaciones.
- Cambios de RLS o migraciones nuevas.

La UI implementada se limita a tarjetas de resumen, paneles operativos simples y actividad reciente mínima. Actividad reciente avanzada, gráficos, reportes avanzados, exportaciones y notificaciones quedan para fases posteriores.
