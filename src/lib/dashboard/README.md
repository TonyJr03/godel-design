# Servicios del Dashboard Operativo

Esta capa contiene servicios server-side para calcular métricas básicas del dashboard operativo de Godel Diseño.

Desde la Fase 13.3, `/dashboard` consume `getDashboardSummary()` y muestra tarjetas reales de resumen operativo. Desde la Fase 13.4 también consume `getDashboardWorkItems()` para mostrar paneles operativos simples. Desde la Fase 13.5 consume `getDashboardRecentActivity()` para mostrar actividad reciente mínima. La página sigue siendo Server Component: carga datos en servidor y delega el renderizado en componentes presentacionales.

## Roles soportados

- `admin`: recibe resumen global de operación.
- `supervisor`: recibe resumen global de operación.
- `trabajador`: recibe únicamente métricas derivadas de sus pedidos asignados.

## Servicios

| Servicio | Uso |
| --- | --- |
| `getDashboardSummary()` | Punto de entrada principal. Lee el perfil actual, valida `dashboard.view` y decide el resumen según rol. |
| `getDashboardWorkItems()` | Carga listas operativas para orientar el trabajo diario según rol. |
| `getDashboardRecentActivity()` | Carga actividad reciente mínima desde historial de pedidos y solicitudes según rol. |
| `getWorkerDashboardSummary(workerProfileId)` | Resumen específico de pedidos asignados al trabajador autenticado. |

## Métricas de admin y supervisor

- Solicitudes nuevas.
- Solicitudes pendientes (`nueva`, `en_revision`, `contactada`).
- Solicitudes aprobadas pendientes de convertir.
- Pedidos activos.
- Pedidos en diseño.
- Pedidos en producción.
- Pedidos listos para entrega.
- Pedidos atrasados.
- Pedidos próximos a entrega.
- Clientes registrados.

## Métricas de trabajador

- Pedidos asignados activos.
- Pedidos asignados en diseño.
- Pedidos asignados en producción.
- Pedidos asignados listos para entrega.
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

Estos paneles son listas simples con enlaces internos a detalles de solicitud o pedido. No son reportes, no tienen paginación, no implementan filtros avanzados y no representan un feed completo de actividad reciente.

## Actividad reciente mínima

`admin` y `supervisor` ven actividad reciente de pedidos y solicitudes.

`trabajador` ve únicamente actividad reciente de pedidos accesibles por RLS, es decir, pedidos asignados.

La actividad reciente usa resúmenes construidos de forma controlada. No se muestra `metadata` cruda, JSON completo, `file_path`, rutas privadas ni URLs. Esta sección no es un sistema de notificaciones ni un reporte avanzado.

## Seguridad

- Las consultas se ejecutan server-side.
- `/dashboard` no consulta Supabase directamente desde componentes cliente.
- Se usa `createClient` normal de Supabase.
- Se valida perfil interno activo mediante `getCurrentProfile()`.
- Se valida el permiso `dashboard.view`.
- No se usa service role key.
- No se consulta `auth.users`.
- No se muestra `metadata` cruda en la UI.
- No se exponen `file_path`, rutas privadas ni URLs.
- RLS sigue siendo la defensa final para todas las consultas.

## Fuera de esta subfase

- Gráficos.
- Reportes avanzados.
- Notificaciones.
- Exportaciones.
- Cambios de RLS o migraciones.

La UI implementada hasta Fase 13.5 se limita a tarjetas de resumen, paneles operativos simples y actividad reciente mínima. Actividad reciente avanzada, gráficos, reportes avanzados, exportaciones y notificaciones quedan para subfases posteriores.
