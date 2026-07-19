# Linea base de rendimiento - Etapa 15.1

Fecha: 2026-07-19

## 1. Resumen ejecutivo

La linea base confirma que el proyecto puede medirse localmente con build,
analyzer oficial de Next.js, auditoria estatica, recuentos de Supabase local y
documentacion de QA reciente. No se implemento ninguna optimizacion.

Hallazgos principales:

- Build limpio: 10.500 s, codigo 0.
- Build caliente: 10.064 s, codigo 0.
- `.next` despues del build: 31,842,258 bytes en limpio y 31,842,261 bytes en
  caliente.
- `next experimental-analyze --output`: 3.638 s, codigo 0, salida de 5,608,039
  bytes en `.next/diagnostics/analyze`.
- Mayor superficie cliente medida por analyzer: detalles internos de pedidos y
  solicitudes.
- Client Components: 49 archivos, 2 en `src/app` y 47 en `src/components`.
- Supabase local esta activo; dataset QA local contiene 668 pedidos, 371
  solicitudes, 213 clientes y 3,034 eventos de historial de pedido.
- `pg_stat_statements` esta disponible, pero sus estadisticas no estan aisladas
  a un flujo controlado de 15.1.
- El smoke E2E focal no quedo como medicion confiable porque Playwright detecto
  el puerto 3000 ocupado y el comando excedio 240 s.

Los resultados locales no son equivalentes a produccion.

## 2. Estado inicial

| Item | Resultado |
| --- | --- |
| Rama | `perf/measured-optimization` |
| Commit | `d17d82d merge: cerrar estados transversales` |
| Commit base esperado | `d17d82dd28a224c7591a1434a7e5d8ab2d618081` |
| `git status --short` inicial | Sin salida; arbol limpio |
| `node --version` | `v24.14.1` |
| `npm --version` | Falla por `npm.ps1` bloqueado por ExecutionPolicy |
| `npm.cmd --version` | `11.11.0` |
| `npx.cmd next --version` | `Next.js v16.2.6` |
| Next.js en `package.json` | `16.2.6` |
| React | `19.2.4` |
| lucide-react | `^1.23.0` |

## 3. Entorno

| Item | Resultado |
| --- | --- |
| Sistema operativo | Microsoft Windows 11 Pro |
| Version OS | 10.0.26200 |
| Arquitectura | 64-bit |
| CPU | Intel(R) Core(TM) Ultra 7 255H |
| Memoria fisica | 33,197,715,456 bytes |
| Modo | PowerShell en Windows, no WSL ni contenedor |
| Next build | Turbopack |
| Workers de build | Next reporto 15 workers para page data/static pages |
| Procesos relevantes | `node` PID 14472 ~1.3 GB WS, Docker backend, Brave, VS Code, ProtonVPN |

Docker/Supabase local:

- `supabase_db_godel-design`: Up 6 hours, healthy, puerto local 54322.
- `supabase_kong_godel-design`: Up 6 hours, healthy, puerto local 54321.
- `supabase_studio_godel-design`: Up 6 hours, healthy, puerto local 54323.
- Auth, Storage, Realtime, Inbucket, REST y pg_meta activos.

Configuracion relevante:

- `next.config.ts` solo define `experimental.proxyClientMaxBodySize` y
  `experimental.serverActions.bodySizeLimit` en `110mb`.
- `playwright.config.ts` usa `npm run dev`, baseURL `http://localhost:3000`,
  `reuseExistingServer: !process.env.CI`, Chromium y Edge.
- `supabase/config.toml` usa proyecto `godel-design`, DB 17, API 54321, DB
  54322, Studio 54323, Storage 50MiB y seed local habilitado.

## 4. Comandos usados

```text
git status --short
git branch --show-current
git log -1 --oneline
node --version
npm --version
npm.cmd --version
npx.cmd next --version
Get-ComputerInfo -Property OsName,OsVersion,OsArchitecture,CsProcessors,CsTotalPhysicalMemory
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
npm.cmd run build
npx.cmd next experimental-analyze --output
rg / Get-Content / Select-String para auditorias estaticas
docker exec supabase_db_godel-design psql ...
npx.cmd playwright test tests/e2e/smoke.spec.ts --project=chromium --workers=1
```

## 5. Build limpio

Procedimiento:

1. Se elimino solo `.next`.
2. Se ejecuto `npm.cmd run build`.

Resultado:

| Metrica | Valor |
| --- | --- |
| Duracion total | 10.500 s |
| Codigo de salida | 0 |
| Compilacion | 3.1 s |
| TypeScript | 4.6 s |
| Static pages | 17/17 en 293 ms |
| Tamaño `.next` | 31,842,258 bytes |
| Warnings | Solo aviso normal de experimentos Next |
| Errores | Ninguno |

Rutas generadas:

```text
/
/_not-found
/acceso-denegado
/apple-icon.png
/dashboard
/dashboard/[...notFound]
/dashboard/clientes
/dashboard/clientes/[id]
/dashboard/configuracion
/dashboard/configuracion/plantillas
/dashboard/configuracion/plantillas/[templateId]
/dashboard/configuracion/usuarios
/dashboard/pedidos
/dashboard/pedidos/[id]
/dashboard/pedidos/[id]/archivos/[fileId]/download
/dashboard/solicitudes
/dashboard/solicitudes/[id]
/dashboard/solicitudes/[id]/archivos/[fileId]/download
/estado
/icon.png
/login
/sin-permisos
/solicitud
```

## 6. Build caliente

Procedimiento:

1. No se elimino `.next`.
2. Se ejecuto `npm.cmd run build`.

Resultado:

| Metrica | Valor |
| --- | --- |
| Duracion total | 10.064 s |
| Codigo de salida | 0 |
| Compilacion | 2.5 s |
| TypeScript | 4.8 s |
| Static pages | 17/17 en 288 ms |
| Tamaño `.next` | 31,842,261 bytes |
| Warnings | Solo aviso normal de experimentos Next |
| Errores | Ninguno |

Interpretacion: el build caliente mejora la fase de compilacion, pero la
duracion total queda cerca del build limpio por TypeScript y page data.

## 7. Analisis de bundle

Comando:

```text
npx.cmd next experimental-analyze --output
```

Resultado:

| Metrica | Valor |
| --- | --- |
| Duracion | 3.638 s |
| Codigo de salida | 0 |
| Salida | `.next/diagnostics/analyze` |
| Tamaño salida analyzer | 5,608,039 bytes |

El analyzer de Next.js 16 escribe `.data` compactos con JSON inicial y cola
binaria. Se extrajeron agregados del JSON inicial.

Rutas con mayor superficie cliente sin comprimir:

| Ruta analyzer | Client bytes | Server bytes | Sources |
| --- | ---: | ---: | ---: |
| `/dashboard/pedidos/[id]` | 946,369 | 1,277,536 | 1,183 |
| `/dashboard/solicitudes/[id]` | 930,910 | 1,220,020 | 1,151 |
| `/dashboard/pedidos` | 912,599 | 1,143,472 | 1,088 |
| `/dashboard/configuracion/usuarios` | 903,797 | 1,067,678 | 1,039 |
| `/dashboard/configuracion/plantillas/[templateId]` | 900,183 | 1,086,361 | 1,056 |
| `/dashboard/configuracion/plantillas` | 898,822 | 1,073,618 | 1,047 |
| `/dashboard/clientes` | 898,314 | 1,050,176 | 1,030 |
| `/dashboard` | 896,160 | 1,175,524 | 1,104 |
| `/estado` | 888,438 | 935,456 | 882 |
| `/solicitud` | 876,161 | 949,771 | 937 |

Top fuentes cliente en `/dashboard/pedidos/[id]`:

| Fuente | Bytes | Compressed |
| --- | ---: | ---: |
| `react-dom-client.production.js` | 199,512 | 62,685 |
| `polyfill-nomodule.js` | 112,594 | 39,434 |
| `icon.022evkqffhxm3.png` | 86,546 | 0 |
| `globals.css` | 61,264 | 10,618 |
| `react-server-dom-turbopack-client.browser.production.js` | 24,190 | 7,829 |
| `PedidoTaskItem.tsx` | 6,548 | 1,804 |
| `PedidoWorkerAssignmentForm.tsx` | 5,467 | 1,958 |
| `PedidoTasksSection.tsx` | 4,895 | 1,709 |
| `WorkspaceTabletToolbar.tsx` | 4,053 | 1,680 |
| `WorkspaceController.tsx` | 3,983 | 1,680 |

Observaciones:

- Los workspaces internos tienen la mayor superficie cliente.
- Las rutas publicas `/solicitud` y `/estado` tambien incluyen formularios o
  retry cliente, pero quedan por debajo de los workspaces.
- `lucide-react` aparece fragmentado como iconos `.mjs`; ningun icono individual
  aparece como top dominante. Su impacto debe medirse por ruta en 15.2/15.3
  antes de decidir `optimizePackageImports`.
- No se detecta evidencia suficiente para mover boundaries en 15.1.
- La presencia de componentes de dominio en cliente coincide con formularios,
  acciones, workspace controller, dialogs y feedback.

## 8. Inventario de Client Components

Total: 49 archivos.

| Grupo | Cantidad | Proposito | Clasificacion 15.1 |
| --- | ---: | --- | --- |
| `src/app/*/error.tsx` | 2 | Error boundaries con retry | Justificado |
| `auth` | 1 | Login con Server Action | Justificado |
| `clientes` | 4 | Dialogs y forms de cliente | Justificado |
| `common` | 2 | Copia al portapapeles y filtros legacy | Revisar |
| `configuracion` | 5 | Dialogs/forms/lista interactiva de plantillas | Justificado/Revisar |
| `forms` | 2 | Dialog/drawer con foco y dirty close | Justificado |
| `layout` | 2 | Sidebar colapsable y nav activa | Justificado |
| `listing` | 3 | Toolbar URL, chips y filas clicables | Justificado/Revisar |
| `pedidos` | 9 | Forms, tareas, pagos, workers y dialog crear | Justificado/Revisar |
| `solicitudes` | 5 | Form publico, cliente, conversion, estado, comentarios | Justificado |
| `storage` | 1 | Upload de archivos | Justificado |
| `ui` | 2 | Retry y confirmacion inline | Justificado |
| `usuarios` | 4 | Dialogs/forms de usuarios | Justificado |
| `workspace` | 7 | Controller, contexto, rail, toolbar, dialog, barra movil | Justificado/Revisar |

Candidates de boundary amplio:

- `workspace/*`: necesarios para interaccion real, pero cargados en detalles de
  pedidos y solicitudes. Medir si hay partes que pueden quedar server-only.
- `PedidoTasksSection` y `PedidoTaskItem`: interaccion real, payload de tareas
  puede crecer.
- `TaskTemplateTasksList`: interaccion real y lista editable; revisar si el
  volumen QA/futuro justifica particion.
- `ListingToolbar`: interaccion real por URL; revisar duplicacion con
  `ListFiltersBar`.
- `PublicSolicitudForm`: justificado por workflow tabs, files y Server Action;
  medir impacto publico antes de tocar.

No se retiro ningun `"use client"` en 15.1.

## 9. Mapa de carga server-side

| Ruta | Loaders principales | Secuencia y notas |
| --- | --- | --- |
| `/` | Sin loaders de datos | Server Component estatico con `Image`, header/footer y search form cliente |
| `/solicitud` | Sin loader DB | Render server + `PublicSolicitudForm` cliente |
| `/estado` | `getPublicTrackingStatus(ref)` si hay `ref` | `dynamic = "force-dynamic"`; RPC `consultar_estado_publico`; sin consulta cuando no hay ref |
| `/login` | Sin loader DB en page | `LoginForm` cliente; Server Action autentica y consulta `perfiles` |
| `/dashboard` | `getDashboard()` | Primero contexto; luego `Promise.all` de summary, work items y activity |
| `/dashboard/pedidos` | `listInternalPedidos`, `getCurrentProfile`, `listInternalClientes` condicional | `listInternalPedidos` valida perfil; luego page vuelve a cargar profile y clientes si puede crear |
| `/dashboard/pedidos/[id]` | `getInternalPedidoById` | Despues de validar recurso: `getCurrentProfile`, workers condicional, tasks, files, comments, history y templates condicional en awaits secuenciales |
| `/dashboard/solicitudes` | `listInternalSolicitudes` | Loader principal con filtros; toolbar cliente |
| `/dashboard/solicitudes/[id]` | `getInternalSolicitudById` | Clientes y cliente asociado en `Promise.all`; files, comments e history cargan secuencialmente |
| `/dashboard/clientes` | `listInternalClientes` | Loader unico con limite y filtro `ilike` |
| `/dashboard/clientes/[id]` | `getInternalClienteById` | Detalle + pedidos recientes limitados |
| `/dashboard/configuracion/usuarios` | `listInternalUsers` | Loader unico con filtros |
| `/dashboard/configuracion/plantillas` | `listTaskTemplates` | Carga plantillas, filtra `q` en memoria, luego cuenta tareas por `template_id` |
| `/dashboard/configuracion/plantillas/[templateId]` | `getTaskTemplateById`, `listTaskTemplateTasks` | `Promise.all`; ambos validan acceso y el listado verifica existencia de plantilla |

No se marca como waterfall la validacion inicial de recurso/permisos cuando los
loaders secundarios dependen legitimamente del id seguro o de permisos.

## 10. Consultas, indices y RPCs

Tablas principales:

- `perfiles`, `clientes`, `solicitudes`, `pedidos`, `pedido_trabajadores`,
  `pedido_tareas`, `archivos`, `pedido_comentarios`, `pedido_historial`,
  `solicitud_comentarios`, `solicitud_historial`, `trabajo_plantillas`,
  `trabajo_plantilla_tareas`, `pedido_pagos`.

Indices existentes: 55 indices publicos. Destacan:

- `pedidos_status_created_at_idx`.
- `pedidos_active_created_at_idx`.
- `pedidos_active_estimated_delivery_date_idx`.
- `pedidos_cliente_id_idx`.
- `pedidos_workflow_type_idx`.
- `solicitudes_status_created_at_idx`.
- `solicitudes_cliente_id_idx`.
- `solicitudes_workflow_type_idx`.
- `clientes_name_idx`.
- `perfiles_active_role_full_name_idx`.
- `pedido_tareas_pedido_sort_order_idx`.
- `pedido_trabajadores_assigned_profile_id_idx`.
- `pedido_historial_pedido_created_at_idx`.
- `solicitud_historial_solicitud_created_at_idx`.
- `archivos_pedido_visibility_created_at_idx`.
- `archivos_solicitud_visibility_created_at_idx`.

Filtros frecuentes:

- `status`, `workflow_type`, `payment_status`, `cliente_id`,
  `assigned_profile_id`, `created_at`, `estimated_delivery_date`, `is_active`,
  `role`, `template_id`.

Ordenamientos frecuentes:

- `created_at desc`, `name asc`, `full_name asc`, `sort_order/created_at/id`.

Busquedas `ilike`:

- Clientes: `name`, `phone`, `email`, `notes`.
- Solicitudes: `client_name`, `client_phone`, `client_email`, `service_type`,
  `description`, `notes`.
- Pedidos: `order_number`, `title`, `description`; tambien busqueda auxiliar
  por cliente y solicitud.
- Usuarios: `full_name`, `phone`.

RPCs publicas principales:

- `actualizar_estado_solicitud`.
- `crear_cliente_desde_solicitud`.
- `convertir_solicitud_a_pedido`.
- `crear_pedido_manual`.
- `actualizar_estado_pedido`.
- `aplicar_plantilla_tareas_pedido`.
- `actualizar_pago_pedido`.
- `listar_pedido_comentarios`.
- `listar_pedido_historial`.
- `listar_solicitud_comentarios`.
- `listar_solicitud_historial`.
- `consultar_estado_publico`.

Patrones candidatos:

- `loadTaskProgressByPedidoId` ya usa batching de 50 ids; no es N+1 directo.
- Listados de pedidos con `q` ejecutan varias consultas en paralelo y luego
  mergean resultados.
- Dashboard summary usa varios `count` en paralelo.
- Detalles de pedidos/solicitudes tienen cargas secundarias secuenciales tras el
  recurso principal.
- Plantillas cargan todas las plantillas y filtran `q` en memoria; con 63 filas
  QA no hay evidencia de problema, pero requiere medicion si crece.

## 11. `pg_stat_statements`

Estado: disponible.

Ventana:

- `pg_stat_statements_info.stats_reset`: `2026-07-19 14:23:20.370161+00`.
- La ventana no fue reseteada en 15.1.
- Las estadisticas incluyen actividad previa al intento E2E de 15.1.

Top consultas por tiempo total observado:

| Patron anonimizado | Calls | Total ms | Mean ms |
| --- | ---: | ---: | ---: |
| Count de `pedidos` por `status` | 436 | 57,879.084 | 132.750 |
| Listado de `pedidos` con cliente/pago por estados | 218 | 29,095.026 | 133.463 |
| Count de `pedidos` activos | 218 | 27,134.738 | 124.471 |
| Count de `solicitudes` por lista de estados | 218 | 19,651.234 | 90.143 |
| Count de `solicitudes` por `status` | 218 | 16,616.431 | 76.222 |
| Pedidos asignados por trabajador | 70 | 16,225.336 | 231.791 |
| Pedidos ids/workflow por estados | 218 | 13,967.562 | 64.071 |
| Pedidos asignados con cliente/pago | 70 | 12,240.993 | 174.871 |
| Count solicitudes aprobadas no convertidas | 218 | 10,375.138 | 47.592 |
| Count clientes | 218 | 9,368.276 | 42.974 |

Limitacion: estos datos son utiles como señal, no como baseline aislada. 15.2
debe definir un harness que capture delta o reset controlado si se aprueba.

## 12. Volumen QA local

| Alias solicitado | Tabla real | Recuento |
| --- | --- | ---: |
| `profiles` | `perfiles` | 3 |
| `clientes` | `clientes` | 213 |
| `solicitudes` | `solicitudes` | 371 |
| `pedidos` | `pedidos` | 668 |
| `pedido_tasks` | `pedido_tareas` | 264 |
| `pedido_workers` | `pedido_trabajadores` | 178 |
| `pedido_files` | `archivos` con `pedido_id is not null` | 162 |
| `pedido_comments` | `pedido_comentarios` | 66 |
| `pedido_history` | `pedido_historial` | 3,034 |
| `task_templates` | `trabajo_plantillas` | 63 |
| `task_template_tasks` | `trabajo_plantilla_tareas` | 70 |

Notas:

- El dataset QA tiene acumulacion clara de pedidos, solicitudes e historial.
- Listados internos suelen limitar a 50 o 100.
- Dashboard usa limites internos de 6, 8, 10, 12, 24, 40 y 80 segun panel.
- No se introdujo paginacion ni virtualizacion.

## 13. Coste de QA

Referencia documental de cierre Etapa 14:

- Suite Chromium serial: `43 passed`, `3 skipped`, 5.5 min.
- Full Visual QA: 1.7 min.
- Full Visual QA genero 25 screenshots.

Distribucion estatica por specs:

| Spec | Lineas |
| --- | ---: |
| `pedidos.spec.ts` | 1,331 |
| `full-visual-qa.spec.ts` | 1,104 |
| `solicitudes-internas.spec.ts` | 642 |
| `task-templates.spec.ts` | 427 |
| `storage.spec.ts` | 278 |
| `dashboard-shell.spec.ts` | 208 |
| `clientes.spec.ts` | 203 |
| `dashboard.spec.ts` | 165 |
| `internal-listings.spec.ts` | 150 |
| `smoke.spec.ts` | 73 |
| `usuarios.spec.ts` | 67 |
| `public-solicitud.spec.ts` | 40 |
| `public-tracking.spec.ts` | 18 |

Factores de coste observados:

- `pedidos.spec.ts`, `solicitudes-internas.spec.ts`, `task-templates.spec.ts` y
  `full-visual-qa.spec.ts` crean datos.
- Full Visual QA hace screenshots explicitos y recargas repetidas.
- `pedidos.spec.ts` tiene multiples `page.reload()`, upload de archivo y flujos
  de roles.
- `solicitudes-internas.spec.ts` crea solicitudes publicas y prueba responsive
  con recargas.
- `internal-listings.spec.ts` usa `beforeEach` con login admin.
- Hay autenticaciones repetidas por rol en varios specs.
- No se detectaron `waitForTimeout` en la busqueda focal.

No se ejecuto toda la suite en 15.1 porque la cifra fue recien validada en el
cierre de Etapa 14 y el brief lo desaconseja salvo inconsistencia.

## 14. Mediciones no ejecutadas o no confiables

- `npm --version`: falla por ExecutionPolicy de PowerShell al invocar `npm.ps1`;
  se uso `npm.cmd --version`.
- Smoke E2E focal: excedio 240 s. Playwright detecto puerto 3000 ocupado por
  PID 14472 y arranco webServer en 3001, por lo que no se acepta como medicion
  de rendimiento.
- Navegacion por ruta con timings: pendiente de harness 15.2.
- `pg_stat_statements` aislado por flujo: pendiente de harness 15.2.
- `EXPLAIN ANALYZE`: no ejecutado en 15.1.

## 15. Candidatos e hipotesis

| ID | Area | Sintoma o riesgo | Evidencia disponible | Metrica actual | Hipotesis | Medicion adicional requerida | Impacto potencial | Riesgo | Prioridad | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P15-C01 | Bundle workspace pedidos | Mayor superficie cliente | Analyzer | 946,369 client bytes | Workspace y forms cargan bastante JS interactivo | Comparar route bundle por componente/import chain en UI analyzer | Medio | Medio | Alta | Medir en 15.2 |
| P15-C02 | Bundle workspace solicitudes | Segunda mayor superficie cliente | Analyzer | 930,910 client bytes | Componentes de conversion/cliente/comentarios elevan JS | Comparar cliente por panel y ruta | Medio | Medio | Alta | Medir en 15.2 |
| P15-C03 | lucide-react | Muchos iconos `.mjs` fragmentados | Analyzer y imports | Sin top individual dominante | El coste agregado puede ser pequeño o ya optimizado | Medir agregacion por paquete/iconos | Bajo/Medio | Bajo | Media | Sin evidencia suficiente |
| P15-C04 | Detalle pedido server | Secundarios secuenciales | Codigo | 5+ awaits secundarios tras recurso | Tasks/files/comments/history/workers/templates podrian paralelizarse si son independientes | Timings por loader y prueba de error parcial | Medio | Medio | Alta | Medir en 15.2 |
| P15-C05 | Detalle solicitud server | Secundarios parcialmente secuenciales | Codigo | `Promise.all` clientes; luego 3 awaits | Files/comments/history podrian paralelizarse | Timings por loader y prueba de error parcial | Medio | Medio | Alta | Medir en 15.2 |
| P15-C06 | Dashboard counts | Varias consultas agregadas frecuentes en pg_stat | Codigo + pg_stat no aislado | Top counts 47-133 ms mean acumulado | Algunos counts podrian agruparse o requerir indice parcial | Harness por rol y delta pg_stat | Medio | Alto | Alta | Medir en 15.2 |
| P15-C07 | Pedidos asignados trabajador | Mean alto en pg_stat | pg_stat no aislado | 231.791 ms mean | Join lateral por asignacion puede costar con volumen | Query aislada por rol worker y plan de lectura | Medio | Alto | Alta | Medir en 15.2 |
| P15-C08 | Busqueda `ilike` | Filtros textuales sin indice trigram | Auditoria estatica | Sin timing aislado | Puede degradar con volumen real | Dataset escalado o medicion con `q` representativo | Alto futuro | Alto | Media | Sin evidencia suficiente |
| P15-C09 | Plantillas filtran en memoria | Loader trae todas las plantillas | Codigo + volumen QA | 63 plantillas | No afecta con volumen actual; podria crecer | Timings con dataset mayor o threshold acordado | Bajo | Bajo | Baja | Mantener sin cambios |
| P15-C10 | QA serial | Specs largos y datos acumulados | Cierre Etapa 14 + lineas | 5.5 min serial | Coste esta en flujos mutantes y full visual | Trazar duracion por spec sin correr suite completa innecesaria | Medio | Medio | Media | Medir en 15.2 |
| P15-C11 | Smoke E2E local | Timeout por puerto ocupado | Ejecucion 15.1 | >240 s, no confiable | Harness local necesita control de puerto/proceso | Definir preflight de servidor en 15.2 | Medio | Bajo | Alta | Medir en 15.2 |
| P15-C12 | Payload cliente de listados | Listados limitados pero cards/tablas completas | Codigo + analyzer | 50/100 items max | Payload aceptable hoy; medir con filtros | Navigation timing y payload RSC | Medio | Medio | Media | Sin evidencia suficiente |

## 16. Hipotesis descartadas en 15.1

- "Hay que optimizar porque un archivo tiene muchas lineas": descartada. La
  decision requiere metrica.
- "Hay que instalar `@next/bundle-analyzer`": descartada. Next.js 16.2.6 ya
  provee `experimental-analyze`.
- "Hay que agregar `optimizePackageImports` para lucide-react ya": descartada
  por falta de metrica agregada suficiente.
- "Hay que paginar todos los listados ya": descartada. Los listados actuales
  tienen limites y el volumen QA no prueba degradacion critica.
- "Hay que resetear pg_stat_statements en 15.1": descartada para no alterar el
  entorno sin harness aprobado.

## 17. Limitaciones

- Mediciones locales en Windows no representan produccion.
- El proceso `node` en puerto 3000 impidio una medicion E2E limpia.
- `pg_stat_statements` tenia acumulados previos.
- Analyzer requiere interpretacion: los `.data` no son reportes Markdown y
  mezclan runtime/framework con app code.
- No se midieron navegaciones reales con browser timing.
- No se hicieron cambios de codigo ni mediciones despues de optimizar.

## 18. Resultado 15.1

La subtarea 15.1 deja protocolo reproducible, baseline local, inventario de
Client Components, mapa de carga, auditoria DB/queries, recuentos QA, coste de
QA y matriz de candidatos. La siguiente subtarea debe ser 15.2: harness y
criterios de decision.

## 19. Resultados 15.2 - Harness y criterios de decision

Fecha: 2026-07-19

Estado: completado.

Commit base de medicion:

```text
b0b23eaafc15e6c6a0e70769a57608aa479381dd docs: establecer linea base de rendimiento
```

Artefactos locales generados:

```text
.next/diagnostics/performance/navigation-results.json
.next/diagnostics/performance/bundle-summary.json
.next/diagnostics/performance/pg-stat-before.json
.next/diagnostics/performance/pg-stat-after.json
.next/diagnostics/performance/pg-stat-diff.json
.next/diagnostics/performance/run-metadata.json
```

Estos artefactos estan bajo `.next/`, ignorado por git. No se agregan cookies,
storage state, SQL completo ni UUIDs descubiertos a documentacion versionada.

### 19.1 Comandos y codigos

| Comando | Codigo | Resultado |
| --- | ---: | --- |
| `npm.cmd run perf:measure` | 0 | Build, analyzer, bundle summary, SQL before/after/diff y navegacion completados. |
| `npm.cmd run perf:navigation` segunda corrida | 0 | 2 tests passed, 38.3 s. |
| `npm.cmd run diff:check` | 0 | Sin errores de whitespace; aviso CRLF normal de `package.json`. |
| `npm.cmd run verify` | 0 | `eslint` y `next build` aprobados. |
| `npm.cmd run audit:security` | 0 | Coincidencias documentales esperadas; requiere revision manual. |
| `npm.cmd run audit:client-supabase` | 0 | Sin coincidencias. |
| `npm.cmd run audit:public-tracking` | 0 | Sin coincidencias. |

El harness principal registro:

| Fase | Duracion | Codigo |
| --- | ---: | ---: |
| Build | 10,344 ms | 0 |
| `next experimental-analyze --output` | 3,752 ms | 0 |
| Bundle summary | 159 ms | 0 |
| `pg_stat` before | 227 ms | 0 |
| Navegacion | 34,408 ms | 0 |
| `pg_stat` after | 247 ms | 0 |
| `pg_stat` diff | 94 ms | 0 |

### 19.2 Navegacion final

La tabla usa la segunda corrida de `npm.cmd run perf:navigation`.

| Modo | Ruta | Mediana ms | Min | Max | Spread | Fallos | Estado | Transfer mediana bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| Cold document | `/` | 127 | 118 | 133 | 0.118 | 0 | Stable | 222,251 |
| Cold document | `/solicitud` | 141 | 128 | 143 | 0.106 | 0 | Stable | 197,419 |
| Cold document | `/estado` | 134 | 129 | 433 | 2.269 | 0 | Unreliable | 221,654 |
| Cold document | `/dashboard` | 491 | 463 | 514 | 0.104 | 0 | Stable | 248,898 |
| Cold document | `/dashboard/pedidos` | 469 | 429 | 505 | 0.162 | 0 | Noisy | 302,109 |
| Cold document | `/dashboard/solicitudes` | 456 | 441 | 525 | 0.184 | 0 | Noisy | 286,684 |
| Cold document | `/dashboard/pedidos/[id]` | 190 | 185 | 204 | 0.100 | 0 | Stable | 238,239 |
| Cold document | `/dashboard/solicitudes/[id]` | 188 | 184 | 194 | 0.053 | 0 | Stable | 236,016 |
| Client transition | `/dashboard -> /dashboard/pedidos` | 427 | 406 | 462 | 0.131 | 0 | Stable | 82,246 |
| Client transition | `/dashboard -> /dashboard/solicitudes` | 372 | 368 | 387 | 0.051 | 0 | Stable | 65,555 |
| Client transition | `/dashboard/pedidos -> /dashboard/pedidos/[id]` | 189 | 176 | 2,103 | 10.196 | 0 | Unreliable | 28,885 |

Interpretacion:

- La mayoria de rutas internas criticas ya son estables o ruidosas controladas
  en la corrida final.
- `/estado` cold no es aceptable como baseline para aprobar optimizaciones hasta
  repetir o aislar ruido.
- Las transiciones cliente desde dashboard a listados son estables.
- La transicion cliente desde pedidos a detalle es medible, pero la corrida
  corregida queda `unreliable` por un outlier de 2,103 ms; no usarla para
  aprobar optimizaciones sin repetir o aislar ruido.

### 19.3 Bundle final

El resumen usa el analyzer oficial de Next.js. Los bytes son grafo de analyzer,
no transferencia de red.

| Ruta | Client graph bytes | Server graph bytes | Sources |
| --- | ---: | ---: | ---: |
| `/` | 848,250 | 641,298 | 590 |
| `/solicitud` | 876,448 | 949,771 | 732 |
| `/estado` | 888,725 | 935,456 | 673 |
| `/dashboard` | 896,447 | 1,175,524 | 901 |
| `/dashboard/pedidos` | 912,886 | 1,143,472 | 878 |
| `/dashboard/pedidos/[id]` | 946,656 | 1,277,536 | 978 |
| `/dashboard/solicitudes` | 881,713 | 1,070,551 | 817 |
| `/dashboard/solicitudes/[id]` | 931,197 | 1,220,020 | 944 |

Las rutas con mayor superficie cliente siguen siendo los detalles internos de
pedidos y solicitudes.

### 19.4 SQL final

`pg_stat_statements` fue comparable:

```text
stats_reset = 2026-07-19T14:23:20.370161+00:00
rowCount = 62
```

Top deltas anonimizados por `queryid`:

| Queryid | Delta calls | Delta total ms | Delta mean ms | Delta rows |
| --- | ---: | ---: | ---: | ---: |
| `8304524537248439887` | 38 | 3,603.480 | 94.828 | 38 |
| `-5075751444235376341` | 19 | 2,240.923 | 117.943 | 19 |
| `5001894152916096478` | 19 | 1,792.051 | 94.318 | 19 |
| `-7277926250533030293` | 19 | 1,452.785 | 76.462 | 19 |
| `-2408961981334374729` | 19 | 1,435.685 | 75.562 | 19 |

No se documenta el SQL normalizado completo. La atribucion exacta por flujo
requiere revisar el artefacto local y, si se propone optimizacion SQL, crear una
medicion focal antes/despues.

### 19.5 Limitaciones y advertencias

- Entorno local Windows; no representa produccion.
- El dataset QA local acumula datos de pruebas.
- `audit:security` reporta coincidencias documentales esperadas y requiere
  revision manual.
- Playwright debe poder cerrar el `next start`; en sandbox restringido, la
  segunda navegacion necesito permisos elevados para terminar con codigo 0.
- Node 24 mostro `DEP0190` al cerrar comandos con shell interno de tooling; no
  afecto codigos ni artefactos.
- No se ejecuto suite E2E completa por instruccion explicita de 15.2.

### 19.6 Decision por candidatos 15.1

| ID | Decision 15.2 |
| --- | --- |
| P15-C01 | Mantener como candidato de 15.3: `/dashboard/pedidos/[id]` sigue siendo mayor client graph, pero necesita hipotesis concreta por fuente antes de tocar UI. |
| P15-C02 | Mantener como candidato de 15.3: `/dashboard/solicitudes/[id]` es segunda mayor superficie cliente y navegacion cold estable. |
| P15-C03 | Sin accion: analyzer no muestra decision suficiente para `lucide-react` por si solo. |
| P15-C04 | Posponer 15.4: detalle pedido medible, pero la mediana local no prueba problema server-side por si sola. |
| P15-C05 | Posponer 15.4: detalle solicitud estable; no hay evidencia fuerte de waterfall critico. |
| P15-C06 | Mantener para investigacion focal: SQL muestra deltas relevantes, pero aun falta atribucion segura por flujo. |
| P15-C07 | Sin decision: el harness 15.2 midio admin, no flujo worker asignado. |
| P15-C08 | Sin decision: no se midio busqueda `q` con volumen escalado. |
| P15-C09 | Mantener sin cambios: no aparecio evidencia nueva de problema en plantillas. |
| P15-C10 | Sin decision: coste QA integral no se midio en esta subtarea. |
| P15-C11 | Cerrado: el harness controla puerto 3100 y falla si esta ocupado. |
| P15-C12 | Mantener observacion: transferencias de listados ya son medibles, sin umbral de optimizacion aprobado. |

Proxima subtarea recomendada: preparar una investigacion focal de 15.3 solo si
se elige una hipotesis concreta sobre bundle de detalles internos. No iniciar
optimizacion sin nuevo antes/despues.

## 20. Correccion 15.2.1 - Confiabilidad del harness

Fecha: 2026-07-19

Estado: completado tras validacion.

Commit base:

```text
68afb3855f9477616d660f98a7d87c59b73e996f test: establecer harness de medicion
```

### 20.1 Correcciones aplicadas

- Las muestras de navegacion fallidas ya no quedan como fallos silenciosos:
  primero se guardan en `navigation-results.json`, luego se cierra
  contexto/pagina y finalmente el spec falla con codigo distinto de cero.
- Los warmups fallidos se registran como `sample: 0`, `phase: warmup` y tambien
  fallan el comando.
- `PERF_FORCE_NAV_FAILURE=1` activa una prueba negativa local que usa un heading
  inexistente sin modificar la aplicacion.
- Los snapshots SQL capturan `dbid`, `userid`, `toplevel`, `queryid`, `calls`,
  `totalExecTimeMs`, `rows`, `normalizedQuery`, `statsReset` y `dealloc`.
- El diff SQL usa clave compuesta `dbid:userid:toplevel:queryid`, incorpora
  entradas nuevas del snapshot posterior contra contadores anteriores en cero,
  ignora deltas negativos y falla si cambia `statsReset` o `dealloc`.
- El resumen de analyzer falla si falta cualquier `analyze.data` critico; no
  fabrica valores cero ni escribe un resumen valido incompleto.

### 20.2 Prueba negativa

Comando:

```text
$env:PERF_FORCE_NAV_FAILURE='1'; npm.cmd run perf:navigation
```

Resultado:

- Codigo: distinto de cero.
- Fallo esperado: `cold-document-navigation`, ruta `/`, `warmup`,
  heading inexistente forzado.
- `navigation-results.json` con `success: false` para `sample: 0`.
- Storage state eliminado.
- Puerto 3100 libre al finalizar.

### 20.3 Corrida normal final

Comandos:

| Comando | Codigo | Resultado |
| --- | ---: | --- |
| `npm.cmd run diff:check` | 0 | Sin errores; warnings CRLF normales en Windows. |
| `npm.cmd run verify` | 0 | `eslint` y `next build` aprobados. |
| `npm.cmd run audit:security` | 0 | Coincidencias documentales esperadas; requiere revision manual. |
| `npm.cmd run audit:client-supabase` | 0 | Sin coincidencias. |
| `npm.cmd run audit:public-tracking` | 0 | Sin coincidencias. |
| `npm.cmd run perf:measure` | 0 | Harness completo aprobado. |
| `npm.cmd run perf:navigation` | 0 | Segunda corrida normal aprobada, 2 tests passed. |

Navegacion normal:

- Muestras fallidas: 0.
- Storage state residual: no.
- Puerto 3100 al final: libre.

SQL normal:

```text
before rows = 226
after rows = 226
diff rows = 56
comparable = true
dealloc before = 0
dealloc after = 0
```

Top deltas anonimizados por clave compuesta:

| Stat key | Delta calls | Delta total ms | Delta mean ms |
| --- | ---: | ---: | ---: |
| `5:16444:true:8304524537248439887` | 38 | 3,594.767 | 94.599 |
| `5:16444:true:-5075751444235376341` | 19 | 2,185.412 | 115.022 |
| `5:16444:true:5001894152916096478` | 19 | 1,856.817 | 97.727 |
| `5:16444:true:-2408961981334374729` | 19 | 1,482.599 | 78.032 |
| `5:16444:true:-7277926250533030293` | 19 | 1,408.441 | 74.128 |

Analyzer:

- Rutas criticas encontradas: 8.
- Rutas criticas ausentes: 0.
- `clientGraphBytes` y `serverGraphBytes` siguen siendo superficie del grafo de
  analyzer, no transferencia de navegador.

No se inicia 15.3 desde esta correccion.

## 21. Correccion 15.2.2 - Ventana temporal de transiciones cliente

Fecha: 2026-07-19

Estado: completado tras validacion.

Commit base:

```text
1f65fd9f74325befc5b20c630f0e04c75e2c94f0 fix: reforzar confiabilidad del harness
```

### 21.1 Defecto corregido

El modo `client-prefetched-navigation` iniciaba `wallTimeMs` antes de
`page.goto(origin.path)`. Por eso la metrica de transicion mezclaba carga y
preparacion de origen con la interaccion real.

La ventana corregida empieza despues de cargar la ruta origen, esperar su
condicion canonica, localizar el enlace y resolver `href`. `sinceStartTime`,
`startedAt` y el timer de `wallTimeMs` se capturan inmediatamente antes del
`click` y del `Promise.all([page.waitForURL(...), link.click()])`. La ventana
termina despues de URL objetivo y condicion canonica del destino listas.

Si falla la preparacion previa al click, la muestra queda marcada como
`setup failed: ...`; si falla despues del inicio de la interaccion, queda como
`transition failed: ...`. En ambos casos el error se sanea, se preserva la
muestra fallida, se cierran pagina/contexto y el spec falla con codigo distinto
de cero.

### 21.2 Prueba negativa

Comando:

```text
$env:PERF_FORCE_NAV_FAILURE='1'; npm.cmd run perf:navigation
```

Resultado:

- Codigo: 1, esperado.
- Fallo esperado: `cold-document-navigation`, ruta `/`, `sample: 0`,
  `phase: warmup`, heading inexistente forzado.
- `navigation-results.json` preservo una muestra fallida sin fabricar muestra
  exitosa de tiempo cero.
- Storage state residual: no.
- Puerto 3100 al final: libre.

### 21.3 Corrida normal final

Comandos:

| Comando | Codigo | Resultado |
| --- | ---: | --- |
| `npm.cmd run diff:check` | 0 | Sin errores; warnings CRLF normales en Windows. |
| `npm.cmd run verify` | 0 | `eslint` y `next build` aprobados. |
| `npm.cmd run audit:security` | 0 | Coincidencias documentales esperadas; requiere revision manual. |
| `npm.cmd run audit:client-supabase` | 0 | Sin coincidencias. |
| `npm.cmd run audit:public-tracking` | 0 | Sin coincidencias. |
| `npm.cmd run perf:measure` | 0 | Build, analyzer, SQL before/after/diff y navegacion completados. |
| `npm.cmd run perf:navigation` | 0 | Corrida normal independiente aprobada, 2 tests passed. |

Navegacion normal final:

```text
sampleCount = 55
failedSamples = 0
summaryCount = 11
storage state residual = false
port 3100 connections = 0
```

Transiciones cliente corregidas:

| Transicion | Mediana ms | Min | Max | Spread | Fallos | Estado | Transfer mediana bytes |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| `/dashboard -> /dashboard/pedidos` | 427 | 406 | 462 | 0.131 | 0 | Stable | 82,246 |
| `/dashboard -> /dashboard/solicitudes` | 372 | 368 | 387 | 0.051 | 0 | Stable | 65,555 |
| `/dashboard/pedidos -> /dashboard/pedidos/[id]` | 189 | 176 | 2,103 | 10.196 | 0 | Unreliable | 28,885 |

Las dos transiciones desde dashboard son estables en la ventana corregida. La
transicion de listado de pedidos a detalle tiene mediana baja, pero no es
estable por el outlier de 2,103 ms.

SQL normal:

```text
before rows = 226
after rows = 226
diff rows = 56
comparable = true
stats_reset = 2026-07-19T14:23:20.370161+00:00
dealloc = 0
```

Top deltas anonimizados por clave compuesta:

| Stat key | Delta calls | Delta total ms | Delta mean ms |
| --- | ---: | ---: | ---: |
| `5:16444:true:8304524537248439887` | 38 | 16,584.269 | 436.428 |
| `5:16444:true:-5075751444235376341` | 19 | 10,225.281 | 538.173 |
| `5:16444:true:5001894152916096478` | 19 | 8,396.936 | 441.944 |
| `5:16444:true:-2408961981334374729` | 19 | 6,315.172 | 332.377 |
| `5:16444:true:-7277926250533030293` | 19 | 6,279.586 | 330.505 |

Analyzer:

- Rutas criticas encontradas: 8.
- Rutas criticas ausentes: 0.
- Los bytes de analyzer permanecen iguales a la corrida 15.2: solo se corrigio
  la ventana temporal de transiciones cliente.

15.2 queda completada tras 15.2.1 y 15.2.2. 15.3 sigue condicionada y no se
inicia desde esta correccion.
