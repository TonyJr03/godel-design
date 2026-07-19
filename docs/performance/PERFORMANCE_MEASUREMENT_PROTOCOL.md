# Protocolo de medicion de rendimiento - Etapa 15.2

Fecha de apertura: 2026-07-19

## 1. Objetivo

Este protocolo define como medir rendimiento local en Godel Diseño antes de
aprobar optimizaciones. El harness no cambia aplicacion, consultas, indices,
cache, paginacion ni componentes; solo produce evidencia comparable.

Los resultados locales en Windows son evidencia de desarrollo, no equivalentes
a produccion.

## 2. Comando oficial

Comando principal:

```text
npm.cmd run perf:measure
```

Si Supabase local no esta disponible y se necesita medir solo bundle y
navegacion:

```text
npm.cmd run perf:measure -- --skip-sql
```

Una corrida con `--skip-sql` queda incompleta para decisiones SQL.

Comandos auxiliares:

```text
npm.cmd run perf:bundle
npm.cmd run perf:navigation
npm.cmd run perf:pg:snapshot -- before
npm.cmd run perf:pg:snapshot -- after
npm.cmd run perf:pg:diff
```

## 3. Artefactos locales

Todos los artefactos generados viven en:

```text
.next/diagnostics/performance/
```

Archivos esperados:

- `navigation-results.json`
- `bundle-summary.json`
- `pg-stat-before.json`
- `pg-stat-after.json`
- `pg-stat-diff.json`
- `run-metadata.json`

La carpeta `.next/` esta ignorada por git. No se deben copiar storage states,
cookies, tokens, SQL completo ni URLs privadas a documentos versionados.

## 4. Entorno controlado

Cada corrida debe registrar:

- rama y commit;
- Node, npm y Next.js;
- sistema operativo, CPU y memoria;
- puerto `127.0.0.1:3100` libre;
- estado de Supabase local o uso explicito de `--skip-sql`;
- resultado de `npm run build`;
- comandos ejecutados y codigos de salida.

El harness usa `next start` en modo produccion despues de build, Chromium, un
worker, sin paralelismo y `reuseExistingServer: false`. Si el puerto 3100 esta
ocupado, el proceso falla; no mata procesos ni elige otro puerto.

## 5. Navegacion

Rutas medidas:

- Publicas: `/`, `/solicitud`, `/estado`.
- Internas admin: `/dashboard`, `/dashboard/pedidos`,
  `/dashboard/pedidos/[id]`, `/dashboard/solicitudes`,
  `/dashboard/solicitudes/[id]`.

El login admin se prepara fuera de las muestras. El storage state temporal vive
solo en `.next/diagnostics/performance/` y se elimina al terminar el spec.

Los detalles de pedido y solicitud se descubren desde sus listados antes de las
muestras. No se hardcodean UUIDs ni se crean datos.

Modos:

- `cold-document-navigation`: contexto nuevo por muestra, una navegacion de
  documento.
- `client-prefetched-navigation`: transicion por enlace real desde la UI,
  preservando el prefetch de Next.js.

En `client-prefetched-navigation`, `wallTimeMs` comienza inmediatamente antes
del click sobre el enlace real y finaliza cuando la URL objetivo y la condicion
canonica del destino estan listas. La carga, espera del heading, localizacion
del enlace y preparacion de la ruta de origen quedan fuera de la metrica.
Resource Timing y `wallTimeMs` comparten la misma ventana logica: el inicio de
la interaccion medida.

Cada ruta o transicion usa 1 warmup excluido y 5 muestras medidas. Se registran
wall time, eventos de navegacion, bytes de documento, scripts, estilos, imagenes,
fuentes, fetch/RSC, recursos, HTTP status, exito y error.

Una muestra fallida se conserva en `navigation-results.json` con `success:
false`, mensaje de error saneado y clasificacion `unreliable`; despues de
registrarla y cerrar contexto/pagina, el spec falla con codigo distinto de cero.
Un warmup fallido tambien se registra como `sample: 0` y provoca fallo del
comando. La ruta, modo, numero de muestra y causa deben aparecer en el error sin
UUIDs, cookies ni credenciales.

No se usan `waitForTimeout`; las esperas se basan en URL, headings o regiones
canonicas.

Prueba negativa local:

```text
$env:PERF_FORCE_NAV_FAILURE="1"; npm.cmd run perf:navigation
```

La variable esta desactivada por defecto. Cuando se activa, una ruta publica usa
un heading inexistente para demostrar que el harness no oculta fallos.

## 6. Bundle

El resumen de bundle usa:

```text
next experimental-analyze --output
```

Next.js 16 escribe la salida en `.next/diagnostics/analyze`. El script
`summarize-next-analyze.mjs` extrae `clientGraphBytes`, `serverGraphBytes`,
`sourceCount`, `topClientSources` y `topServerSources` para rutas criticas.

Estos bytes son del grafo del analyzer, no transferencia de red ni First Load
JS. La metrica es explicativa y experimental; si el formato de Next cambia, el
script debe fallar. Si falta el `analyze.data` de una ruta critica, el resumen
no se escribe como valido y el comando termina con codigo distinto de cero.

## 7. SQL

Los snapshots SQL usan `docker exec` contra el contenedor local
`supabase_db_godel-design` por defecto. No usan credenciales externas ni
`service_role`.

`pg-stat-snapshot.mjs` captura `pg_stat_statements` antes y despues del flujo,
filtrado a la base actual. No resetea estadisticas ni modifica datos.

La identidad local de cada fila es compuesta:

```text
dbid:userid:toplevel:queryid
```

El snapshot conserva `dbid`, `userid`, `toplevel`, `queryid`, `calls`,
`totalExecTimeMs`, `rows`, `normalizedQuery`, `statsReset` y `dealloc`.

`pg-stat-diff.mjs` calcula deltas por esa clave compuesta, ignora deltas
negativos y falla si `statsReset` cambia. Si `dealloc` cambia, la ventana se
declara no confiable y el comando falla. Cuando aparece una entrada nueva en el
snapshot posterior y la ventana es comparable, se calculan deltas contra
contadores anteriores en cero.

El diff de consola es anonimizado. El SQL normalizado completo queda solo en el
artefacto local ignorado por git.

## 8. Clasificacion de ruido

Para cada ruta o transicion:

```text
relativeSpread = (max - min) / median
```

Clasificacion:

- `stable`: 0 fallos y `relativeSpread <= 0.15`.
- `noisy`: 0 fallos y `0.15 < relativeSpread <= 0.30`.
- `unreliable`: fallos o `relativeSpread > 0.30`.

Una optimizacion no se aprueba si la mejora cae dentro del ruido local.

## 9. Umbrales de decision

Navegacion:

- baseline estable;
- mejora de mediana `>= 10%` y `>= 50 ms`;
- ninguna ruta relacionada empeora mas de `10%`.

Transferencia:

- reduccion de al menos `10 KiB` o `5%` en la superficie relevante.

Analyzer:

- evidencia explicativa; no aprueba por si solo una optimizacion de usuario.

SQL:

- ventana comparable;
- query atribuible al flujo;
- delta de tiempo controlado con mejora `>= 15%`.

Build:

- 3 corridas comparables cuando se use como metrica objetivo;
- ruido menor a `10%`.

QA:

- mejora relevante si reduce mas de `10%` o mas de `30 s`;
- sin perdida de cobertura critica.

## 10. Repetir o rechazar

Repetir medicion si:

- hay fallos;
- la ruta queda `unreliable`;
- el puerto estaba ocupado;
- Supabase no estaba disponible para una decision SQL;
- hubo procesos locales extraordinarios;
- el build o analyzer no termino con codigo 0.

Rechazar o posponer optimizacion si:

- no tiene baseline medido;
- solo mejora una metrica auxiliar sin impacto navegable o SQL;
- degrada seguridad, RLS, permisos, DTOs o mantenibilidad;
- requiere cache, indices, paginacion o refactor amplio sin evidencia fuerte.

## 11. Antes y despues

Cada subtarea de optimizacion posterior debe documentar:

- commit base;
- comando exacto;
- dataset o flujo;
- resultado antes;
- cambio aplicado;
- resultado despues;
- diferencia absoluta y relativa;
- codigo de salida;
- limitaciones;
- decision final.
