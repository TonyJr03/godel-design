# Servicios del Dashboard Operativo

Esta capa contiene la logica server-side del dashboard operativo de Godel
Diseno. Su responsabilidad es preparar DTOs seguros para `/dashboard`, separados
por rol, sin convertir la pantalla en un modulo analitico complejo ni duplicar
reglas de otros dominios.

`/dashboard` consume `getDashboard()` como fachada principal. La pagina es un
Server Component: carga datos en servidor, recibe resultados controlados y
delega el render en componentes presentacionales.

## Mapa de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `index.ts` | API publica del dominio. Exporta `getDashboard()` y contratos consumidos por la UI. |
| `types.ts` | DTOs y resultados discriminados para summary, work-items, actividad, roles `management`/`worker` y errores seguros. |
| `context.ts` | `getDashboardContext()`: obtiene perfil activo, valida `dashboard.view` y clasifica el rol de dashboard. |
| `get-dashboard.ts` | Orquestador. Resuelve contexto una vez y carga summary, work-items y actividad en paralelo. |
| `get-dashboard-summary.ts` | Summary global para `admin`/`supervisor`; reutiliza progreso de tareas desde Pedidos. |
| `get-worker-dashboard.ts` | Summary de trabajador limitado a pedidos asignados. |
| `get-dashboard-work-items.ts` | Solicitudes/pedidos de atencion para management y pedidos asignados para worker. |
| `get-dashboard-activity.ts` | Queries de actividad reciente por rol. Delega transformaciones seguras en mappers. |
| `activity-mappers.ts` | Mappers seguros de historial de pedidos/solicitudes hacia texto visible. |
| `helpers.ts` | Fechas, estados operativos y `doesPedidoWorkflowRequireTasks()`. |

Los loaders internos no se exportan desde el barrel. La entrada esperada para la
ruta sigue siendo `getDashboard()`.

## Contexto y roles

`getDashboardContext()` usa el perfil interno activo y valida el permiso
`dashboard.view`. Despues clasifica:

- `management`: `admin` y `supervisor`.
- `worker`: `trabajador`.

La UI visible y el sidebar ayudan a la experiencia, pero no son autoridad de
seguridad. Los loaders filtran server-side por rol y RLS queda como defensa
final.

## Summary

### Management

`admin` y `supervisor` reciben metricas globales de operacion:

- solicitudes nuevas;
- solicitudes pendientes;
- solicitudes aprobadas sin convertir;
- pedidos activos;
- pedidos en produccion;
- pedidos listos para entrega;
- pedidos de tipo `encargo` pendientes de revision o en revision sin tareas;
- pedidos atrasados;
- pedidos proximos a entrega;
- clientes registrados.

`get-dashboard-summary.ts` usa varias queries independientes. Es aceptable para
MVP; si crecen las metricas, se debe medir antes de optimizar y evaluar una RPC
o agregacion dedicada solo en una fase explicita.

### Worker

`trabajador` recibe solo metricas derivadas de pedidos asignados:

- total de pedidos asignados;
- asignados activos;
- asignados en produccion;
- asignados listos para entrega;
- asignados de tipo `encargo` sin tareas cuando corresponde;
- asignados atrasados;
- asignados proximos a entrega.

El trabajador no recibe solicitudes generales, clientes globales,
usuarios/perfiles globales ni pedidos no asignados desde esta capa.

## Work-Items

`admin` y `supervisor` reciben:

- solicitudes pendientes;
- pedidos que requieren atencion.

`trabajador` recibe:

- pedidos asignados que requieren seguimiento.

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

Los pedidos se priorizan por revision pendiente, atraso, entrega proxima,
revision sin tareas, produccion con tareas pendientes y listo para entrega.
Desde Beta 2.7.4, las senales "sin tareas" usan `workflow_type`: solo
`encargo` requiere tareas obligatorias; `impresion` puede avanzar validamente
sin tareas internas.

La regla vive en `doesPedidoWorkflowRequireTasks()` y hoy confirma
`workflow_type = encargo` como flujo que requiere tareas. Los tipos confirmados
son `encargo` e `impresion`.

El dashboard reutiliza `loadTaskProgressByPedidoId` desde Pedidos para evitar
drift en el calculo de progreso de tareas.

## Actividad Reciente

`admin` y `supervisor` ven actividad reciente de pedidos y solicitudes.

`trabajador` ve unicamente actividad reciente de pedidos accesibles por RLS, es
decir, pedidos asignados.

El tablero de trabajador aplica la misma separacion entre conteos exactos y
previews limitados, pero todo conteo y candidato se filtra server-side con
`pedido_trabajadores.assigned_profile_id = perfil actual`. RLS sigue siendo la
defensa final y el trabajador no recibe pedidos no asignados.

`get-dashboard-activity.ts` conserva queries, limites, orden y reglas por rol.
`activity-mappers.ts` transforma rows de historial a DTOs visibles mediante
allowlist. Puede convertir a texto campos controlados como `file_name`, `title`,
`client_name`, `pedido_numero` y `order_number`, pero no entrega metadata cruda
a componentes.

## DTOs y Errores Seguros

`types.ts` se mantiene como archivo unico del dominio. La division en varios
archivos de tipos no redujo complejidad real en Beta 2.7, asi que se conserva
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
- metricas financieras agregadas sin decision funcional explicita.

Los errores devueltos por loaders son mensajes seguros para UI. Los detalles
tecnicos permanecen fuera de los componentes.

## Visibilidad Por Rol

| Rol | Puede ver | No debe recibir |
| --- | --- | --- |
| `admin` | Dashboard global, solicitudes pendientes, pedidos de atencion, actividad de pedidos/solicitudes y navegacion completa. | Secretos, datos Auth, metadata cruda, Storage interno o errores tecnicos. |
| `supervisor` | Dashboard global, solicitudes pendientes, pedidos de atencion, actividad de pedidos/solicitudes, solicitudes, pedidos y clientes. | Usuarios, configuracion, secretos, datos Auth, Storage interno o metadata cruda. |
| `trabajador` | Resumen de pedidos asignados, pedidos asignados que requieren seguimiento y actividad de pedidos accesibles. | Solicitudes generales, clientes globales, usuarios/perfiles globales, configuracion, pedidos no asignados, metricas financieras agregadas. |

Los permisos no dependen solo del sidebar: proxy, loaders server-side y RLS
deben mantenerse alineados.

## Relaciones Con Otros Dominios

- Pedidos: estados, labels, progreso de tareas, asignaciones, historial y
  `workflow_type`.
- Solicitudes: solicitudes pendientes, conversion a pedidos e historial para
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

Beta 2.7.5 agrego `tests/e2e/dashboard.spec.ts` con cobertura focal:

- dashboard admin;
- dashboard supervisor;
- dashboard trabajador;
- rutas protegidas;
- ausencia visible de terminos sensibles;
- visibilidad por rol;
- trabajador sin solicitudes, clientes, usuarios ni configuracion global;
- supervisor sin usuarios ni configuracion;
- admin con vista global esperada.

Tambien se endurecio `tests/e2e/helpers/auth.ts` para ejecucion paralela:

- limpia cookies y storage antes del login;
- espera el boton habilitado;
- espera URL final `/dashboard`;
- espera heading de dashboard renderizado.

Despues del ajuste, la suite Chromium local paso 23/23 en paralelo. La
estabilidad e2e paralela debe seguir observandose en CI.

## Deudas Tecnicas Conocidas

- Summary management usa varias queries independientes; aceptable para MVP,
  medir antes de optimizar.
- Si crecen metricas o volumen, evaluar RPC o agregacion dedicada en una fase
  explicita.
- El dashboard no debe convertirse en sistema analitico complejo sin decision
  funcional.
- Full visual QA sigue dependiendo del build con Google Fonts/red.
- Mantener vigilancia de QA por rol si cambian permisos, RLS o sidebar.
- Cualquier cambio de permisos debe coordinar TypeScript, RLS, documentacion y
  QA.

## Que No Hacer

- No consultar Supabase desde componentes.
- No mover reglas de permisos a UI.
- No exponer `metadata`, `file_path`, bucket ni signed URLs.
- No agregar datos Auth ni `service_role`.
- No agregar metricas financieras sin decision funcional explicita.
- No crear `src/services` ni mover archivos por estetica.
- No cambiar RLS, policies o migraciones desde este dominio sin fase explicita.
- No convertir el dashboard en reporteria avanzada, graficos, exportaciones o
  notificaciones sin alcance funcional aprobado.
