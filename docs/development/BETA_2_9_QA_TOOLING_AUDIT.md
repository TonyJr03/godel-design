# Beta 2.9.1 - Auditoria focal de QA, Playwright, scripts y tooling

## 1. Objetivo

Auditar el estado actual de QA/tooling del proyecto sin modificar codigo
funcional, tests, helpers, scripts ni configuracion. El alcance cubre
Playwright, specs e2e, helpers e2e, estabilidad de auth/login, ejecucion serial
vs paralela, full visual QA, scripts npm de verificacion, scripts de auditoria,
dependencia de Google Fonts/red durante `build`/`verify` y estrategia local/CI.

Esta auditoria busca decidir como consolidar Beta 2.9 sin perder cobertura ni
ocultar fallos reales.

## 2. Resumen ejecutivo

Estado general:

- La suite e2e tiene cobertura amplia para rutas publicas, login, dashboard,
  clientes, usuarios, storage, Configuracion/templates y full visual QA.
- El total actual de tests e2e Chromium es 26.
- La ejecucion serial conocida pasa 26/26.
- La ejecucion paralela conocida con 8 workers es inestable: aparecen timeouts
  de navegacion y fallos de login/URL.
- Playwright no define `webServer`; los tests asumen que `localhost:3000` ya
  responde.
- `verify` ejecuta `lint` y `build`; `build` depende de `next/font/google` y
  falla sin red cuando no puede descargar Geist/Geist Mono.

Puntos fuertes:

- Los specs focales por dominio reducen dependencia del full visual QA.
- `loginAs` centraliza credenciales por rol desde entorno local o `.env.local`
  sin imprimir secretos.
- `date.ts` evita fechas fijas fragiles.
- `assertions.ts` centraliza terminos sensibles para pantallas internas.
- Playwright conserva screenshots, videos y traces en fallos.
- Scripts de auditoria cubren reglas de seguridad clave.

Riesgos principales:

- La suite paralela comparte los mismos usuarios QA entre specs y workers.
- Algunos specs crean datos persistentes sin cleanup.
- Algunos specs dependen de datos existentes o del estado acumulado.
- `full-visual-qa.spec.ts` es muy amplio, crea y muta muchos datos y duplica
  helper de login.
- No hay `webServer` en Playwright config; esto puede producir fallos locales si
  el servidor no esta levantado o esta saturado.
- `test-results/` y `playwright-report/` no estan ignorados en `.gitignore`.
- `audit:security` informa coincidencias documentales y no falla el proceso; se
  debe interpretar manualmente.

Recomendacion general:

- En Beta 2.9.2 estabilizar primero ejecucion/auth: definir estrategia clara
  serial/paralela, decidir si Playwright debe levantar `webServer`, medir fallos
  con diferentes workers y aislar specs mutantes.
- Mantener `workers=1` como comando confiable temporal documentado, no como
  solucion silenciosa.
- Despues consolidar helpers y reducir duplicacion del full visual QA.

## 3. Mapa de QA e2e actual

| Spec | Cobertura | Tipo de datos | Riesgo | Recomendacion |
|---|---|---|---|---|
| `smoke.spec.ts` | Carga `/solicitud`, `/estado`, `/login` y login admin basico. | Lectura y sesion admin si hay credenciales. | Duplica lectura de `.env.local`; login basico usa timeout default de URL. | Migrar a helper comun de credenciales/login en Beta 2.9.3. |
| `public-solicitud.spec.ts` | Formulario publico, tabs `encargo`/`impresion`, validacion segura. | No persiste solicitud valida; usa validacion negativa. | Define helper sensible local duplicado. | Mantener; evaluar helper publico compartido. |
| `public-tracking.spec.ts` | Tracking publico con referencia invalida y ausencia de terminos sensibles. | No crea datos; solo lectura publica. | Helper sensible local duplicado. | Mantener como smoke publico rapido. |
| `dashboard.spec.ts` | Dashboard por rol, navegacion visible/oculta, rutas protegidas. | Usa usuarios QA compartidos; no crea datos. | Serializado; varios roles en mismo archivo. | Mantener serial; buen candidato no paralelizable por multi-login. |
| `clientes.spec.ts` | Listado clientes, busqueda sin resultados, validacion de nuevo cliente, permisos. | No crea cliente valido; usa query unica con `Date.now()`. | Puede sufrir timeouts paralelos en rutas internas. | Mantener; revisar timeouts tras estabilizar auth/server. |
| `usuarios.spec.ts` | Listado usuarios, filtros, formulario de perfil invalido, permisos. | No crea perfil valido. | Usa textos ligados a Supabase Auth; correcto pero sensible a copy. | Mantener; no bajar asserts de seguridad. |
| `storage.spec.ts` | Secciones de archivos pedido/solicitud, rutas download, upload bloqueado, tracking sin storage. | Depende de primer pedido/solicitud existente; crea intento publico invalido. | Tests internos pueden skippear si no hay fixtures; paralelismo puede afectar navegacion. | Definir fixtures minimas o documentar precondicion. |
| `task-templates.spec.ts` | Configuracion/templates: roles, CRUD plantilla, tareas, aplicar a encargo, ausencia en impresion. | Crea plantillas y pedidos QA persistentes. | Serializado; depende de orden interno entre tests y datos creados. | Mantener serial/no paralelizable; evaluar cleanup o prefijo QA. |
| `full-visual-qa.spec.ts` | Recorrido end-to-end amplio: solicitudes publicas, conversion, pedidos, tareas, pagos, storage, roles y screenshots dashboard. | Crea solicitudes, clientes, pedidos, pagos, archivos y asignaciones persistentes. | Muy amplio, mutante, serial, timeout alto; duplica login y genera screenshots en `test-results`. | Mantener como aceptacion de release; mover cobertura repetida a specs focales. |

Total actual: 26 declaraciones `test(...)` en `tests/e2e`.

## 4. Helpers e2e

### `tests/e2e/helpers/auth.ts`

Fortalezas:

- Lee credenciales desde variables de entorno o `.env.local`.
- No hardcodea secretos.
- Soporta roles `admin`, `supervisor` y `worker`.
- Limpia cookies antes de navegar a `/login`.
- Limpia `localStorage` y `sessionStorage`.
- Espera URL `/dashboard` y heading de dashboard con timeout de 20 segundos.

Riesgos:

- Todos los workers comparten las mismas credenciales por rol.
- No usa `storageState` por rol ni setup global.
- Cada test hace login real, lo que multiplica carga sobre Auth y servidor.
- `clearCookies` solo limpia el contexto actual; no aisla datos persistidos en
  base.
- Si el servidor esta lento, muchos tests concurrentes pueden quedarse esperando
  `/login` o `/dashboard`.

### `tests/e2e/helpers/assertions.ts`

Fortalezas:

- Centraliza patrones sensibles internos.
- Reutilizado en dashboard, clientes, usuarios y task-templates.
- `expectAccessLimitedPage()` combina URL `/sin-permisos`, copy seguro y ausencia
  de terminos sensibles.

Riesgos:

- El patron `metadata` es util para UI publica o pantallas internas sin ficha
  tecnica, pero no aplica a todas las pantallas internas: el detalle de pedido
  muestra una seccion legitima llamada "Metadata".
- Hay helpers sensibles duplicados en specs publicos y storage.

### `tests/e2e/helpers/date.ts`

Fortalezas:

- Genera fechas futuras dinamicas en formato `YYYY-MM-DD`.
- Usa componentes locales, evitando desfase UTC.
- Ya se usa en `full-visual-qa.spec.ts` y `task-templates.spec.ts`.

Riesgos:

- Ninguno critico; conviene mantenerlo como helper estandar para fechas de
  formularios.

### Otros helpers

No hay mas archivos en `tests/e2e/helpers/`.

## 5. Diagnostico de ejecucion serial vs paralela

Resultado serial actual conocido:

- `npm.cmd run test:e2e -- --project=chromium --workers=1`
- Resultado: 26/26.

Resultado paralelo actual conocido:

- `npm.cmd run test:e2e -- --project=chromium`
- Resultado observado: 19 passed, 5 failed, 2 did not run.

Patrones de fallo observados en paralelo:

- Login queda en `/login` cuando se esperaba `/dashboard`.
- `page.goto("/login")`, `/dashboard/clientes/nuevo` o `/dashboard/pedidos`
  agotan timeout.
- `full-visual-qa.spec.ts` falla en login admin.
- `smoke.spec.ts` falla en login admin.
- `clientes.spec.ts` y `storage.spec.ts` fallan por timeouts de navegacion.
- `task-templates.spec.ts` falla al navegar a `/login` durante un cambio de rol.

Hipotesis principal:

- La inestabilidad paralela parece causada por combinacion de carga local del
  servidor, logins concurrentes con los mismos usuarios QA y specs mutantes que
  crean o modifican datos persistentes. No hay evidencia de bug funcional si la
  suite serial y los specs focales aislados pasan.

Evidencia disponible:

- `task-templates.spec.ts` aislado paso 3/3.
- `full-visual-qa.spec.ts` aislado paso 1/1.
- Suite Chromium serial paso 26/26.
- Suite Chromium paralela fallo en login/navegacion/timeouts, no en asserts de
  negocio consistentes.

Que conviene probar en Beta 2.9.2:

- Repetir suite con `--workers=1`, `--workers=2` y `--workers=4`.
- Medir si los fallos aparecen solo con specs autenticados.
- Ejecutar public specs en paralelo y autenticados en serial.
- Evaluar `webServer` en Playwright o script npm que levante dev server de forma
  controlada.
- Evaluar `storageState` por rol generado en setup, sin compartir un mismo page
  ni contexto.
- Etiquetar o agrupar specs mutantes como serial/no paralelizables.

## 6. Playwright config

Archivo: `playwright.config.ts`.

Configuracion actual:

- `testDir`: `./tests/e2e`.
- `baseURL`: `http://localhost:3000`.
- `screenshot`: `only-on-failure`.
- `trace`: `retain-on-failure`.
- `video`: `retain-on-failure`.
- Projects:
  - `chromium` con `Desktop Chrome`.
  - `edge` con `Desktop Edge` y `channel: "msedge"`.

Ausencias relevantes:

- No define `webServer`.
- No define `workers`.
- No define `fullyParallel`.
- No define `retries`.
- No define timeout global.
- No define `outputDir`.
- No define `storageState`.

Implicaciones:

- Playwright usa defaults de la version instalada.
- En local, los tests requieren que `localhost:3000` ya este levantado.
- La suite paralela puede usar varios workers por defecto.
- Los artefactos van al comportamiento default de Playwright (`test-results/` y
  reportes relacionados).

## 7. Full visual QA

Archivo: `tests/e2e/full-visual-qa.spec.ts`.

Alcance:

- Solicitud publica `encargo`.
- Solicitud publica `impresion` con archivo.
- Tracking publico por referencias validas e invalidas.
- Login admin.
- Capturas desktop/mobile del dashboard admin.
- Gestion de solicitud hasta conversion a pedido.
- Creacion de pedido manual `encargo`.
- Reglas de tareas, progreso, estado y pago.
- Creacion de pedido manual `impresion`.
- Upload de archivo interno.
- Asignacion de trabajador.
- Login supervisor y restricciones.
- Login worker y restricciones.
- Tracking publico final de pedidos.

Beneficios:

- Muy buen recorrido de aceptacion end-to-end.
- Valida integracion entre dominios.
- Captura evidencia visual del dashboard.
- Usa fecha futura dinamica.

Riesgos:

- Es grande y dificil de diagnosticar cuando falla.
- Crea muchos datos persistentes.
- Duplica logica de credenciales y `loginAs` en lugar de usar helper comun.
- Tiene timeout de 300 segundos.
- Usa selectors por texto y secciones; razonable, pero sensible a cambios de
  copy.
- Genera screenshots en `test-results/`, carpeta no ignorada actualmente.
- Si corre en paralelo con otros specs mutantes aumenta carga y flakiness.

Que debe seguir cubriendo:

- Recorrido de aceptacion de release.
- Integracion publica-interna.
- Roles principales.
- Evidencia visual minima desktop/mobile.

Que podria moverse a specs focales:

- Validaciones de storage.
- Validaciones de dashboard por rol.
- Flujos de plantillas.
- Validaciones de formularios publicos.
- Casos negativos de tracking.

## 8. Scripts de auditoria

| Script | Que valida | Riesgo de falso positivo/negativo | Recomendacion |
|---|---|---|---|
| `diff:check` | Ejecuta `git diff --check` para detectar whitespace problematico y marcadores de conflicto en el diff. | No revisa archivos sin cambios ni reglas semanticas. | Mantener como gate rapido antes de cerrar tareas. |
| `audit:security` | Escanea `src`, `supabase`, `docs` y `AGENTS.md` buscando `service_role`, `SUPABASE_SERVICE_ROLE_KEY` y `auth.users`. | Muchos falsos positivos documentales; no falla aunque haya coincidencias. Puede generar falso negativo si el uso peligroso evita esos textos exactos. | Mantener, pero documentar que requiere interpretacion manual; evaluar allowlist o modo estricto para app code. |
| `audit:client-supabase` | Escanea `src/components` buscando `supabase` o `createClient()`. | Puede marcar texto inocente; puede no detectar imports alias o llamadas indirectas. | Mantener; util para regla "componentes no consultan Supabase". |
| `audit:public-tracking` | Escanea `src/lib/public-tracking`, `src/app/estado` y `src/components/tracking` buscando `order_number`, `pedido_pagos`, `file_path`. | Limitado a tres patrones y tres raices; podria no detectar otros campos sensibles. | Mantener; ampliar solo si aparecen nuevos campos publicos sensibles. |
| `verify` | Ejecuta `npm run lint && npm run build`. | Depende de red por `next/font/google`; no ejecuta tests ni auditorias. | Mantener como build gate; resolver o documentar dependencia de fuentes externas. |

Nota: no existe `scripts/diff-check.mjs`; `diff:check` esta implementado
directamente como `git diff --check` en `package.json`.

## 9. Dependencia de Google Fonts/red

`src/app/layout.tsx` importa:

- `Geist` desde `next/font/google`.
- `Geist_Mono` desde `next/font/google`.

`src/app/globals.css` consume:

- `--font-geist-sans`;
- `--font-geist-mono`.

Por que falla sin red:

- Durante `next build`, Next/Turbopack intenta descargar CSS/fonts desde
  `https://fonts.googleapis.com`.
- En sandbox o entornos sin salida a red, `next/font` no puede obtener Geist ni
  Geist Mono.
- `npm.cmd run verify` falla porque ejecuta `npm run build`.

Opciones:

- Mantenerlo documentado y permitir red en build local/CI.
- Migrar a fuente local con `next/font/local`.
- Usar fallback tipografico sin dependencia externa.
- Dejar la decision para fase UI/infra si se quiere conservar Geist.

Recomendacion para Beta 2.9:

- No resolverlo dentro de la auditoria.
- En Beta 2.9.5 decidir si `verify` debe ser 100% offline o si CI/local tendran
  red garantizada.

## 10. Estrategia recomendada local/CI

Comando confiable local:

```bash
npm.cmd run test:e2e -- --project=chromium --workers=1
```

Comando rapido local:

```bash
npm.cmd run test:e2e -- --project=chromium tests/e2e/<spec>.spec.ts
```

Comando CI estricto recomendado a evaluar:

```bash
npm.cmd run diff:check
npm.cmd run audit:security
npm.cmd run audit:client-supabase
npm.cmd run audit:public-tracking
npm.cmd run verify
npm.cmd run test:e2e -- --project=chromium --workers=1
```

Modo temporal si la suite paralela sigue fallando:

- Public specs pueden ejecutarse en paralelo.
- Specs autenticados o mutantes deben ejecutarse serializados hasta que auth y
  datos queden aislados.
- No configurar `workers=1` como solucion silenciosa: debe quedar documentado
  como modo estable temporal.

Artefactos:

- Limpiar `test-results/`, `playwright-report/` y `debug.log` despues de runs
  locales si fueron generados.
- Evaluar agregar `test-results/` y `playwright-report/` a `.gitignore` en una
  subfase de tooling.

## 11. Hallazgos clasificados

| Severidad | Area | Hallazgo | Riesgo | Recomendacion |
| --------- | ---- | -------- | ------ | ------------- |
| Medio | Paralelismo | Suite Chromium paralela falla con logins, URLs y timeouts, mientras serial pasa 26/26. | Ruido en QA y baja confianza en CI paralelo. | Beta 2.9.2 debe estabilizar auth/worker strategy antes de cambiar cobertura. |
| Medio | Auth | Todos los specs autenticados comparten los mismos usuarios QA y hacen login real concurrente. | Sesiones/Auth/server bajo carga pueden provocar flakiness. | Evaluar `storageState` por rol, setup global o serializacion de specs autenticados. |
| Medio | Datos | `full-visual-qa.spec.ts` y `task-templates.spec.ts` crean datos persistentes sin cleanup. | Contaminacion gradual, listados mas pesados y resultados dependientes del estado. | Mantener prefijos QA; evaluar cleanup seguro o fixtures controladas. |
| Medio | Playwright config | No existe `webServer` configurado. | Runs locales fallan si la app no esta levantada o si el servidor activo no corresponde. | Decidir entre `webServer` en config o script explicito de dev server. |
| Medio | Build | `verify` depende de Google Fonts/red por `next/font/google`. | Falsos fallos en sandbox/offline. | Resolver con fuente local o documentar red obligatoria en build. |
| Bajo | Artefactos | `test-results/` y `playwright-report/` no estan ignorados. | Riesgo de ensuciar commits con videos/traces/screenshots. | Agregar ignore en subfase de tooling si se aprueba. |
| Bajo | Helpers | Hay duplicacion de lectura de credenciales y helpers sensibles en specs. | Mantenimiento repetitivo y diferencias de timeouts. | Consolidar helpers e2e en Beta 2.9.3. |
| Bajo | Full visual QA | Spec muy amplio con timeout alto y mucha mutacion. | Diagnostico lento cuando falla. | Mantener como aceptacion, pero mover checks repetibles a specs focales. |
| Observacion | Scripts | `audit:security` reporta coincidencias documentales y sale con codigo 0. | Requiere interpretacion humana; no bloquea por si solo usos peligrosos. | Crear modo app-code estricto o allowlist futura si hace falta. |
| Observacion | Fechas | `date.ts` ya usa fechas futuras dinamicas locales. | Reduce fragilidad temporal. | Mantener como estandar para formularios con fechas. |

No se detecta hallazgo critico en scripts: no hay evidencia de que oculten un
bypass real de seguridad. Los falsos positivos documentales de `audit:security`
estan documentados como salida informativa.

## 12. Plan recomendado para Beta 2.9

1. Beta 2.9.2 - Estabilizar Playwright/auth y estrategia serial/paralela.
   - Medir `workers=1/2/4/default`.
   - Confirmar si public specs pueden correr en paralelo.
   - Definir si specs autenticados/mutantes quedan serializados.
   - Evaluar `webServer` o script local estandar.

2. Beta 2.9.3 - Consolidar helpers e2e y assertions sensibles.
   - Unificar lectura de credenciales.
   - Hacer que `full-visual-qa.spec.ts` use helper comun o documentar excepcion.
   - Separar assertions sensibles internas/publicas/storage.
   - Revisar `metadata` para evitar falsos positivos en pantallas internas.

3. Beta 2.9.4 - Revisar full visual QA y specs focales.
   - Mantener full visual como aceptacion.
   - Identificar pasos que ya cubren specs focales.
   - Reducir duplicacion sin perder integracion critica.

4. Beta 2.9.5 - Consolidar scripts de auditoria y verify.
   - Decidir politica de Google Fonts/red.
   - Evaluar `.gitignore` para artefactos Playwright.
   - Evaluar modo estricto/allowlist para `audit:security`.

5. Beta 2.9.6 - Documentar estrategia QA/tooling y cerrar Beta 2.9.
   - Documentar comandos local/CI.
   - Registrar limites de paralelismo.
   - Registrar limpieza de artefactos y expectativas de credenciales.

## 13. Que NO conviene hacer

- No tocar app code para hacer pasar tests.
- No ocultar fallos reales bajando asserts.
- No borrar cobertura util.
- No configurar `workers=1` como solucion silenciosa sin documentarlo.
- No depender de datos reales fragiles.
- No crear fixtures complejas prematuras.
- No mezclar QA/tooling con UI/UX.
- No instalar dependencias sin necesidad.
- No cambiar seguridad para facilitar tests.
- No relajar RLS, permisos o validaciones para reducir flakiness.
- No convertir el full visual QA en unico gate de calidad.

## 14. Checklist de cierre de auditoria

- [x] Reviso `tests/e2e`.
- [x] Reviso helpers.
- [x] Reviso Playwright config.
- [x] Reviso scripts.
- [x] Reviso package scripts.
- [x] Reviso dependencia de Google Fonts.
- [x] Reviso flakiness serial/paralela.
- [x] Propuso subfases.
- [x] No modifico codigo funcional.
