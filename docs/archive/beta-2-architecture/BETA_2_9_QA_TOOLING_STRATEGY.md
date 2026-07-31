# Beta 2.9.8 - Estrategia final de QA y tooling

## 1. Objetivo

Este documento define como ejecutar QA en el proyecto después de Beta 2.9. Su
propósito es dejar una guia operativa para desarrollo local, pre-merge, cierre
de fase y diagnóstico de Playwright sin ocultar la deuda de paralelismo.

## 2. Estado final de Beta 2.9

- 11 specs e2e en `tests/e2e`.
- 30 tests Chromium esperados.
- Suite serial Chromium: 30/30.
- Full visual QA: 1/1.
- `verify` offline OK, sin dependencia de Google Fonts.
- Specs públicos junto con smoke: OK usando 3 workers.
- `workers=2` y `workers=4` siguen como diagnóstico no estable.
- Playwright tiene `webServer` configurado con reutilizacion local.
- `test-results/`, `playwright-report/` y `debug.log` están ignorados.

## 3. Specs e2e actuales

| Spec | Dominio | Tipo | Mutante | Comando recomendado |
|---|---|---|---|---|
| `smoke.spec.ts` | Rutas base, login y carga pública | Mixto | No | `npm.cmd run test:e2e -- --project=chromium tests/e2e/smoke.spec.ts` |
| `public-solicitud.spec.ts` | Solicitud pública | Público | No | `npm.cmd run test:e2e -- --project=chromium tests/e2e/public-solicitud.spec.ts` |
| `public-tracking.spec.ts` | Tracking público | Público | No | `npm.cmd run test:e2e -- --project=chromium tests/e2e/public-tracking.spec.ts` |
| `dashboard.spec.ts` | Dashboard por rol | Interno autenticado | No | `npm.cmd run test:e2e -- --project=chromium tests/e2e/dashboard.spec.ts` |
| `clientes.spec.ts` | Clientes internos | Interno autenticado | No | `npm.cmd run test:e2e -- --project=chromium tests/e2e/clientes.spec.ts` |
| `usuarios.spec.ts` | Usuarios y perfiles | Interno autenticado | No | `npm.cmd run test:e2e -- --project=chromium tests/e2e/usuarios.spec.ts` |
| `storage.spec.ts` | Storage, descargas y superficie pública | Mixto | Parcial | `npm.cmd run test:e2e -- --project=chromium tests/e2e/storage.spec.ts` |
| `task-templates.spec.ts` | Configuración y plantillas | Interno autenticado | Si | `npm.cmd run test:e2e -- --project=chromium tests/e2e/task-templates.spec.ts` |
| `pedidos.spec.ts` | Pedidos internos | Interno autenticado | Si | `npm.cmd run test:e2e -- --project=chromium tests/e2e/pedidos.spec.ts` |
| `solicitudes-internas.spec.ts` | Solicitudes internas y conversion | Mixto autenticado | Si | `npm.cmd run test:e2e -- --project=chromium tests/e2e/solicitudes-internas.spec.ts` |
| `full-visual-qa.spec.ts` | Aceptación transversal | End-to-end autenticado | Si | `npm.cmd run test:e2e -- --project=chromium tests/e2e/full-visual-qa.spec.ts` |

## 4. Matriz rapida cambio -> spec

| Cambio | Spec mínimo | Cuando agregar full visual QA |
|---|---|---|
| Rutas base, login o shell mínimo | `smoke.spec.ts` | Si afecta navegación global o roles |
| `/solicitud` o validación pública | `public-solicitud.spec.ts` | Si afecta conversion posterior o flujo público-interno completo |
| `/estado` o DTO público de tracking | `public-tracking.spec.ts` | Si cambia contrato público de pedidos/solicitudes |
| Dashboard, resumen o navegación por rol | `dashboard.spec.ts` | Si cambia layout general o permisos transversales |
| Clientes internos | `clientes.spec.ts` | Si impacta solicitud -> cliente -> pedido |
| Usuarios, perfiles o permisos visibles | `usuarios.spec.ts` y `dashboard.spec.ts` | Si cambia matriz de permisos |
| Storage, descargas o archivos | `storage.spec.ts` | Si toca descargas en varios dominios o tracking con archivos |
| Configuración y plantillas | `task-templates.spec.ts` | Si impacta tareas de pedidos o flujo completo |
| Pedidos, estados, tareas, pagos, asignación | `pedidos.spec.ts` | Si toca flujo completo solicitud -> pedido -> producción |
| Solicitudes internas, estados, cliente, conversion | `solicitudes-internas.spec.ts` | Si cambia conversion o contrato público-interno |
| Helpers e2e compartidos | Spec focal que use el helper | Si el helper participa en full visual QA |
| Playwright config o scripts e2e | `smoke.spec.ts` y suite serial | Si cambia browser, server, traces o estrategia global |
| Migraciones, RLS, RPC o permisos DB | QA DB, audits y specs del dominio | Siempre que afecte permisos o flujo multi-dominio |

## 5. Comandos oficiales

Comandos base:

```bash
npm.cmd run diff:check
npm.cmd run audit:security
npm.cmd run audit:client-supabase
npm.cmd run audit:public-tracking
npm.cmd run verify
```

Comandos e2e:

```bash
npm.cmd run test:e2e:chromium
npm.cmd run test:e2e:chromium:serial
npm.cmd run test:e2e -- --project=chromium tests/e2e/<spec>.spec.ts
npm.cmd run test:e2e -- --project=chromium tests/e2e/full-visual-qa.spec.ts
```

## 6. Gate recomendado por tipo de cambio

### Cambios documentales

```bash
npm.cmd run diff:check
npm.cmd run audit:security
```

### Cambios de tipos o refactor sin comportamiento

```bash
npm.cmd run diff:check
npm.cmd run audit:security
npm.cmd run audit:client-supabase
npm.cmd run audit:public-tracking
npm.cmd run verify
```

Agregar el spec focal si el refactor toca un contrato usado por un dominio.

### Cambios de dominio

```bash
npm.cmd run diff:check
npm.cmd run audit:security
npm.cmd run audit:client-supabase
npm.cmd run audit:public-tracking
npm.cmd run verify
npm.cmd run test:e2e -- --project=chromium tests/e2e/<spec-del-dominio>.spec.ts
```

### Cambios en auth, permisos, RLS o RPC

```bash
npm.cmd run diff:check
npm.cmd run audit:security
npm.cmd run audit:client-supabase
npm.cmd run audit:public-tracking
npm.cmd run verify
npm.cmd run test:e2e -- --project=chromium tests/e2e/dashboard.spec.ts
npm.cmd run test:e2e:chromium:serial
npm.cmd run test:e2e -- --project=chromium tests/e2e/full-visual-qa.spec.ts
```

Agregar specs focales afectados por el cambio.

### Cierre de fase o pre-merge

```bash
npm.cmd run diff:check
npm.cmd run audit:security
npm.cmd run audit:client-supabase
npm.cmd run audit:public-tracking
npm.cmd run verify
npm.cmd run test:e2e:chromium:serial
npm.cmd run test:e2e -- --project=chromium tests/e2e/full-visual-qa.spec.ts
```

## 7. Playwright webServer

Configuración final:

```ts
webServer: {
  command: "npm run dev",
  url: "http://localhost:3000",
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
}
```

Decision:

- En local reutiliza un servidor existente en `localhost:3000`.
- En CI puede levantar el servidor con `npm run dev`.
- Evita depender manualmente de que la app este levantada.
- No resuelve por si solo la flakiness paralela, porque esa deuda esta ligada a
  concurrencia de logins, usuarios QA compartidos, datos persistentes y specs
  mutantes.

## 8. Estrategia serial/paralela

- La suite serial Chromium es el gate estable actual.
- La suite paralela completa no es gate todavía.
- Specs públicos junto con smoke pasaron usando 3 workers.
- Specs públicos son candidatos a paralelismo futuro.
- Specs autenticados, serializados o mutantes siguen recomendados en serial por
  ahora.

Resultados recientes:

```txt
workers=1: 30/30
workers=2: fallo, 28 passed, 1 failed, 1 did not run
workers=4: fallo, 27 passed, 2 failed, 1 did not run
```

Patrón de fallo observado:

- `solicitudes-internas.spec.ts` falló bajo concurrencia al buscar o actualizar
  una solicitud recien creada.
- `storage.spec.ts` falló bajo mayor concurrencia al navegar desde listado a
  detalle de pedido.
- No se confirmo una regresion funcional si los specs focales aislados y la
  suite serial pasan.

## 9. Build offline y fuentes

- Se removio `next/font/google`.
- Se elimino la dependencia de Geist y Google Fonts durante `next build`.
- Se usa system font stack mediante variables CSS:
  - `--font-ui-sans`;
  - `--font-ui-mono`.
- `npm.cmd run verify` ya pasa sin red.
- No se agregaron dependencias.
- No se agregaron archivos `.woff2`.
- No se uso `next/font/local` en Beta 2.9.

## 10. Artefactos QA ignorados

`.gitignore` ignora:

```txt
/test-results/
/playwright-report/
debug.log
```

Los screenshots, videos, traces y reportes generados localmente no deben entrar
al commit salvo instruccion explícita.

## 11. Helpers e2e

- `helpers/auth.ts`: centraliza login por rol (`admin`, `supervisor`, `worker`)
  leyendo credenciales desde entorno local o `.env.local`, sin imprimir
  secretos.
- `helpers/assertions.ts`: centraliza assertions contra exposición sensible en
  pantallas internas, públicas, storage y rutas de acceso limitado.
- `helpers/date.ts`: genera fechas futuras dinámicas en formato `YYYY-MM-DD`
  usando componentes locales.
- `helpers/qa-data.ts`: genera `runId`, labels, emails y queries QA improbables
  para evitar colisiones y reemplazar datos ad hoc.

## 12. Deudas técnicas restantes

- Paralelismo completo no estable.
- Usuarios QA compartidos entre specs y workers.
- Specs mutantes con datos persistentes.
- Posible `storageState` por rol.
- Posibles fixtures, seed o cleanup controlado para datos QA.
- `storage.spec.ts` aún depende parcialmente de datos existentes.
- Tracking real focal podría mejorar con fixture estable.
- Full visual QA sigue siendo grande, pero queda como aceptación transversal.

Estas deudas no bloquean Beta 2.9 porque el gate serial estable pasa y la deuda
paralela queda explícita.

## 13. Que NO hacer

- No usar full visual QA como único sustituto de specs focales.
- No ocultar flakiness paralela.
- No bajar asserts para pasar tests.
- No tocar app code para facilitar QA.
- No relajar permisos, RLS ni RPCs.
- No configurar `workers=1` globalmente sin documentarlo.
- No crear fixtures DB complejas sin fase explícita.
- No imprimir ni commitear credenciales QA.

## 14. Cierre de Beta 2.9

Beta 2.9 queda cerrada cuando:

- Este documento operativo existe y queda enlazado desde auditoría/matriz.
- `verify` pasa.
- Auditorias pasan.
- Suite serial Chromium se mantiene 30/30.
- Full visual QA pasa.
- La deuda paralela queda registrada como diagnostica, no como gate.

Estado de cierre:

- Documentación final creada.
- Estrategia serial/paralela documentada.
- `webServer` documentado.
- Build offline documentado.
- Artefactos QA documentados.
- Helpers e2e documentados.
- Deudas futuras registradas para Beta 2.10 o fases posteriores.
