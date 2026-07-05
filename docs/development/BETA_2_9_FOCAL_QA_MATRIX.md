# Beta 2.9.2 - Matriz de cobertura focal y seleccion de specs

## 1. Objetivo

Definir una matriz practica de cambio -> specs necesarios para el proyecto
Godel Diseno. El objetivo es ejecutar QA focal segun los archivos modificados,
evitando usar `tests/e2e/full-visual-qa.spec.ts` como prueba por defecto.

`full-visual-qa.spec.ts` debe quedar como prueba transversal de aceptacion,
cierre de fase o release, no como sustituto de specs focales pequenos.

## 2. Resumen ejecutivo

Cobertura inicial de Beta 2.9.2:

- Existian 9 specs e2e en `tests/e2e`.
- Existian 26 tests Chromium.
- Hay specs focales para rutas publicas, tracking publico, dashboard, clientes,
  usuarios, storage y Configuracion/templates.
- La suite serial Chromium es el modo confiable actual.
- La suite paralela sigue siendo objetivo futuro por flakiness en auth,
  navegacion y timeouts.

Estado de cierre Beta 2.9.8:

- Existen 11 specs e2e.
- El total esperado actual es 30 tests Chromium.
- `pedidos.spec.ts` y `solicitudes-internas.spec.ts` ya fueron creados.
- El gate fuerte temporal es `npm.cmd run test:e2e:chromium:serial`.

Huecos principales detectados en Beta 2.9.2:

- No habia spec focal dedicado de Pedidos internos.
- No habia spec focal dedicado de Solicitudes internas.
- Conversion Solicitud -> Pedido, tareas de pedido, pagos, asignaciones,
  comentarios e historial dependen demasiado de `full-visual-qa.spec.ts`.
- Storage tiene spec focal, pero algunos casos internos dependen de fixtures
  existentes y pueden skippear.

Recomendacion general:

- Usar specs focales por dominio como primera linea de QA.
- Mantener `full-visual-qa.spec.ts` para cambios transversales, cierre de fase,
  permisos/RLS, layout general y aceptacion pre-merge/pre-release.
- Crear antes de cerrar Beta 2.9 al menos, ya resuelto en Beta 2.9.3 y 2.9.4:
  - `tests/e2e/pedidos.spec.ts`;
  - `tests/e2e/solicitudes-internas.spec.ts`.
- Mantener specs autenticados y mutantes en modo serial por ahora.

## 3. Specs actuales

| Spec | Dominio principal | Tipo | Mutante | Serial recomendado | Cuando ejecutarlo |
|---|---|---|---|---|---|
| `tests/e2e/smoke.spec.ts` | Smoke publico y login | mixto | No | No obligatorio, salvo login | Cambios en rutas base, login, layout raiz, Playwright config o comprobacion rapida general. |
| `tests/e2e/public-solicitud.spec.ts` | Solicitud publica | publico | No, usa validacion negativa | No | Cambios en `/solicitud`, `src/app/solicitud`, `src/components/solicitudes` publicos o validaciones publicas. |
| `tests/e2e/public-tracking.spec.ts` | Tracking publico | publico | No | No | Cambios en `/estado`, `src/lib/public-tracking`, `src/components/tracking` o DTOs publicos de estado. |
| `tests/e2e/dashboard.spec.ts` | Dashboard por rol y rutas protegidas | interno-auth | No | Si | Cambios en dashboard, permisos, navegacion protegida, resumen/actividad/work-items. |
| `tests/e2e/clientes.spec.ts` | Clientes internos | interno-auth | No, usa busqueda y validacion negativa | Si por auth | Cambios en `src/lib/clientes`, rutas/componentes de clientes o permisos de clientes. |
| `tests/e2e/usuarios.spec.ts` | Usuarios/perfiles internos | interno-auth | No, usa validacion negativa | Si por auth | Cambios en `src/lib/usuarios`, rutas/componentes de usuarios, permisos o perfil interno. |
| `tests/e2e/storage.spec.ts` | Storage, descargas y superficies publicas | mixto | Parcial; upload publico bloqueado | Si para casos auth | Cambios en storage, archivos, download routes, componentes de archivos, tracking publico con archivos. |
| `tests/e2e/task-templates.spec.ts` | Configuracion y plantillas de tareas | interno-auth | Si; crea plantillas y pedidos QA | Si | Cambios en `src/lib/task-templates`, Configuracion/templates o aplicacion de plantillas a pedidos. |
| `tests/e2e/full-visual-qa.spec.ts` | Aceptacion transversal end-to-end | release-acceptance | Si; crea y muta muchos datos | Si | Cierre de fase, release, cambios transversales, permisos/RLS o flujos completos solicitud-pedido-produccion. |

## 4. Matriz cambio -> spec recomendado

| Cambio en archivos | Specs minimos | Specs adicionales si el cambio es grande | Full visual QA necesario |
| ------------------ | ------------- | ---------------------------------------- | ------------------------ |
| `src/app/solicitud` | `public-solicitud.spec.ts` | `storage.spec.ts` si toca upload; `smoke.spec.ts` si toca carga inicial | Solo si afecta conversion posterior o flujo publico-interno completo |
| `src/lib/solicitudes/public*` | `public-solicitud.spec.ts` | `public-tracking.spec.ts` si cambia referencia publica; futuro `solicitudes-internas.spec.ts` si impacta revision interna | Si cambia contrato solicitud -> pedido |
| `src/app/estado` | `public-tracking.spec.ts` | `storage.spec.ts` si toca superficie de archivos; `smoke.spec.ts` | No, salvo cambio transversal de tracking en pedidos/solicitudes |
| `src/lib/public-tracking` | `public-tracking.spec.ts` | `storage.spec.ts`; `audit:public-tracking` | Si cambia DTO publico o reglas de exposicion |
| `src/app/dashboard` | `dashboard.spec.ts` | Specs del dominio afectado; `smoke.spec.ts` si cambia login/navegacion | Si cambia layout general o navegacion transversal |
| `src/lib/dashboard` | `dashboard.spec.ts` | `clientes.spec.ts`, `usuarios.spec.ts`, `storage.spec.ts` segun datos afectados | Si cambia work-items o resumen de varios dominios |
| `src/lib/pedidos` | Futuro `pedidos.spec.ts`; mientras tanto spec focal relacionado si existe | `dashboard.spec.ts`, `task-templates.spec.ts`, `storage.spec.ts` segun subflujo | Si toca estados, tareas, pagos, asignaciones o workflow completo |
| `src/app/dashboard/pedidos` | Futuro `pedidos.spec.ts`; mientras tanto `storage.spec.ts` para archivos o `task-templates.spec.ts` para plantillas | `dashboard.spec.ts` si afecta contadores/work-items | Si cambia detalle de pedido o flujo de estado/pago/tareas |
| `src/components/pedidos` | Futuro `pedidos.spec.ts` | `task-templates.spec.ts` si toca selector de plantillas; `storage.spec.ts` si toca archivos | Si afecta varias secciones del detalle o responsive general |
| `src/lib/storage` | `storage.spec.ts` | `public-solicitud.spec.ts` si toca upload publico; `public-tracking.spec.ts` si toca tracking | Si cambia descarga interna o archivos en flujo completo |
| `src/components/storage` | `storage.spec.ts` | Spec del dominio donde se renderiza la seccion | Solo si impacta layout transversal o full QA visual |
| `src/app/dashboard/*/archivos` | `storage.spec.ts` | `dashboard.spec.ts` si cambia permiso/navegacion | Si cambia contrato de descarga en varios dominios |
| `src/lib/clientes` | `clientes.spec.ts` | Futuro `solicitudes-internas.spec.ts` si toca crear cliente desde solicitud | Solo si afecta conversion solicitud -> cliente -> pedido |
| `src/app/dashboard/clientes` | `clientes.spec.ts` | `dashboard.spec.ts` si cambia navegacion/permisos | No, salvo rediseno grande o permiso transversal |
| `src/lib/usuarios` | `usuarios.spec.ts` | `dashboard.spec.ts` si cambia rol/permisos visibles | Si cambia modelo de permisos de varios dominios |
| `src/app/dashboard/usuarios` | `usuarios.spec.ts` | `dashboard.spec.ts` | No, salvo cambio transversal de permisos |
| `src/lib/permissions` | `dashboard.spec.ts`, `clientes.spec.ts`, `usuarios.spec.ts` | `task-templates.spec.ts`, `storage.spec.ts`, futuro `pedidos.spec.ts` segun permiso | Si cambia matriz de permisos o RLS relacionada |
| `src/lib/auth` | `smoke.spec.ts`, `dashboard.spec.ts` | `clientes.spec.ts`, `usuarios.spec.ts` para roles; suite serial si toca sesion | Si afecta login, roles o acceso global |
| `src/lib/task-templates` | `task-templates.spec.ts` | Futuro `pedidos.spec.ts` si cambia tareas de pedido | Si cambia RPC/permiso/transaccion de aplicacion a pedido |
| `src/app/dashboard/configuracion` | `task-templates.spec.ts` | `dashboard.spec.ts` si cambia navegacion admin | No, salvo cambio transversal de configuracion/permisos |
| `tests/e2e/helpers` | Spec focal que use el helper modificado | Suite serial Chromium `--workers=1` si helper es compartido | Solo si cambia helper usado por full QA |
| `playwright.config.ts` | `smoke.spec.ts` | Suite serial y prueba paralela controlada | Si cambia project, browser, traces o estrategia global |
| `scripts` | Auditoria correspondiente (`audit:*`, `diff:check`, `verify`) | No aplica e2e salvo script de test | No |
| `supabase/migrations` | QA DB especifica, audits, spec focal del dominio tocado | Suite serial; specs de permisos si cambia RLS | Si cambia permisos/RLS/RPC o flujo multi-dominio |
| Docs only | `diff:check`, audits si la tarea lo pide | `verify` si cierre de fase | No |

## 5. Huecos de cobertura focal

| Dominio/flujo | Cobertura actual | Hueco | Spec recomendado | Prioridad |
| ------------- | ---------------- | ----- | ---------------- | --------- |
| Pedidos internos | Full visual QA, storage y task-templates cubren partes. | No hay spec focal de listado/detalle/crear pedido/estado por rol. | `tests/e2e/pedidos.spec.ts` | Alta |
| Solicitudes internas | Full visual QA cubre revision, cliente y conversion. Dashboard ve enlaces. | No hay spec focal para listado, detalle, estados, cliente y conversion. | `tests/e2e/solicitudes-internas.spec.ts` | Alta |
| Conversion Solicitud -> Pedido | Full visual QA. | Depende demasiado de recorrido largo. | Incluir en `solicitudes-internas.spec.ts` | Alta |
| Tareas de pedido | Full visual QA y aplicacion desde plantilla en task-templates. | Falta CRUD/progreso focal de tareas manuales. | `pedidos.spec.ts` | Alta |
| Pagos de pedido | Full visual QA. | Falta spec focal de validacion y pago parcial/completo. | `pedidos.spec.ts` | Alta |
| Asignacion de trabajadores | Full visual QA. | Falta spec focal de asignar/desasignar y permisos. | `pedidos.spec.ts` | Media |
| Comentarios e historial | Full visual QA revisa historial indirecto; no cubre comentarios de forma focal. | Falta spec focal de comentarios/historial en pedido y solicitud. | `pedidos.spec.ts` y `solicitudes-internas.spec.ts` | Media |
| Configuracion/templates | `task-templates.spec.ts`. | Cobertura focal suficiente para MVP; pendiente cleanup/datos persistentes. | Mantener spec actual | Baja |
| Storage | `storage.spec.ts`. | Casos internos dependen de fixtures existentes y pueden skippear. | Mejorar fixtures en fase futura | Media |
| Dashboard | `dashboard.spec.ts`. | Cobertura adecuada de roles; no cubre todos los datos de work-items. | Mantener; ampliar si cambia ranking | Baja |
| Clientes | `clientes.spec.ts`. | No crea cliente valido ni edita detalle. | Ampliar si se toca CRUD completo | Media |
| Usuarios | `usuarios.spec.ts`. | No crea perfil valido ni edita usuario. | Ampliar solo si cambia gestion real | Media |
| Tracking | `public-tracking.spec.ts` y full visual QA para referencias reales. | Spec focal solo cubre referencia invalida. | Agregar caso con fixture real si se estabilizan datos | Media |
| Solicitud publica | `public-solicitud.spec.ts` y full visual QA para envio real. | Focal no envia solicitud valida para evitar persistencia. | Mantener negativo; full QA valida envio real | Baja |

## 6. Uso recomendado del full visual QA

Ejecutar `tests/e2e/full-visual-qa.spec.ts` cuando:

- se cierre una fase;
- haya cambios transversales;
- cambien permisos, RLS, RPCs o reglas de acceso;
- cambien flujos completos solicitud -> pedido -> produccion;
- cambie layout general o shell de dashboard;
- se prepare merge importante;
- se prepare release;
- se toquen varios dominios a la vez;
- se modifiquen estados, pagos, tareas, storage y tracking en una misma tanda.

No exigir `full-visual-qa.spec.ts` obligatoriamente para:

- cambios documentales;
- cambios de tipos internos sin comportamiento;
- cambios focales cubiertos por spec especifico;
- cambios menores de helpers no visuales;
- cambios en scripts de auditoria;
- cambios de copy no transversal, siempre que el spec focal del dominio pase.

## 7. Estrategia serial/paralela temporal

Estado temporal:

- Serial es el modo confiable actual.
- Paralelo es objetivo futuro, no gate estable todavia.
- Suite completa serial Chromium es el gate fuerte temporal.

Specs potencialmente paralelizables:

- `public-solicitud.spec.ts`
- `public-tracking.spec.ts`
- partes publicas de `smoke.spec.ts`

Specs autenticados o mutantes que conviene mantener seriales por ahora:

- `dashboard.spec.ts`
- `clientes.spec.ts`
- `usuarios.spec.ts`
- `storage.spec.ts`
- `task-templates.spec.ts`
- `full-visual-qa.spec.ts`
- login admin de `smoke.spec.ts`

Regla practica:

- Para cambios focales, ejecutar el spec del dominio aislado en Chromium.
- Para cambios compartidos de auth/helpers/permisos, ejecutar suite serial
  Chromium con `--workers=1`.
- No ocultar la flakiness paralela configurando `workers=1` sin documentarlo.

## 8. Recomendacion para specs faltantes

Specs a crear antes de cerrar Beta 2.9:

| Spec recomendado | Cobertura propuesta | Prioridad |
| --- | --- | --- |
| `tests/e2e/pedidos.spec.ts` | Listado de pedidos, crear pedido manual, detalle, tareas manuales, estado, pago, asignacion basica y permisos principales. | Alta |
| `tests/e2e/solicitudes-internas.spec.ts` | Listado interno, detalle, cambio de estado, crear/asociar cliente, conversion a pedido y permisos. | Alta |

Specs o ampliaciones posteriores:

| Spec recomendado | Cobertura propuesta | Prioridad |
| --- | --- | --- |
| Ampliar `storage.spec.ts` | Fixtures estables para pedido/solicitud con archivos sin depender de primer registro existente. | Media |
| Ampliar `clientes.spec.ts` | Crear cliente valido y editar detalle con cleanup o prefijo QA. | Media |
| Ampliar `usuarios.spec.ts` | Edicion controlada y guardas del ultimo admin, sin crear usuarios Auth desde app. | Media |
| Caso real en `public-tracking.spec.ts` | Tracking con referencia real generada por fixture controlada. | Media |
| Spec focal de comentarios/historial si crece | Comentarios e historial en pedido/solicitud. | Baja |

Queda para fase UI/UX futura:

- QA visual responsive exhaustivo por cada pantalla.
- Comparaciones visuales/snapshots.
- Revision de microinteracciones y densidad de UI.
- Matriz desktop/mobile por componente.

## 9. Comandos recomendados para Codex

Comandos base:

```bash
npm.cmd run diff:check
npm.cmd run audit:security
npm.cmd run audit:client-supabase
npm.cmd run audit:public-tracking
npm.cmd run verify
```

Solicitud publica:

```bash
npm.cmd run test:e2e -- --project=chromium tests/e2e/public-solicitud.spec.ts
```

Tracking publico:

```bash
npm.cmd run test:e2e -- --project=chromium tests/e2e/public-tracking.spec.ts
```

Dashboard, permisos y auth:

```bash
npm.cmd run test:e2e -- --project=chromium tests/e2e/dashboard.spec.ts
```

Clientes:

```bash
npm.cmd run test:e2e -- --project=chromium tests/e2e/clientes.spec.ts
```

Usuarios:

```bash
npm.cmd run test:e2e -- --project=chromium tests/e2e/usuarios.spec.ts
```

Storage/archivos:

```bash
npm.cmd run test:e2e -- --project=chromium tests/e2e/storage.spec.ts
```

Configuracion/templates:

```bash
npm.cmd run test:e2e -- --project=chromium tests/e2e/task-templates.spec.ts
```

Smoke basico:

```bash
npm.cmd run test:e2e -- --project=chromium tests/e2e/smoke.spec.ts
```

Aceptacion transversal:

```bash
npm.cmd run test:e2e -- --project=chromium tests/e2e/full-visual-qa.spec.ts
```

Gate fuerte temporal:

```bash
npm.cmd run test:e2e -- --project=chromium --workers=1
```

Cuando se creen specs faltantes:

```bash
npm.cmd run test:e2e -- --project=chromium tests/e2e/pedidos.spec.ts
npm.cmd run test:e2e -- --project=chromium tests/e2e/solicitudes-internas.spec.ts
```

## 10. Que NO hacer

- No usar full visual QA como sustituto de specs focales.
- No borrar full visual QA.
- No bajar asserts para evitar fallos.
- No ocultar flakiness paralela.
- No configurar `workers=1` sin documentacion.
- No crear specs enormes nuevos.
- No duplicar todo lo que ya cubre full visual QA si basta con un focal pequeno.
- No mezclar estabilizacion de Playwright con cambios funcionales.
- No depender de datos reales fragiles sin documentar fixtures o precondiciones.
- No cambiar permisos, RLS o seguridad para facilitar tests.

## 11. Plan resultante para Beta 2.9

1. Beta 2.9.3 - Crear specs focales faltantes de mayor valor.
   - Crear `tests/e2e/pedidos.spec.ts`.
   - Crear `tests/e2e/solicitudes-internas.spec.ts`.
   - Mantenerlos pequenos y seriales si crean o mutan datos.

2. Beta 2.9.4 - Consolidar helpers e2e y assertions sensibles.
   - Unificar lectura de credenciales.
   - Evitar duplicacion entre `smoke.spec.ts`, `full-visual-qa.spec.ts` y
     `helpers/auth.ts`.
   - Separar assertions publicas, internas y storage.

3. Beta 2.9.5 - Estabilizar estrategia serial/paralela y Playwright config.
   - Medir public specs en paralelo.
   - Mantener autenticados/mutantes seriales.
   - Evaluar `webServer`, `storageState` por rol y limpieza de artefactos.

4. Beta 2.9.6 - Consolidar scripts de auditoria y `verify`.
   - Decidir politica para Google Fonts/red.
   - Evaluar `.gitignore` de `test-results/` y `playwright-report/`.
   - Evaluar modo estricto o allowlist para `audit:security`.

5. Beta 2.9.7 - Documentar estrategia QA/tooling y cerrar Beta 2.9.
   - Actualizar documentacion final con comandos por dominio.
   - Registrar modo CI/local recomendado.
   - Registrar estado final serial/paralelo.

## 12. Checklist de cierre

- [x] Reviso todos los specs existentes.
- [x] Reviso helpers.
- [x] Reviso auditoria 2.9.1.
- [x] Identifico huecos.
- [x] Definio matriz cambio -> spec.
- [x] Definio cuando usar full visual QA.
- [x] No modifico tests ni codigo funcional.

## 13. Actualizacion Beta 2.9.7

Estado actualizado:

- Existen 11 specs e2e en `tests/e2e`.
- El total esperado actual de tests Chromium es 30.
- Playwright define `webServer` con `npm run dev` y reutiliza
  `localhost:3000` en desarrollo local.
- El gate fuerte temporal es:

```bash
npm.cmd run test:e2e:chromium:serial
```

Regla vigente:

- Specs publicos son candidatos a paralelismo.
- Specs autenticados, serializados o mutantes siguen recomendados en modo
  serial mientras no existan sesiones aisladas por rol, fixtures estables o
  estrategia de limpieza segura.
- La suite paralela completa se puede medir, pero no bloquea Beta 2.9.

## 14. Cierre Beta 2.9.8

La estrategia operativa final vive en:

- `docs/development/BETA_2_9_QA_TOOLING_STRATEGY.md`

Resumen actualizado:

- La matriz focal se mantiene como documento de analisis.
- La guia operativa para comandos, gates, `webServer`, paralelismo, build
  offline, artefactos y deudas queda centralizada en el documento de estrategia.
- Los specs focales nuevos de Beta 2.9 son:
  - `tests/e2e/pedidos.spec.ts`;
  - `tests/e2e/solicitudes-internas.spec.ts`.
- El total actual esperado es 30 tests Chromium.
- El gate fuerte temporal es `npm.cmd run test:e2e:chromium:serial`.
- Full visual QA queda como aceptacion transversal, no como sustituto de specs
  focales.
