# Beta 2.9.1 - Auditoria focal de QA, Playwright, scripts y tooling

## 1. Objetivo

Auditar el estado actual de QA/tooling del proyecto sin modificar código
funcional, tests, helpers, scripts ni configuración. El alcance cubre
Playwright, specs e2e, helpers e2e, estabilidad de auth/login, ejecución serial
vs paralela, full visual QA, scripts npm de verificacion, scripts de auditoría,
dependencia de Google Fonts/red durante `build`/`verify` y estrategia local/CI.

Esta auditoría busca decidir como consolidar Beta 2.9 sin perder cobertura ni
ocultar fallos reales.

## 2. Resumen ejecutivo

Estado general inicial de Beta 2.9.1:

- La suite e2e tiene cobertura amplia para rutas públicas, login, dashboard,
  clientes, usuarios, storage, Configuración/templates y full visual QA.
- El total inicial de tests e2e Chromium era 26.
- La ejecución serial inicial conocida pasaba 26/26.
- La ejecución paralela conocida con 8 workers es inestable: aparecen timeouts
  de navegación y fallos de login/URL.
- En Beta 2.9.1, Playwright no definia `webServer`; desde Beta 2.9.7 ya lo
  define con `npm run dev` y reutilizacion local.
- En Beta 2.9.1, `verify` dependía de `next/font/google`; desde Beta 2.9.6
  pasa offline con system font stack.
- Estado de cierre Beta 2.9.8: 11 specs e2e, 30 tests Chromium esperados,
  suite serial 30/30 y full visual QA 1/1.

Puntos fuertes:

- Los specs focales por dominio reducen dependencia del full visual QA.
- `loginAs` centraliza credenciales por rol desde entorno local o `.env.local`
  sin imprimir secretos.
- `date.ts` evita fechas fijas fragiles.
- `assertions.ts` centraliza términos sensibles para pantallas internas.
- Playwright conserva screenshots, videos y traces en fallos.
- Scripts de auditoría cubren reglas de seguridad clave.

Riesgos principales:

- La suite paralela comparte los mismos usuarios QA entre specs y workers.
- Algunos specs crean datos persistentes sin cleanup.
- Algunos specs dependen de datos existentes o del estado acumulado.
- `full-visual-qa.spec.ts` es muy amplio, crea y muta muchos datos y duplica
  helper de login.
- No hay `webServer` en Playwright config; esto puede producir fallos locales si
  el servidor no esta levantado o esta saturado.
- `test-results/` y `playwright-report/` no están ignorados en `.gitignore`.
- `audit:security` informa coincidencias documentales y no falla el proceso; se
  debe interpretar manualmente.

Recomendación general:

- En Beta 2.9.2 estabilizar primero ejecución/auth: definir estrategia clara
  serial/paralela, decidir si Playwright debe levantar `webServer`, medir fallos
  con diferentes workers y aislar specs mutantes.
- Mantener `workers=1` como comando confiable temporal documentado, no como
  solución silenciosa.
- Después consolidar helpers y reducir duplicacion del full visual QA.

## 3. Mapa de QA e2e actual

| Spec | Cobertura | Tipo de datos | Riesgo | Recomendación |
|---|---|---|---|---|
| `smoke.spec.ts` | Carga `/solicitud`, `/estado`, `/login` y login admin básico. | Lectura y sesión admin si hay credenciales. | Duplica lectura de `.env.local`; login básico usa timeout default de URL. | Migrar a helper común de credenciales/login en Beta 2.9.3. |
| `public-solicitud.spec.ts` | Formulario público, tabs `encargo`/`impresion`, validación segura. | No persiste solicitud válida; usa validación negativa. | Define helper sensible local duplicado. | Mantener; evaluar helper público compartido. |
| `public-tracking.spec.ts` | Tracking público con referencia inválida y ausencia de términos sensibles. | No crea datos; solo lectura pública. | Helper sensible local duplicado. | Mantener como smoke público rapido. |
| `dashboard.spec.ts` | Dashboard por rol, navegación visible/oculta, rutas protegidas. | Usa usuarios QA compartidos; no crea datos. | Serializado; varios roles en mismo archivo. | Mantener serial; buen candidato no paralelizable por multi-login. |
| `clientes.spec.ts` | Listado clientes, búsqueda sin resultados, validación de nuevo cliente, permisos. | No crea cliente válido; usa query única con `Date.now()`. | Puede sufrir timeouts paralelos en rutas internas. | Mantener; revisar timeouts tras estabilizar auth/server. |
| `usuarios.spec.ts` | Listado usuarios, filtros, formulario de perfil inválido, permisos. | No crea perfil válido. | Usa textos ligados a Supabase Auth; correcto pero sensible a copy. | Mantener; no bajar asserts de seguridad. |
| `storage.spec.ts` | Secciones de archivos pedido/solicitud, rutas download, upload bloqueado, tracking sin storage. | Depende de primer pedido/solicitud existente; crea intento público inválido. | Tests internos pueden skippear si no hay fixtures; paralelismo puede afectar navegación. | Definir fixtures minimas o documentar precondicion. |
| `task-templates.spec.ts` | Configuración/templates: roles, CRUD plantilla, tareas, aplicar a encargo, ausencia en impresión. | Crea plantillas y pedidos QA persistentes. | Serializado; depende de orden interno entre tests y datos creados. | Mantener serial/no paralelizable; evaluar cleanup o prefijo QA. |
| `full-visual-qa.spec.ts` | Recorrido end-to-end amplio: solicitudes públicas, conversión, pedidos, tareas, pagos, storage, roles y screenshots dashboard. | Crea solicitudes, clientes, pedidos, pagos, archivos y asignaciones persistentes. | Muy amplio, mutante, serial, timeout alto; duplica login y genera screenshots en `test-results`. | Mantener como aceptación de release; mover cobertura repetida a specs focales. |

Total inicial: 26 declaraciones `test(...)` en `tests/e2e`.
Total de cierre Beta 2.9.8: 30 tests Chromium esperados.

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
  de términos sensibles.

Riesgos:

- El patrón `metadata` es útil para UI pública o pantallas internas sin ficha
  técnica, pero no aplica a todas las pantallas internas: el detalle de pedido
  muestra una sección legítima llamada "Metadata".
- Hay helpers sensibles duplicados en specs públicos y storage.

### `tests/e2e/helpers/date.ts`

Fortalezas:

- Genera fechas futuras dinámicas en formato `YYYY-MM-DD`.
- Usa componentes locales, evitando desfase UTC.
- Ya se usa en `full-visual-qa.spec.ts` y `task-templates.spec.ts`.

Riesgos:

- Ninguno crítico; conviene mantenerlo como helper estándar para fechas de
  formularios.

### Otros helpers

No hay más archivos en `tests/e2e/helpers/`.

## 5. Diagnóstico de ejecución serial vs paralela

Resultado serial inicial conocido:

- `npm.cmd run test:e2e -- --project=chromium --workers=1`
- Resultado: 26/26.

Resultado serial de cierre Beta 2.9.8:

- `npm.cmd run test:e2e:chromium:serial`
- Resultado: 30/30.

Resultado paralelo actual conocido:

- `npm.cmd run test:e2e -- --project=chromium`
- Resultado observado: 19 passed, 5 failed, 2 did not run.

Patrones de fallo observados en paralelo:

- Login queda en `/login` cuando se esperaba `/dashboard`.
- `page.goto("/login")`, `/dashboard/clientes/nuevo` o `/dashboard/pedidos`
  agotan timeout.
- `full-visual-qa.spec.ts` falla en login admin.
- `smoke.spec.ts` falla en login admin.
- `clientes.spec.ts` y `storage.spec.ts` fallan por timeouts de navegación.
- `task-templates.spec.ts` falla al navegar a `/login` durante un cambio de rol.

Hipotesis principal:

- La inestabilidad paralela parece causada por combinación de carga local del
  servidor, logins concurrentes con los mismos usuarios QA y specs mutantes que
  crean o modifican datos persistentes. No hay evidencia de bug funcional si la
  suite serial y los specs focales aislados pasan.

Evidencia disponible:

- `task-templates.spec.ts` aislado paso 3/3.
- `full-visual-qa.spec.ts` aislado paso 1/1.
- Suite Chromium serial paso 26/26.
- Suite Chromium paralela falló en login/navegación/timeouts, no en asserts de
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

Configuración observada en Beta 2.9.1:

- `testDir`: `./tests/e2e`.
- `baseURL`: `http://localhost:3000`.
- `screenshot`: `only-on-failure`.
- `trace`: `retain-on-failure`.
- `video`: `retain-on-failure`.
- Projects:
  - `chromium` con `Desktop Chrome`.
  - `edge` con `Desktop Edge` y `channel: "msedge"`.

Ausencias relevantes en Beta 2.9.1:

- No define `webServer`.
- No define `workers`.
- No define `fullyParallel`.
- No define `retries`.
- No define timeout global.
- No define `outputDir`.
- No define `storageState`.

Estado de cierre Beta 2.9.8:

- Define `webServer` con `npm run dev`, `http://localhost:3000`,
  `reuseExistingServer: !process.env.CI` y `timeout: 120_000`.
- No fija `workers` globalmente.
- Mantiene la suite serial Chromium como gate temporal explícito.

Implicaciones:

- Playwright usa defaults de la version instalada.
- En local, los tests requieren que `localhost:3000` ya este levantado.
- La suite paralela puede usar varios workers por defecto.
- Los artefactos van al comportamiento default de Playwright (`test-results/` y
  reportes relacionados).

## 7. Full visual QA

Archivo: `tests/e2e/full-visual-qa.spec.ts`.

Alcance:

- Solicitud pública `encargo`.
- Solicitud pública `impresion` con archivo.
- Tracking público por referencias válidas e inválidas.
- Login admin.
- Capturas desktop/mobile del dashboard admin.
- Gestión de solicitud hasta conversion a pedido.
- Creación de pedido manual `encargo`.
- Reglas de tareas, progreso, estado y pago.
- Creación de pedido manual `impresion`.
- Upload de archivo interno.
- Asignación de trabajador.
- Login supervisor y restricciones.
- Login worker y restricciones.
- Tracking público final de pedidos.

Beneficios:

- Muy buen recorrido de aceptación end-to-end.
- Valida integración entre dominios.
- Captura evidencia visual del dashboard.
- Usa fecha futura dinámica.

Riesgos:

- Es grande y difícil de diagnosticar cuando falla.
- Crea muchos datos persistentes.
- Duplica lógica de credenciales y `loginAs` en lugar de usar helper común.
- Tiene timeout de 300 segundos.
- Usa selectors por texto y secciones; razonable, pero sensible a cambios de
  copy.
- Genera screenshots en `test-results/`, carpeta no ignorada actualmente.
- Si corre en paralelo con otros specs mutantes aumenta carga y flakiness.

Que debe seguir cubriendo:

- Recorrido de aceptación de release.
- Integración pública-interna.
- Roles principales.
- Evidencia visual mínima desktop/mobile.

Que podría moverse a specs focales:

- Validaciones de storage.
- Validaciones de dashboard por rol.
- Flujos de plantillas.
- Validaciones de formularios públicos.
- Casos negativos de tracking.

## 8. Scripts de auditoría

| Script | Que valida | Riesgo de falso positivo/negativo | Recomendación |
|---|---|---|---|
| `diff:check` | Ejecuta `git diff --check` para detectar whitespace problemático y marcadores de conflicto en el diff. | No revisa archivos sin cambios ni reglas semánticas. | Mantener como gate rápido antes de cerrar tareas. |
| `audit:security` | Escanea `src`, `supabase`, `docs` y `AGENTS.md` buscando `service_role`, `SUPABASE_SERVICE_ROLE_KEY` y `auth.users`. | Muchos falsos positivos documentales; no falla aunque haya coincidencias. Puede generar falso negativo si el uso peligroso evita esos textos exactos. | Mantener, pero documentar que requiere interpretacion manual; evaluar allowlist o modo estricto para app code. |
| `audit:client-supabase` | Escanea `src/components` buscando `supabase` o `createClient()`. | Puede marcar texto inocente; puede no detectar imports alias o llamadas indirectas. | Mantener; útil para regla "componentes no consultan Supabase". |
| `audit:public-tracking` | Escanea `src/lib/public-tracking`, `src/app/estado` y `src/components/tracking` buscando `order_number`, `pedido_pagos`, `file_path`. | Limitado a tres patrones y tres raíces; podría no detectar otros campos sensibles. | Mantener; ampliar solo si aparecen nuevos campos públicos sensibles. |
| `verify` | Ejecuta `npm run lint && npm run build`. | Depende de red por `next/font/google`; no ejecuta tests ni auditorías. | Mantener como build gate; resolver o documentar dependencia de fuentes externas. |

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
- Dejar la decisión para fase UI/infra si se quiere conservar Geist.

Recomendación para Beta 2.9:

- No resolverlo dentro de la auditoría.
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
- No configurar `workers=1` como solución silenciosa: debe quedar documentado
  como modo estable temporal.

Artefactos:

- Limpiar `test-results/`, `playwright-report/` y `debug.log` después de runs
  locales si fueron generados.
- Evaluar agregar `test-results/` y `playwright-report/` a `.gitignore` en una
  subfase de tooling.

## 11. Hallazgos clasificados

| Severidad | Área | Hallazgo | Riesgo | Recomendación |
| --------- | ---- | -------- | ------ | ------------- |
| Medio | Paralelismo | Suite Chromium paralela falla con logins, URLs y timeouts, mientras serial pasa 26/26. | Ruido en QA y baja confianza en CI paralelo. | Beta 2.9.2 debe estabilizar auth/worker strategy antes de cambiar cobertura. |
| Medio | Auth | Todos los specs autenticados comparten los mismos usuarios QA y hacen login real concurrente. | Sesiones/Auth/server bajo carga pueden provocar flakiness. | Evaluar `storageState` por rol, setup global o serializacion de specs autenticados. |
| Medio | Datos | `full-visual-qa.spec.ts` y `task-templates.spec.ts` crean datos persistentes sin cleanup. | Contaminación gradual, listados más pesados y resultados dependientes del estado. | Mantener prefijos QA; evaluar cleanup seguro o fixtures controladas. |
| Medio | Playwright config | No existe `webServer` configurado. | Runs locales fallan si la app no esta levantada o si el servidor activo no corresponde. | Decidir entre `webServer` en config o script explícito de dev server. |
| Medio | Build | `verify` depende de Google Fonts/red por `next/font/google`. | Falsos fallos en sandbox/offline. | Resolver con fuente local o documentar red obligatoria en build. |
| Bajo | Artefactos | `test-results/` y `playwright-report/` no están ignorados. | Riesgo de ensuciar commits con videos/traces/screenshots. | Agregar ignore en subfase de tooling si se aprueba. |
| Bajo | Helpers | Hay duplicacion de lectura de credenciales y helpers sensibles en specs. | Mantenimiento repetitivo y diferencias de timeouts. | Consolidar helpers e2e en Beta 2.9.3. |
| Bajo | Full visual QA | Spec muy amplio con timeout alto y mucha mutación. | Diagnóstico lento cuando falla. | Mantener como aceptación, pero mover checks repetibles a specs focales. |
| Observación | Scripts | `audit:security` reporta coincidencias documentales y sale con código 0. | Requiere interpretación humana; no bloquea por sí solo usos peligrosos. | Crear modo app-code estricto o allowlist futura si hace falta. |
| Observación | Fechas | `date.ts` ya usa fechas futuras dinámicas locales. | Reduce fragilidad temporal. | Mantener como estándar para formularios con fechas. |

No se detecta hallazgo crítico en scripts: no hay evidencia de que oculten un
bypass real de seguridad. Los falsos positivos documentales de `audit:security`
están documentados como salida informativa.

## 12. Plan recomendado para Beta 2.9

1. Beta 2.9.2 - Estabilizar Playwright/auth y estrategia serial/paralela.
   - Medir `workers=1/2/4/default`.
   - Confirmar si public specs pueden correr en paralelo.
   - Definir si specs autenticados/mutantes quedan serializados.
   - Evaluar `webServer` o script local estándar.

2. Beta 2.9.3 - Consolidar helpers e2e y assertions sensibles.
   - Unificar lectura de credenciales.
   - Hacer que `full-visual-qa.spec.ts` use helper común o documentar excepción.
   - Separar assertions sensibles internas/públicas/storage.
   - Revisar `metadata` para evitar falsos positivos en pantallas internas.

3. Beta 2.9.4 - Revisar full visual QA y specs focales.
   - Mantener full visual como aceptación.
   - Identificar pasos que ya cubren specs focales.
   - Reducir duplicacion sin perder integración crítica.

4. Beta 2.9.5 - Consolidar scripts de auditoría y verify.
   - Decidir política de Google Fonts/red.
   - Evaluar `.gitignore` para artefactos Playwright.
   - Evaluar modo estricto/allowlist para `audit:security`.

5. Beta 2.9.6 - Documentar estrategia QA/tooling y cerrar Beta 2.9.
   - Documentar comandos local/CI.
   - Registrar límites de paralelismo.
   - Registrar limpieza de artefactos y expectativas de credenciales.

## 13. Que NO conviene hacer

- No tocar app code para hacer pasar tests.
- No ocultar fallos reales bajando asserts.
- No borrar cobertura útil.
- No configurar `workers=1` como solución silenciosa sin documentarlo.
- No depender de datos reales fragiles.
- No crear fixtures complejas prematuras.
- No mezclar QA/tooling con UI/UX.
- No instalar dependencias sin necesidad.
- No cambiar seguridad para facilitar tests.
- No relajar RLS, permisos o validaciones para reducir flakiness.
- No convertir el full visual QA en único gate de calidad.

## 14. Checklist de cierre de auditoría

- [x] Reviso `tests/e2e`.
- [x] Reviso helpers.
- [x] Reviso Playwright config.
- [x] Reviso scripts.
- [x] Reviso package scripts.
- [x] Reviso dependencia de Google Fonts.
- [x] Reviso flakiness serial/paralela.
- [x] Propuso subfases.
- [x] No modifico código funcional.

## 15. Actualización Beta 2.9.7

Se aplico una configuración mínima de `webServer` en `playwright.config.ts`:

```ts
webServer: {
  command: "npm run dev",
  url: "http://localhost:3000",
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
}
```

Decision:

- El servidor local existente se reutiliza fuera de CI.
- En CI, Playwright debe levantar el servidor con `npm run dev`.
- No se fija `workers` globalmente.
- El gate fuerte temporal sigue siendo Chromium serial:

```bash
npm.cmd run test:e2e:chromium:serial
```

También quedan disponibles scripts explícitos:

```bash
npm.cmd run test:e2e:chromium
npm.cmd run test:e2e:chromium:serial
```

La suite paralela completa sigue siendo diagnostica, no gate. La causa esperada
de flakiness continua siendo concurrencia de logins, usuarios QA compartidos,
datos persistentes y specs mutantes.

## 16. Cierre Beta 2.9.8

Documento operativo final:

- `docs/development/BETA_2_9_QA_TOOLING_STRATEGY.md`

Estado final registrado:

- `pedidos.spec.ts` creado como spec focal de Pedidos internos.
- `solicitudes-internas.spec.ts` creado como spec focal de Solicitudes internas.
- Helpers e2e consolidados: `auth.ts`, `assertions.ts`, `date.ts` y
  `qa-data.ts`.
- Google Fonts eliminado; `verify` pasa offline con system font stack.
- `webServer` agregado en `playwright.config.ts`.
- Scripts `test:e2e:chromium` y `test:e2e:chromium:serial` agregados.
- Artefactos `/test-results/`, `/playwright-report/` y `debug.log` ignorados.
- Total actual: 11 specs e2e y 30 tests Chromium.
- Gate estable temporal: `npm.cmd run test:e2e:chromium:serial`.
- Suite serial conocida: 30/30.
- Full visual QA conocido: 1/1.
- Suite paralela completa sigue como diagnóstico, no gate.
