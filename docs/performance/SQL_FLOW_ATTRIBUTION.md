# Atribucion SQL focal - Etapa 15.5.1

Fecha: 2026-07-20

## 1. Objetivo

Atribuir deltas de `pg_stat_statements` a cinco flujos internos concretos para
decidir si existe un candidato SQL material para 15.5.2. Esta medicion no
implementa optimizaciones, indices, migraciones, cache, paginacion, RPC ni
cambios de aplicacion.

## 2. Commit

| Item | Valor |
| --- | --- |
| Rama | `perf/measured-optimization` |
| Commit medido | `44887979312e42e2aeee872f35bf341500b45a6d` |
| Commit corto | `4488797 docs: cerrar experimento de paneles de pedido` |
| Estado inicial | Arbol limpio |

## 3. Entorno

La medicion se ejecuto en el entorno local Windows usado por la Etapa 15:
Next.js 16.2.6, Node 24.14.1, Supabase local y Playwright Chromium con servidor
de produccion en `127.0.0.1:3100`.

Los resultados describen QA local. No son equivalentes a produccion.

## 4. Protocolo

Para cada flujo se autentico un usuario admin fuera de la ventana SQL, se
descubrieron terminos de busqueda fuera de la ventana, se ejecuto un warmup, se
capturo snapshot `before`, se realizaron tres cargas documentales con contexto
nuevo y mismo storage state, se capturo snapshot `after` y se calculo delta SQL.

La ventana uso viewport `1366 x 768`, condiciones canonicas por ruta y no uso
`waitForTimeout`. Los valores reales de busqueda no se guardaron en
documentacion ni en `summary.json`.

Artefactos locales ignorados por git:

```text
.next/diagnostics/performance/sql-flow-attribution/
```

## 5. Flujos

| Flujo | Ruta medida | Rol | Warmup | Cargas medidas | Resultado |
| --- | --- | --- | ---: | ---: | --- |
| `dashboard` | `/dashboard` | admin | 1 | 3 | Exitoso |
| `pedidos-default` | `/dashboard/pedidos` | admin | 1 | 3 | Exitoso |
| `pedidos-search` | `/dashboard/pedidos?q=<redacted>` | admin | 1 | 3 | Exitoso |
| `solicitudes-default` | `/dashboard/solicitudes` | admin | 1 | 3 | Exitoso |
| `solicitudes-search` | `/dashboard/solicitudes?q=<redacted>` | admin | 1 | 3 | Exitoso |

## 6. Limitaciones de `pg_stat_statements`

- `pg_stat_statements` agrega por query normalizada; no conserva una traza por
  request.
- Las ventanas son comparables porque `statsReset` y `dealloc` no cambiaron,
  pero el entorno local puede tener ruido de maquina.
- Las categorias son conservadoras. Cuando la evidencia no alcanza para dominio
  exacto, se usa `unknown` o `postgrest-or-rls`.
- El SQL normalizado completo solo queda en artefactos locales bajo `.next`.

## 7. Resultados por flujo

| Flujo | Comparable | Statements | Calls | Total SQL ms | Rows | Categoria dominante |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `dashboard` | Si | 23 | 255 | 2,382.034 | 252 | `dashboard-summary` 2,337.6 ms |
| `pedidos-default` | Si | 12 | 100 | 86.776 | 97 | `pedidos-main` 46.9 ms |
| `pedidos-search` | Si | 14 | 123 | 383.652 | 120 | `pedidos-search-reference` 233.7 ms |
| `solicitudes-default` | Si | 11 | 89 | 86.724 | 86 | `solicitudes-main` 84.3 ms |
| `solicitudes-search` | Si | 11 | 105 | 267.868 | 102 | `solicitudes-search-reference` 265.2 ms |

Top atribuido por flujo:

| Flujo | Queryid | Categoria | Calls | Total ms | Mean ms | Rows | Material |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `dashboard` | `8304524537248439887` | `dashboard-summary` | 6 | 620.100 | 103.350 | 6 | Si |
| `dashboard` | `-5075751444235376341` | `dashboard-summary` | 3 | 387.776 | 129.259 | 3 | Si |
| `dashboard` | `5001894152916096478` | `dashboard-summary` | 3 | 299.920 | 99.973 | 3 | Si |
| `pedidos-default` | `983474798271571701` | `pedidos-main` | 3 | 46.886 | 15.629 | 3 | No |
| `pedidos-default` | `-3361351968194762309` | `clientes` | 3 | 29.809 | 9.936 | 3 | No |
| `pedidos-search` | `-4325958909747137914` | `pedidos-main` | 3 | 117.012 | 39.004 | 3 | Si |
| `pedidos-search` | `6249357073429706291` | `pedidos-search-reference` | 3 | 96.545 | 32.182 | 3 | Si |
| `pedidos-search` | `319431452203891905` | `pedidos-search-reference` | 3 | 91.706 | 30.569 | 3 | Si |
| `solicitudes-default` | `-7418187923272772907` | `solicitudes-main` | 3 | 84.293 | 28.098 | 3 | Si |
| `solicitudes-search` | `6040859707445220710` | `solicitudes-search-reference` | 3 | 101.219 | 33.740 | 3 | Si |
| `solicitudes-search` | `-7418187923272772907` | `solicitudes-search-reference` | 3 | 100.487 | 33.496 | 3 | Si |
| `solicitudes-search` | `-2206842220542292488` | `solicitudes-search-reference` | 3 | 63.471 | 21.157 | 3 | Si |

## 8. Consultas compartidas

| Queryid | Flujos | Categoria | Calls totales | Total ms | Interpretacion |
| --- | --- | --- | ---: | ---: | --- |
| `5360251647081715348` | 5 | `postgrest-or-rls` | 297 | 5.676 | Compartida y barata |
| `-8797119600870853651` | 4 | `auth-or-profile` | 126 | 5.354 | Compartida y barata |
| `-8571234317201225662` | 3 | `pedido-task-progress` | 30 | 39.143 | Compartida, no material |
| `-3361351968194762309` | 2 | `clientes` | 6 | 59.975 | Carga de clientes del flujo de pedidos |
| `-7418187923272772907` | 2 | `solicitudes-main/search-reference` | 6 | 184.780 | Reaparece en default y search |

## 9. Consultas atribuidas

Las consultas atribuidas cumplen ventana comparable, llamadas compatibles con
tres cargas, categoria de dominio o infraestructura y exclusion del propio
harness.

Resumen por categoria:

| Flujo | Categorias atribuidas principales |
| --- | --- |
| `dashboard` | `dashboard-summary`, `dashboard-activity`, `pedido-task-progress`, `auth-or-profile`, `postgrest-or-rls` |
| `pedidos-default` | `pedidos-main`, `clientes`, `pedido-task-progress`, `auth-or-profile`, `postgrest-or-rls` |
| `pedidos-search` | `pedidos-main`, `pedidos-search-reference`, `clientes`, `pedido-task-progress`, `auth-or-profile`, `postgrest-or-rls` |
| `solicitudes-default` | `solicitudes-main`, `auth-or-profile`, `postgrest-or-rls` |
| `solicitudes-search` | `solicitudes-search-reference`, `auth-or-profile`, `postgrest-or-rls` |

## 10. Queries desconocidas

Hay entradas `unknown` marginales:

| Flujo | Unknown statements | Total ms |
| --- | ---: | ---: |
| `dashboard` | 1 | 0.014 |
| `pedidos-default` | 2 | 0.020 |
| `pedidos-search` | 1 | 0.015 |
| `solicitudes-default` | 3 | 0.069 |
| `solicitudes-search` | 1 | 0.016 |

No son materiales y no participan en la decision.

## 11. H1-H5

H1 - Dashboard: el coste esta dominado por `dashboard-summary`. Los conteos y
resumenes individuales no son baratos: el top statement tiene 620.100 ms total,
103.350 ms medio y 26.0% del tiempo SQL del flujo. `pedido-task-progress`,
actividad, perfil/RLS y unknown quedan muy por debajo.

H2 - Pedidos default: no hay candidato material. La consulta principal de
pedidos mide 46.886 ms total, la carga de clientes para el dialogo 29.809 ms y
el progreso de tareas 7.674 ms.

H3 - Pedidos search: hay coste material repartido entre consulta principal de
pedidos y referencias de busqueda. Se observaron 14 statements y 123 calls. No
se decide optimizar aqui porque el candidato dominante global pertenece a
dashboard.

H4 - Solicitudes default: la consulta simple del listado es material por umbral
local, con 84.293 ms total y 28.098 ms medio, pero su impacto absoluto es menor
que dashboard.

H5 - Solicitudes search: las referencias de busqueda son materiales en QA local
con 11 statements y 105 calls. No se asume que el scan de referencias sea
problematico sin una prueba focal antes/despues.

## 12. Candidatos materiales

| Orden | Flujo | Queryid | Categoria | Total ms | Mean ms | Calls | Motivo |
| ---: | --- | --- | --- | ---: | ---: | ---: | --- |
| 1 | `dashboard` | `8304524537248439887` | `dashboard-summary` | 620.100 | 103.350 | 6 | Mayor delta, >=15% del flujo, mean >=20 ms |
| 2 | `dashboard` | `-5075751444235376341` | `dashboard-summary` | 387.776 | 129.259 | 3 | >=15% del flujo, mean >=20 ms |
| 3 | `dashboard` | `5001894152916096478` | `dashboard-summary` | 299.920 | 99.973 | 3 | Mean >=20 ms |
| 4 | `dashboard` | `-7277926250533030293` | `dashboard-summary` | 257.308 | 85.769 | 3 | Mean >=20 ms |
| 5 | `dashboard` | `-2408961981334374729` | `dashboard-summary` | 252.329 | 84.110 | 3 | Mean >=20 ms |
| 6 | `pedidos-search` | `-4325958909747137914` | `pedidos-main` | 117.012 | 39.004 | 3 | >=15% del flujo, mean >=20 ms |

La lista completa queda en `summary.json`. Para 15.5.2 se selecciona un solo
candidato.

## 13. Candidatos descartados

- `pedidos-default`: no alcanza 50 ms por statement.
- `pedido-task-progress`: compartido y barato en los flujos medidos.
- `auth-or-profile` y `postgrest-or-rls`: compartidos, baratos y no atribuibles
  a dominio sin evidencia adicional.
- `unknown`: tiempo despreciable.
- Optimizaciones simultaneas de search en pedidos y solicitudes: pospuestas
  para no mezclar hipotesis.

## 14. Decision

Resultado valido:

```text
Existe candidato SQL material para 15.5.2
```

15.5 permanece en curso. No se implementa optimizacion en 15.5.1.

El candidato seleccionado es:

```text
dashboard-summary / queryid 8304524537248439887
```

Evidencia: 6 calls, 620.100 ms total, 103.350 ms medio, 6 rows y 26.0% del
tiempo SQL del flujo `dashboard` en tres cargas medidas.

## 15. Siguiente subtarea

```text
15.5.2 - Plan y prueba focal del candidato dashboard-summary 8304524537248439887
```

La subtarea siguiente debe disenar una prueba antes/despues focal de ese unico
candidato. No debe aplicar indices, reescrituras, RPC, cache, paginacion ni
consolidacion de conteos sin medicion previa y criterio de abandono.
