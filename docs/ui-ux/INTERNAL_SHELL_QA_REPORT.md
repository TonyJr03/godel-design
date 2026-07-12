# Reporte QA del shell interno

## Alcance

QA focal de cierre para la Etapa 7 del shell interno. Cubre sidebar desktop expandido/colapsado, persistencia por cookie, navegacion por rol, ruta activa, skip link, navegacion movil con `<details>`, logout, convivencia con workspaces, overflow y capturas visuales.

## Cambios validados

- Sidebar desktop expandido y colapsado.
- Cookie `godel_sidebar_collapsed`.
- Navegacion filtrada por rol.
- Estado activo con `aria-current`.
- Header movil con logo y menu nativo `<details>/<summary>`.
- Cierre del menu movil al navegar.
- Usuario y rol como informacion no interactiva.
- Logout con formulario y Server Action.
- Skip link hacia `main#main-content`.
- Workspaces de pedidos/solicitudes dentro del shell.

## Rutas revisadas

- `/dashboard`
- `/dashboard/pedidos`
- `/dashboard/solicitudes`
- `/dashboard/pedidos/[id]`
- `/dashboard/solicitudes/[id]`
- `/dashboard/usuarios`
- `/dashboard/clientes`
- `/dashboard/configuracion`

## Roles revisados

- `admin`: navegacion completa y QA principal del shell.
- `supervisor`: cubierto por Full Visual QA para limites de navegacion.
- `worker`: navegacion limitada a dashboard y pedidos.

## Breakpoints revisados

- Desktop: `1366 x 768`.
- Desktop amplio: `1440 x 900`.
- Tablet: `900 x 1000`, `780 x 1000`.
- Mobile: `375 x 812`, `390 x 844`.

## Pruebas ejecutadas

- `npm.cmd run diff:check`
- `npm.cmd run verify`
- `npx.cmd playwright test tests/e2e/dashboard-shell.spec.ts --project=chromium --workers=1`
- `npx.cmd playwright test tests/e2e/full-visual-qa.spec.ts --project=chromium --workers=1`
- `npx.cmd playwright test tests/e2e/dashboard.spec.ts --project=chromium --workers=1`

## Resultados

- `diff:check`: paso.
- `verify`: paso con lint y build.
- `dashboard-shell.spec.ts`: paso con 4 pruebas.
- `full-visual-qa.spec.ts`: paso. Se ejecuto una vez antes de `dashboard.spec.ts` y una segunda vez al final para regenerar e inspeccionar las capturas que el siguiente run de Playwright habia limpiado.
- `dashboard.spec.ts`: paso con 4 pruebas.

La QA no detecto bugs funcionales del shell.

## Screenshots generados

- `test-results/beta-2-shell-dashboard-desktop-expanded-1366.png`
- `test-results/beta-2-shell-dashboard-desktop-collapsed-1366.png`
- `test-results/beta-2-shell-dashboard-mobile-menu-375.png`

El Full Visual QA tambien conserva capturas existentes de dashboard, workspaces de solicitudes y workspaces de pedidos con prefijo `test-results/beta-1-8-3-*`.

## Incidencias encontradas

- No se encontraron incidencias de producto en el shell.
- Durante el desarrollo del spec focal aparecieron tres ajustes de prueba: esperar la transicion de ancho del sidebar, acotar el link `Dashboard` al `nav` y distinguir el sidebar global del rail de workspace. No requirieron cambios de codigo de shell.

## Incidencias corregidas

- Se corrigieron los selectores y esperas del nuevo `dashboard-shell.spec.ts`.
- No se modifico codigo de shell durante 7.6.

## Deuda aceptada

- No queda deuda critica aceptada para el cierre de Etapa 7.
- Las capturas en `test-results/` son artefactos de ejecucion local, no documentacion fuente versionada.

## Criterio de cierre

La Etapa 7 queda cerrada: las pruebas listadas pasaron, los screenshots se generaron e inspeccionaron, y no quedan incidencias criticas abiertas sobre shell, accesibilidad, navegacion por rol, responsive u overflow.
