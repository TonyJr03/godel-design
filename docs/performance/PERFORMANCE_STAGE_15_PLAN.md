# Etapa 15 - Optimizacion basada en mediciones

Fecha de apertura: 2026-07-19

## 1. Objetivo

La Etapa 15 busca mejorar rendimiento solo cuando exista evidencia reproducible.
La etapa no parte de inspeccion visual, cantidad de lineas ni intuiciones sobre
"codigo grande"; parte de mediciones antes/despues, contexto del entorno y
criterios de decision documentados.

## 2. Principios

- Medir antes de modificar.
- Comparar cada cambio contra una linea base equivalente.
- Separar entorno local, QA y produccion.
- Mantener seguridad, RLS, permisos y DTOs seguros como restricciones duras.
- No optimizar si la metrica no permite demostrar mejora.
- Preferir cambios pequeños, reversibles y alineados con la arquitectura
  server-first.
- No introducir cache, paginacion, indices ni splitting por intuicion.

## 3. Alcance

Incluye:

- Build limpio y caliente.
- Bundle cliente/servidor con `next experimental-analyze`.
- Inventario de Client Components.
- Mapa de carga server-side de rutas criticas.
- Auditoria estatica de consultas, indices y RPCs.
- Volumen local QA.
- Coste de Playwright y Full Visual QA.
- Matriz de candidatos medibles.

No incluye en 15.1:

- Cambios en `src/app`, `src/components`, `src/lib`, `src/types`, `supabase`,
  `tests`, `scripts`, `package.json`, `package-lock.json`, `next.config.ts` o
  `playwright.config.ts`.
- Nuevas dependencias.
- Migraciones.
- Cambios de RLS, permisos, DTOs, queries o Server Actions.
- Dynamic imports, memoizacion, cache, paginacion o virtualizacion.

## 4. Metricas

Metricas iniciales:

- Duracion de build limpio.
- Duracion de build caliente.
- Codigo de salida y warnings de build.
- Rutas generadas por Next.js.
- Tamaño total de `.next`.
- Tamaño de salida de `.next/diagnostics/analyze`.
- Superficie cliente y servidor por ruta segun analyzer.
- Total y familias de Client Components.
- Numero aproximado de consultas por ruta critica.
- Limites de listados y scans auxiliares.
- Recuentos de tablas QA locales.
- Duracion documentada de E2E serial y Full Visual QA.
- Distribucion estatica de coste en specs.

Metricas posteriores:

- Navegacion por ruta en entorno controlado.
- Tiempo de render server-side por loader critico.
- Tiempo de consultas SQL con ventana controlada.
- Comparacion de bundle antes/despues por ruta.
- Duracion de specs focales despues de cambios.

## 5. Metodologia

1. Registrar commit, rama, sistema, versiones y procesos relevantes.
2. Ejecutar build limpio borrando solo `.next`.
3. Ejecutar build caliente sin borrar `.next`.
4. Ejecutar `npx next experimental-analyze --output`.
5. Inspeccionar la salida de `.next/diagnostics/analyze`.
6. Inventariar Client Components sin remover boundaries.
7. Mapear loaders de rutas criticas sin modificar datos ni servicios.
8. Auditar consultas en `src/lib/**` y migraciones.
9. Consultar recuentos QA locales solo si Supabase local esta disponible.
10. Revisar coste QA por documentacion de cierre e inspeccion de specs.
11. Registrar candidatos con decision permitida y medicion faltante.

## 6. Entorno controlado

La comparacion valida requiere:

- Misma rama y commit base o commit derivado documentado.
- Misma version de Node, npm y Next.js.
- Misma maquina o descripcion clara del cambio.
- Supabase local en estado conocido.
- Dataset QA descrito por recuentos.
- Sin procesos locales extraordinarios consumiendo CPU/memoria cuando se mida.
- Sin resetear `pg_stat_statements` salvo subtarea aprobada para harness.
- Sin presentar resultados Windows locales como equivalentes a produccion.

## 7. Clasificacion de evidencia

- Evidencia fuerte: medicion antes/despues reproducible con mismo comando,
  mismo dataset y codigo de salida 0.
- Evidencia util: salida de herramientas oficiales, inventario estatico o
  estadisticas locales con limitaciones explicitas.
- Evidencia debil: inspeccion de codigo sin temporizacion ni volumen asociado.
- Sin evidencia suficiente: sospecha razonable que necesita harness o muestra
  adicional antes de decidir.

## 8. Subtareas

| Subtarea | Nombre | Objetivo | Estado |
| --- | --- | --- | --- |
| 15.1 | Auditoria y linea base | Crear protocolo, baseline y matriz inicial sin optimizar | Completada |
| 15.2 | Harness y criterios de decision | Aislar mediciones de navegacion, SQL y bundle para comparar cambios | Completada tras 15.2.1 y 15.2.2 |
| 15.3 | Bundle y JavaScript cliente | Reducir JS solo donde 15.1/15.2 lo justifiquen | Condicionada / posible siguiente |
| 15.4 | Render servidor y carga de datos | Revisar loaders secuenciales o payloads con metricas | Condicionada |
| 15.5 | PostgreSQL y escala de listados | Evaluar indices, filtros y paginacion con datos medidos | Condicionada |
| 15.6 | Coste de QA, regresion y cierre | Reducir coste de QA sin perder cobertura critica | Condicionada |

## 9. Reglas de aceptacion o rechazo

Aceptar una optimizacion solo si:

- Tiene metrica inicial.
- Tiene hipotesis concreta.
- El cambio esta acotado.
- La medicion posterior mejora o estabiliza la metrica objetivo.
- No degrada permisos, RLS, DTOs, errores seguros ni mantenibilidad.
- Pasa las pruebas pactadas para el area.

Rechazar o posponer si:

- No hay metrica inicial.
- La mejora cae dentro de ruido local.
- Requiere cambiar seguridad o dominio para ganar rendimiento marginal.
- Aumenta mucho la complejidad sin impacto observable.
- Optimiza un dataset que no representa un caso real.

## 10. Riesgos especificos

Cache:

- Puede ocultar problemas de RLS o mostrar datos obsoletos.
- Debe evaluarse por ruta y perfil, no de forma global.

RLS:

- Las politicas pueden cambiar el coste real segun rol.
- Las mediciones deben separar admin, supervisor y trabajador cuando aplique.

Datos autenticados:

- No se deben registrar tokens, cookies, emails sensibles ni URLs privadas.
- Las capturas o traces de QA no deben agregarse al commit.

Datos QA:

- El dataset local acumula entidades creadas por pruebas.
- Los recuentos locales explican escala de QA, no escala de produccion.

## 11. Politica antes/despues

Cada subtarea de optimizacion debe documentar:

- Commit base.
- Comando exacto.
- Dataset o flujo usado.
- Resultado antes.
- Cambio aplicado.
- Resultado despues.
- Diferencia absoluta y relativa cuando aplique.
- Codigo de salida.
- Limitaciones.
- Decision final.

## 12. Politica de pruebas

- Cambios documentales: `npm.cmd run diff:check`, `git diff --check`,
  `git diff --stat`, `git status --short`.
- Cambios de bundle/cliente: build, analyzer y spec focal de la ruta afectada.
- Cambios server-side: build, pruebas focales por rol y revision de errores
  parciales.
- Cambios SQL: skill de migracion QA, pruebas SQL, RLS/RPC y tipos generados.
- Cambios de QA tooling: ejecutar spec afectado y justificar si no se corre la
  suite completa.

## 13. Criterios de cierre

La Etapa 15 se cierra cuando:

- Cada optimizacion aprobada tiene evidencia antes/despues.
- Los candidatos sin evidencia quedan descartados o aplazados.
- No hay regresiones de seguridad, permisos, RLS ni DTOs.
- El roadmap y documentos de performance quedan sincronizados.
- La suite o conjunto de pruebas acordado pasa.
- El coste de QA queda caracterizado y, si se modifica, medido.

## 14. Actualizacion 15.2

Fecha: 2026-07-19

La subtarea 15.2 queda completada con harness local reproducible:

- `playwright.performance.config.ts` para Chromium, un worker, `next start` de
  produccion en `127.0.0.1:3100` y sin reutilizar servidor existente.
- `tests/performance/navigation-baseline.spec.ts` para navegacion cold y
  transiciones cliente.
- Scripts en `scripts/performance/` para analyzer, snapshots SQL, diff SQL y
  runner principal.
- Protocolo en `docs/performance/PERFORMANCE_MEASUREMENT_PROTOCOL.md`.
- Scripts npm `perf:*` agregados.

Resultados finales documentados en:

```text
docs/performance/PERFORMANCE_BASELINE.md
```

Evidencia candidata:

- 15.3 puede investigarse si se define una hipotesis concreta sobre el bundle de
  `/dashboard/pedidos/[id]` o `/dashboard/solicitudes/[id]`.
- 15.4 no queda habilitada todavia por navegacion: los detalles internos son
  medibles, pero no prueban problema server-side critico.
- 15.5 requiere atribucion SQL focal antes de proponer indices o cambios de
  consulta.
- 15.6 no debe iniciarse desde 15.2; el coste QA integral no se midio aqui.

No se inicia 15.3 automaticamente. La siguiente subtarea debe elegirse con una
hipotesis medible y un before/after definido.

## 15. Correccion 15.2.1

Fecha: 2026-07-19

La correccion 15.2.1 refuerza la confiabilidad del harness:

- Las navegaciones fallidas ahora hacen fallar `perf:navigation` despues de
  guardar evidencia parcial y cerrar contextos.
- Existe prueba negativa controlada con `PERF_FORCE_NAV_FAILURE=1`.
- SQL usa identidad compuesta `dbid:userid:toplevel:queryid`, conserva
  `dealloc` y falla ventanas no comparables.
- Analyzer falla si falta una ruta critica.

Validacion final:

- Prueba negativa: codigo distinto de cero, muestra fallida preservada, storage
  state eliminado y puerto 3100 libre.
- `npm.cmd run diff:check`: 0.
- `npm.cmd run verify`: 0.
- Auditorias de seguridad, cliente Supabase y tracking publico: 0.
- `npm.cmd run perf:measure`: 0.
- `npm.cmd run perf:navigation`: 0.

15.2 queda completada. 15.3 sigue condicionada y no se inicia desde esta
correccion.

## 16. Correccion 15.2.2

Fecha: 2026-07-19

La correccion 15.2.2 ajusta la ventana temporal de
`client-prefetched-navigation`: `wallTimeMs`, `startedAt` y `sinceStartTime`
representan ahora la misma interaccion logica, desde justo antes del click
hasta URL objetivo y condicion canonica listas. La carga de origen, espera del
heading, busqueda del enlace y resolucion de `href` quedan fuera de la metrica.

Validacion final:

- Prueba negativa: codigo 1 esperado, muestra fallida preservada, storage state
  eliminado y puerto 3100 libre.
- `npm.cmd run diff:check`: 0.
- `npm.cmd run verify`: 0.
- Auditorias de seguridad, cliente Supabase y tracking publico: 0.
- `npm.cmd run perf:measure`: 0.
- `npm.cmd run perf:navigation`: 0.

15.2 queda completada tras 15.2.1 y 15.2.2. 15.3 sigue condicionada y no se
inicia desde esta correccion.
