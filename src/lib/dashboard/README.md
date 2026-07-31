# Servicios del Dashboard Operativo

Esta capa contiene la lógica server-side del dashboard operativo de Godel
Diseño. Su responsabilidad es preparar DTOs seguros para `/dashboard`, separados
por rol, sin convertir la pantalla en un módulo analítico complejo ni duplicar
reglas de otros dominios.

`/dashboard` consume `getDashboard()` como fachada principal. La página es un
Server Component: carga datos en servidor, recibe resultados controlados y
delega el render en componentes presentacionales.

## Mapa de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `index.ts` | API pública del dominio. Exporta `getDashboard()` y contratos consumidos por la UI. |
| `types.ts` | DTOs y resultados discriminados para summary, work-items, actividad, roles `management`/`worker` y errores seguros. |
| `context.ts` | `getDashboardContext()`: obtiene perfil activo, valida `dashboard.view` y clasifica el rol de dashboard. |
| `get-dashboard.ts` | Orquestador. Resuelve contexto una vez y carga summary, work-items y actividad en paralelo. |
| `get-dashboard-summary.ts` | Summary global para `admin`/`supervisor`; reutiliza progreso de tareas desde Pedidos. |
| `get-worker-dashboard.ts` | Summary de trabajador limitado a pedidos asignados. |
| `get-dashboard-work-items.ts` | Grupo de solicitudes pendientes y tablero de pedidos agrupado por rol. |
| `get-dashboard-activity.ts` | Queries de actividad reciente por rol. Delega transformaciones seguras en mappers. |
| `activity-mappers.ts` | Mappers seguros de historial de pedidos/solicitudes hacia texto visible. |
| `helpers.ts` | Fechas, estados operativos y `doesPedidoWorkflowRequireTasks()`. |

Los loaders internos no se exportan desde el barrel. La entrada esperada para la
ruta sigue siendo `getDashboard()`.

## Contexto y roles

`getDashboardContext()` usa el perfil interno activo y valida el permiso
`dashboard.view`. Después clasifica:

- `management`: `admin` y `supervisor`.
- `worker`: `trabajador`.

La UI visible y el sidebar ayudan a la experiencia, pero no son autoridad de
seguridad. Los loaders filtran server-side por rol y RLS queda como defensa
final.

## Summary

### Management

`admin` y `supervisor` reciben métricas globales de operación:

- solicitudes nuevas;
- solicitudes pendientes;
- solicitudes aprobadas sin convertir;
- pedidos activos;
- pedidos en producción;
- pedidos listos para entrega;
- pedidos de tipo `encargo` pendientes de revisión o en revisión sin tareas;
- pedidos atrasados;
- pedidos próximos a entrega;
- clientes registrados.

`get-dashboard-summary.ts` usa varias queries independientes. Es aceptable para
MVP; si crecen las métricas, se debe medir antes de optimizar y evaluar una RPC
o agregación dedicada solo en una fase explícita.

### Worker

`trabajador` recibe solo métricas derivadas de pedidos asignados:

- total de pedidos asignados;
- asignados activos;
- asignados en producción;
- asignados listos para entrega;
- asignados de tipo `encargo` sin tareas cuando corresponde;
- asignados atrasados;
- asignados próximos a entrega.

El trabajador no recibe solicitudes generales, clientes globales,
usuarios/perfiles globales ni pedidos no asignados desde esta capa.

## Work-Items

`admin` y `supervisor` reciben:

- grupo de solicitudes pendientes;
- tablero de pedidos agrupado.

`trabajador` recibe:

- tablero de pedidos asignados agrupado.

Los grupos operativos separan siempre conteos y previews:

- `totalCount`: conteo exacto server-side con Supabase y RLS.
- `items`: DTOs limitados que necesita renderizar la UI.
- `moreCount`: `max(0, totalCount - items.length)`.

Solicitudes pendientes muestra hasta 8 solicitudes. El conteo incluye `nueva`,
`en_revision`, `contactada` y `aprobada` solo cuando
`converted_order_id IS NULL`; el preview prioriza `nueva` y luego el resto por
fecha reciente. El tablero de pedidos consulta cada grupo por separado
(`nuevos`, `enRevision`, `enProduccion`, `listosEntrega`) para que un grupo no
consuma el cupo de otro. `listosEntrega` muestra hasta 8 pedidos.

Los pedidos se priorizan por revisión pendiente, atraso, entrega próxima,
revisión sin tareas, producción con tareas pendientes y listo para entrega.
Desde Beta 2.7.4, las señales "sin tareas" usan `workflow_type`: solo
`encargo` requiere tareas obligatorias; `impresion` puede avanzar válidamente
sin tareas internas.

La regla vive en `doesPedidoWorkflowRequireTasks()` y hoy confirma
`workflow_type = encargo` como flujo que requiere tareas. Los tipos confirmados
son `encargo` e `impresion`.

El dashboard reutiliza `loadTaskProgressByPedidoId` desde Pedidos para evitar
drift en el cálculo de progreso de tareas.

## Actividad Reciente

`admin` y `supervisor` ven actividad reciente combinada de pedidos y
solicitudes. El historial usa una ventana móvil de 7 días exactos, calculada
como 168 horas desde el instante de carga. Si existen 20 o más eventos
accesibles dentro de esa ventana, se devuelven todos. Si hay menos de 20, se
completa con los eventos anteriores más recientes hasta llegar a 20 cuando
existan. Si existen menos de 20 eventos totales, se muestra todo lo disponible.

`trabajador` ve únicamente actividad reciente de pedidos accesibles por RLS, es
decir, pedidos asignados. No recibe historial de solicitudes ni actividad de
pedidos no accesibles.

El tablero de trabajador aplica la misma separación entre conteos exactos y
previews limitados, pero todo conteo y candidato se filtra server-side con
`pedido_trabajadores.assigned_profile_id = perfil actual`. RLS sigue siendo la
defensa final y el trabajador no recibe pedidos no asignados.

`get-dashboard-activity.ts` página server-side la actividad semanal por rangos
técnicos para evitar límites silenciosos de PostgREST. Las consultas de respaldo
solo se ejecutan cuando la ventana semanal tiene menos de 20 eventos y se
limitan a los 20 eventos más recientes por fuente. No hay paginación visual en
esta etapa: el panel contextual usa su scroll interno.

`activity-mappers.ts` transforma rows de historial a DTOs visibles mediante
allowlist. Puede convertir a texto campos controlados como `file_name`, `title`,
`client_name`, `pedido_numero` y `order_number`, pero no entrega metadata cruda
a componentes.

## DTOs y Errores Seguros

`types.ts` se mantiene como archivo único del dominio. La división en varios
archivos de tipos no redujo complejidad real en Beta 2.7, así que se conserva
la API local concentrada.

Los DTOs visibles son allowlists. No deben exponer:

- filas completas de tablas;
- `metadata` cruda;
- `file_path`;
- bucket;
- signed URLs;
- rutas privadas de Storage;
- datos de Supabase Auth;
- `service_role`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- errores SQL/Postgres/Supabase;
- métricas financieras agregadas sin decisión funcional explícita.

Los errores devueltos por loaders son mensajes seguros para UI. Los detalles
técnicos permanecen fuera de los componentes.

## Visibilidad Por Rol

| Rol | Puede ver | No debe recibir |
| --- | --- | --- |
| `admin` | Dashboard global, solicitudes pendientes, pedidos de atención, actividad de pedidos/solicitudes y navegación completa. | Secretos, datos Auth, metadata cruda, Storage interno o errores técnicos. |
| `supervisor` | Dashboard global, solicitudes pendientes, pedidos de atención, actividad de pedidos/solicitudes, solicitudes, pedidos y clientes. | Usuarios, configuración, secretos, datos Auth, Storage interno o metadata cruda. |
| `trabajador` | Resumen de pedidos asignados, tablero de pedidos asignados y actividad de pedidos accesibles. | Solicitudes generales, clientes globales, usuarios/perfiles globales, configuración, pedidos no asignados, métricas financieras agregadas. |

Los permisos no dependen solo del sidebar: proxy, loaders server-side y RLS
deben mantenerse alineados.

## Relaciones Con Otros Dominios

- Pedidos: estados, labels, progreso de tareas, asignaciones, historial y
  `workflow_type`.
- Solicitudes: solicitudes pendientes, conversión a pedidos e historial para
  management.
- Clientes: conteos globales y nombres visibles en pedidos/work-items cuando el
  rol lo permite.
- Usuarios/perfiles: solo perfil activo y nombres permitidos por RLS; nunca
  `auth.users`.
- Storage: solo aparece indirectamente por eventos de historial; no se exponen
  rutas privadas, bucket, `file_path`, metadata cruda ni signed URLs.
- Permissions: `dashboard.view`, reglas de rutas protegidas y matriz por rol.
- RLS: defensa final para pedidos, tareas, clientes, perfiles e historiales.

## QA E2E

Beta 2.7.5 agregó `tests/e2e/dashboard.spec.ts` con cobertura focal:

- dashboard admin;
- dashboard supervisor;
- dashboard trabajador;
- rutas protegidas;
- ausencia visible de términos sensibles;
- visibilidad por rol;
- trabajador sin solicitudes, clientes, usuarios ni configuración global;
- supervisor sin usuarios ni configuración;
- admin con vista global esperada.

También se endureció `tests/e2e/helpers/auth.ts` para ejecución paralela:

- limpia cookies y storage antes del login;
- espera el botón habilitado;
- espera URL final `/dashboard`;
- espera heading de dashboard renderizado.

Después del ajuste, la suite Chromium local pasó 23/23 en paralelo. La
estabilidad e2e paralela debe seguir observándose en CI.

## Deudas Técnicas Conocidas

- Summary management usa varias queries independientes; aceptable para MVP,
  medir antes de optimizar.
- Si crecen métricas o volumen, evaluar RPC o agregación dedicada en una fase
  explícita.
- El dashboard no debe convertirse en sistema analítico complejo sin decisión
  funcional.
- Full visual QA sigue dependiendo del build con Google Fonts/red.
- Mantener vigilancia de QA por rol si cambian permisos, RLS o sidebar.
- Cualquier cambio de permisos debe coordinar TypeScript, RLS, documentación y
  QA.

## Qué no hacer

- No consultar Supabase desde componentes.
- No mover reglas de permisos a UI.
- No exponer `metadata`, `file_path`, bucket ni signed URLs.
- No agregar datos Auth ni `service_role`.
- No agregar métricas financieras sin decisión funcional explícita.
- No crear `src/services` ni mover archivos por estética.
- No cambiar RLS, policies o migraciones desde este dominio sin fase explícita.
- No convertir el dashboard en reportería avanzada, gráficos, exportaciones o
  notificaciones sin alcance funcional aprobado.
