# Servicios del Dashboard Operativo

Esta capa contiene servicios server-side para calcular métricas básicas del dashboard operativo de Godel Diseño.

## Roles soportados

- `admin`: recibe resumen global de operación.
- `supervisor`: recibe resumen global de operación.
- `trabajador`: recibe únicamente métricas derivadas de sus pedidos asignados.

## Servicios

| Servicio | Uso |
| --- | --- |
| `getDashboardSummary()` | Punto de entrada principal. Lee el perfil actual, valida `dashboard.view` y decide el resumen según rol. |
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

## Seguridad

- Las consultas se ejecutan server-side.
- Se usa `createClient` normal de Supabase.
- Se valida perfil interno activo mediante `getCurrentProfile()`.
- Se valida el permiso `dashboard.view`.
- No se usa service role key.
- No se consulta `auth.users`.
- No se exponen `file_path`, rutas privadas ni URLs.
- RLS sigue siendo la defensa final para todas las consultas.

## Fuera de esta subfase

- UI del dashboard.
- Componentes visuales.
- Gráficos.
- Actividad reciente.
- Reportes avanzados.
- Notificaciones.
- Cambios de RLS o migraciones.

La UI se implementará en subfases posteriores usando estos servicios como capa de lectura.
