# Modelo de Dashboard Operativo

## Propósito

El dashboard operativo de Godel Diseño debe funcionar como una pantalla de trabajo diaria para usuarios internos. Su objetivo no es decorar la aplicación ni reemplazar los listados existentes, sino ayudar a decidir qué revisar primero, qué pedidos requieren atención y qué actividad reciente merece seguimiento.

La primera versión debe apoyarse en datos ya existentes de solicitudes, clientes, pedidos, archivos, comentarios, historial y perfiles internos, siempre respetando RLS y la matriz de permisos vigente.

## Dashboard operativo y reportes avanzados

El dashboard operativo responde preguntas inmediatas:

- qué solicitudes están pendientes de revisión;
- qué pedidos están activos;
- qué pedidos están cerca de entrega o atrasados;
- qué pedidos asignados debe atender un trabajador;
- qué actividad reciente conviene revisar.

Los reportes avanzados quedan fuera de esta fase. No se deben implementar gráficos, exportaciones, comparativos históricos, métricas financieras, rendimiento por usuario, tendencias mensuales ni análisis de productividad.

## Diagnóstico del estado actual

La ruta `/dashboard` existe y actualmente muestra una página base con `PageHeader` y `PlaceholderCard`. No consulta datos reales, no calcula métricas y no cambia su contenido según el rol.

El layout de dashboard (`src/app/dashboard/layout.tsx`) obtiene el perfil actual con `getCurrentProfile()` y pasa el rol al sidebar. La navegación visible se filtra con `canAccessDashboardRoute`.

La protección por URL está centralizada en `src/lib/supabase/proxy.ts`, que valida sesión, perfil interno activo y acceso a rutas del dashboard mediante la misma regla de rutas.

La matriz actual permite:

| Rol | Vista actual de `/dashboard` | Navegación visible actual |
| --- | --- | --- |
| `admin` | Placeholder general del dashboard. | Dashboard, solicitudes, pedidos, clientes, usuarios y configuración. |
| `supervisor` | Placeholder general del dashboard. | Dashboard, solicitudes, pedidos y clientes. |
| `trabajador` | Placeholder general del dashboard. | Dashboard y pedidos. |

Los módulos existentes ya ofrecen servicios server-side reutilizables como punto de partida conceptual:

- solicitudes: listado, detalle, comentarios e historial;
- clientes: listado, detalle y gestión interna;
- pedidos: listado, detalle, cambio de estado, asignación, comentarios e historial;
- archivos: listado y descarga controlada para solicitudes y pedidos;
- usuarios internos: perfiles en `public.profiles`, solo para administración.

## Información disponible sin crear tablas nuevas

La primera versión puede obtener información desde tablas existentes:

- `solicitudes`: estados, fecha de creación, fecha deseada, cliente asociado y pedido convertido;
- `pedidos`: estado, prioridad, fechas de creación y entrega estimada, entrega real, cliente, solicitud origen y supervisor;
- `pedido_trabajadores`: pedidos asignados a usuarios internos;
- `clientes`: clientes registrados;
- `archivos`: archivos recientes asociados a solicitudes o pedidos;
- `pedido_historial` y `solicitud_historial`: actividad operativa registrada;
- `pedido_comentarios` y `solicitud_comentarios`: comentarios recientes si se decide incluirlos en una vista de actividad;
- `profiles`: solo datos mínimos permitidos por RLS, nunca `auth.users`.

No hacen falta tablas nuevas para el MVP del dashboard. Sí harán falta consultas nuevas porque los listados actuales devuelven filas operativas limitadas, no agregados ni agrupaciones por estado.

## Información que requiere consultas nuevas

Las siguientes piezas requieren servicios específicos de dashboard:

- conteos agrupados por estado de solicitud;
- conteos agrupados por estado de pedido;
- pedidos atrasados, calculados por `fecha_entrega_estimada` anterior a la fecha actual y estado no final;
- pedidos próximos a entrega, calculados por una ventana corta y estado no final;
- pedidos entregados recientemente, calculados por `fecha_entrega_real` o por estado y fecha de actualización si se define;
- archivos recientes con relación mínima a solicitud o pedido;
- actividad reciente combinando historial de solicitudes e historial de pedidos;
- resumen específico del trabajador filtrado a pedidos asignados.

Estas consultas deben vivir en `src/lib/dashboard/*`, ejecutarse server-side y usar el cliente normal de Supabase.

## Información que no debe mostrarse todavía

La Fase 13.1 no debe mostrar ni diseñar como MVP:

- métricas financieras o de facturación;
- productividad individual del equipo;
- carga comparativa por trabajador;
- métricas administrativas de usuarios en el dashboard principal;
- emails o datos de Supabase Auth;
- datos globales de clientes o solicitudes a trabajadores;
- rutas privadas de archivos (`file_path`);
- URLs públicas o firmadas persistentes;
- auditoría legal completa;
- gráficos, reportes avanzados o notificaciones.

## Vista por rol

### Admin

El admin debe tener una visión global de operación diaria. La vista puede incluir solicitudes, pedidos, clientes, archivos y actividad reciente. No se recomienda mezclar gestión administrativa de usuarios en el dashboard operativo principal; esa gestión ya tiene su módulo.

Métricas esenciales para MVP:

- solicitudes nuevas;
- solicitudes en revisión;
- solicitudes aprobadas pendientes de convertir;
- pedidos activos;
- pedidos en diseño;
- pedidos en producción;
- pedidos listos para entrega;
- pedidos atrasados;
- clientes registrados;
- actividad reciente operativa si la consulta es viable sin abrir datos sensibles.

Métricas futuras:

- pedidos entregados recientemente;
- pedidos cancelados;
- archivos recientes;
- clientes nuevos por período;
- desglose por prioridad;
- carga de trabajo por persona;
- métricas de cumplimiento de fechas;
- tendencias históricas.

### Supervisor

El supervisor debe tener una vista muy similar a admin para operar el día a día, pero sin métricas de administración de usuarios ni accesos administrativos.

Métricas esenciales para MVP:

- solicitudes pendientes;
- solicitudes aprobadas pendientes de convertir;
- pedidos activos;
- pedidos próximos a entrega;
- pedidos atrasados;
- pedidos listos para entrega;
- actividad reciente operativa si puede filtrarse con RLS sin excepciones.

Métricas futuras:

- últimos archivos subidos;
- pedidos por prioridad;
- pedidos por supervisor;
- entregas recientes;
- tendencias de conversión de solicitudes.

### Trabajador

El trabajador debe ver una pantalla centrada en su trabajo asignado. No debe recibir una vista global del negocio.

Métricas esenciales para MVP:

- pedidos asignados activos;
- pedidos asignados en diseño;
- pedidos asignados en producción;
- pedidos asignados listos para entrega;
- pedidos asignados atrasados;
- próximos vencimientos de sus pedidos;
- lista breve de sus pedidos asignados más urgentes.

Métricas futuras:

- últimos comentarios de sus pedidos;
- historial reciente de sus pedidos;
- archivos recientes de sus pedidos;
- avisos internos derivados de actividad del pedido, si se implementan notificaciones en otra fase.

El trabajador no debe ver:

- solicitudes generales;
- clientes generales;
- usuarios internos;
- métricas globales sensibles;
- actividad de pedidos no asignados;
- archivos asociados solo a solicitudes.

## Métricas MVP recomendadas

La primera versión funcional del dashboard debe ser deliberadamente simple:

- tarjetas de resumen por rol;
- sección de "Solicitudes pendientes" para `admin` y `supervisor`;
- sección de "Pedidos activos" para `admin` y `supervisor`;
- sección de "Mis pedidos asignados" para `trabajador`;
- sección simple de actividad reciente solo si puede construirse con consultas claras, RLS y datos mínimos;
- sin gráficos;
- sin reportes avanzados;
- sin notificaciones.

Definición sugerida de estados:

| Concepto | Estados sugeridos |
| --- | --- |
| Solicitudes pendientes | `nueva`, `en_revision`, `contactada` |
| Solicitudes aprobadas pendientes de convertir | `aprobada` con `converted_order_id` nulo |
| Pedidos activos | todos salvo `entregado` y `cancelado` |
| Pedidos en diseño | `en_diseno` |
| Pedidos en producción | `en_produccion` |
| Pedidos listos | `listo_entrega` |
| Pedidos atrasados | `fecha_entrega_estimada` vencida y estado distinto de `entregado` o `cancelado` |
| Próximos vencimientos | `fecha_entrega_estimada` dentro de una ventana corta y estado activo |

## Métricas futuras

Quedan para fases posteriores:

- gráficos de evolución;
- reportes por período;
- productividad por usuario;
- carga de trabajo por persona;
- entregas a tiempo contra atrasadas;
- tiempo medio desde solicitud a pedido;
- tiempo medio por estado;
- archivos recientes globales;
- comentarios recientes agregados;
- exportaciones;
- notificaciones;
- panel administrativo de salud del sistema.

## Estructura técnica propuesta

No se deben crear estos archivos en Fase 13.1. La estructura recomendada para siguientes subfases es:

```text
src/lib/dashboard/get-dashboard-summary.ts
src/lib/dashboard/get-dashboard-activity.ts
src/lib/dashboard/get-worker-dashboard.ts
src/lib/dashboard/types.ts
src/lib/dashboard/index.ts
src/components/dashboard/DashboardSummaryCards.tsx
src/components/dashboard/DashboardPendingRequests.tsx
src/components/dashboard/DashboardActiveOrders.tsx
src/components/dashboard/DashboardRecentActivity.tsx
src/components/dashboard/WorkerDashboardPanel.tsx
```

Responsabilidades sugeridas:

| Archivo | Responsabilidad |
| --- | --- |
| `get-dashboard-summary.ts` | Conteos agregados para admin y supervisor. |
| `get-worker-dashboard.ts` | Resumen y lista breve de pedidos asignados al trabajador. |
| `get-dashboard-activity.ts` | Actividad reciente mínima, si se implementa. |
| `types.ts` | Tipos compartidos del dashboard. |
| `DashboardSummaryCards.tsx` | Tarjetas de resumen sin consultas directas. |
| `DashboardPendingRequests.tsx` | Lista breve de solicitudes pendientes. |
| `DashboardActiveOrders.tsx` | Lista breve de pedidos activos o urgentes. |
| `WorkerDashboardPanel.tsx` | Panel centrado en pedidos asignados. |

## Reglas de seguridad

- Todas las consultas del dashboard deben ejecutarse server-side.
- Se debe usar `createClient` normal de Supabase desde `src/lib/supabase/server.ts`.
- No se debe usar service role key.
- No se debe agregar `SUPABASE_SERVICE_ROLE_KEY`.
- No se debe consultar `auth.users`.
- Las consultas deben respetar RLS.
- La página debe leer el perfil interno activo antes de decidir la vista.
- Las métricas deben filtrarse según rol.
- `admin` y `supervisor` pueden recibir datos globales de operación.
- `trabajador` solo debe recibir datos de pedidos asignados.
- Los componentes cliente no deben consultar Supabase directamente.
- No se deben exponer `file_path`, rutas privadas ni URLs persistentes.
- La navegación visible no sustituye validaciones server-side ni RLS.

## Subfases recomendadas para Fase 13

1. Fase 13.1: diagnóstico y modelo del dashboard operativo.
2. Fase 13.2: servicios server-side de resumen por rol, sin UI compleja.
3. Fase 13.3: tarjetas MVP para `admin` y `supervisor`.
4. Fase 13.4: panel "Mis pedidos asignados" para `trabajador`.
5. Fase 13.5: listas breves de solicitudes pendientes y pedidos activos.
6. Fase 13.6: actividad reciente mínima si las consultas quedan claras y seguras.
7. Fase 13.7: documentación, pruebas manuales y cierre.

## Fuera de alcance

Queda fuera de esta fase:

- implementar métricas funcionales;
- conectar `/dashboard` a consultas reales;
- crear componentes visuales nuevos;
- modificar migraciones;
- modificar RLS;
- cambiar la matriz de permisos;
- usar service role key;
- consultar `auth.users`;
- instalar dependencias;
- modificar `docs/ROADMAP.md`;
- implementar gráficos;
- implementar reportes avanzados;
- implementar notificaciones.

## Cierre

El dashboard operativo debe avanzar como una capa de lectura server-side sobre los módulos existentes. La prioridad del MVP es mostrar trabajo pendiente y pedidos relevantes por rol, no crear análisis avanzado ni nuevas reglas de negocio.
