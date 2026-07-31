# Cierre QA - Etapa 14

Fecha: 2026-07-19

## 1. Objetivo

Cerrar formalmente la Etapa 14: estados transversales y resiliencia UI.

El cierre valida cargas segmentadas, error boundaries, errores controlados de
datos, retry seguro, estados vacíos, resultados sin coincidencias, pending,
feedback de acciones, fallos parciales, permisos, acceso denegado, 404 pública e
interna, confirmaciones, responsive, accesibilidad focal, seguridad visual y
consistencia documental.

## 2. Alcance Validado

- Área pública: `/`, `/solicitud`, `/estado`, `/estado?ref=GD-ZZZZ-ZZZZ`,
  `/ruta-publica-inexistente-qa` y `/dashboard-inexistente-qa`.
- Login: `/login`.
- Área interna: `/dashboard`, `/dashboard/pedidos`,
  `/dashboard/pedidos/[id]`, `/dashboard/solicitudes`,
  `/dashboard/solicitudes/[id]`, `/dashboard/clientes`,
  `/dashboard/configuracion`, `/dashboard/configuracion/usuarios`,
  `/dashboard/configuracion/plantillas`,
  `/dashboard/configuracion/plantillas/[templateId]`.
- Estados transversales: `/acceso-denegado`, `/sin-permisos`,
  `/dashboard/ruta-inexistente-qa`.
- Roles: `admin`, `supervisor`, `trabajador` y usuario no autenticado.
- Workspaces: pedidos y solicitudes con paneles, action rail, toolbar tablet,
  barra móvil, dialogs contextuales y fallos parciales.
- Confirmaciones: cierre con cambios sin guardar y eliminación permanente de
  tareas de pedido y plantilla.

## 3. Estado Inicial

| Comando | Resultado | Observaciones |
| --- | --- | --- |
| `git status --short` | Aprobado | Árbol limpio antes de iniciar 14.10. |
| `git log -1 --oneline` | Aprobado | `ea0847f refactor: confirmar acciones destructivas`. Coincide con el commit base aprobado de 14.9. |

## 4. Decisiones Finales

- La matriz de `docs/ui-ux/TRANSVERSAL_STATES_DECISION_MATRIX.md` queda como
  contrato base vigente.
- `loading.tsx` y `error.tsx` permanecen segmentados solo donde se justificaron:
  dashboard interno y `/estado` público.
- `ReadErrorAlert` queda reservado para errores controlados de lectura con
  retry seguro mediante `router.refresh()`.
- Las mutaciones no tienen retry automático.
- Los fallos parciales conservan el recurso principal cuando los datos seguros
  existen.
- `/login`, `/acceso-denegado`, `/sin-permisos`, 404 pública e interna quedan
  separados por semántica, copy y acciones disponibles.
- Las eliminaciones permanentes de tareas usan confirmación inline; el
  `window.confirm` nativo se conserva solo para cerrar dialog/drawer con cambios
  sin guardar.
- No se modificaron Server Actions, servicios de dominio, permisos, RLS,
  Storage, DTO público, rutas ni modelo de datos durante el cierre.

## 5. Matriz de Estados

| Familia | Resultado | Evidencia |
| --- | --- | --- |
| Carga inicial | Aprobado | `loading.tsx` compacto en dashboard y `/estado`; Full Visual QA no detectó interrupción bloqueante. |
| Error de render | Aprobado | `error.tsx` segmentado con mensajes seguros y recuperación en rutas definidas. |
| Error de datos | Aprobado | `ReadErrorAlert` y alerts seguros en listados, dashboard y paneles. |
| Retry seguro | Aprobado | Retry solo en lecturas retryable; no se detectó retry automático de mutaciones. |
| Sin resultados | Aprobado | Listados y dashboard diferencian filtros sin coincidencias de ausencia real. |
| Pending | Aprobado | Formularios y toolbars mantienen `aria-busy`, bloqueo de submit y copy contextual. |
| Fallos parciales | Aprobado | Workspaces y dashboard conservan datos principales y localizan el fallo. |
| Permisos | Aprobado | Rutas protegidas y permisos por rol validados en E2E serial. |
| Not found | Aprobado | 404 pública e interna preservan URL y no mezclan copy de permisos. |
| Confirmaciones | Aprobado | Eliminaciones inline y dirty-close validados en E2E. |
| Seguridad visual | Aprobado con revisión manual | Búsquedas focales sin fugas visuales nuevas; coincidencias revisadas en contexto. |

## 6. Validación Técnica

| Comando | Código | Resultado | Observaciones |
| --- | --- | --- | --- |
| `npm.cmd run diff:check` | 0 | Aprobado | Sin errores de whitespace. |
| `npm.cmd run verify` | 0 | Aprobado | `eslint` y `next build` pasaron. |
| `npm.cmd run test:e2e:chromium:serial` inicial | 1 | Fallido | 42 passed, 3 skipped, 1 failed. El fallo fue del harness visual, no de UI funcional. |
| `npx.cmd playwright test tests/e2e/full-visual-qa.spec.ts --project=chromium --workers=1` inicial | 1 | Fallido | Reprodujo el mismo fallo en `openSolicitudPanel`. |
| `npx.cmd playwright test tests/e2e/full-visual-qa.spec.ts --project=chromium --workers=1` final | 0 | Aprobado | 1 passed, 25 screenshots generados, duración 1.7 min. |
| `npm.cmd run test:e2e:chromium:serial` final | 0 | Aprobado | 43 passed, 3 skipped, duración 5.5 min. |

Resultado exacto de `verify` final:

- `npm run lint`: aprobado.
- `npm run build`: aprobado.
- Next.js compiló correctamente, TypeScript finalizó correctamente y se
  generaron 17 rutas estáticas/dinámicas según la salida del build.

## 7. Auditorías

| Auditoría | Código | Resultado | Interpretación |
| --- | --- | --- | --- |
| `npm.cmd run audit:security` | 0 | Aprobado con revisión manual | Reporta coincidencias documentales esperadas y referencias server-side conocidas; no se detectó uso operativo nuevo de `service_role`, `SUPABASE_SERVICE_ROLE_KEY` ni consultas app-side a `auth.users`. |
| `npm.cmd run audit:client-supabase` | 0 | Aprobado | Sin coincidencias de Supabase o `createClient()` en `src/components`. |
| `npm.cmd run audit:public-tracking` | 0 | Aprobado | Sin coincidencias sensibles en tracking público. |

## 8. E2E Integral

Suite final:

```text
npm.cmd run test:e2e:chromium:serial
```

Resultado final:

- Total: 46 tests.
- Aprobados: 43.
- Omitidos: 3.
- Fallidos: 0.
- Duración: 5.5 min.
- Código de salida: 0.

Cobertura relevante:

- Clientes: listado, búsqueda, detalle, formulario y permisos.
- Dashboard: paneles por rol, rutas protegidas, acceso denegado y 404 interna.
- Listados: contratos desktop/mobile y búsqueda con URL.
- Pedidos: workspace, paneles, tareas, confirmaciones, permisos y entrega.
- Solicitudes: workspace, responsive, conversión, archivos, permisos y estados.
- Storage: rechazos seguros, descargas inválidas y tracking sin superficie de
  descarga.
- Plantillas: permisos, creación/edición, tareas, confirmación destructiva y
  aplicación.
- Usuarios: acceso admin y bloqueo de supervisor/trabajador.
- Público: solicitud, tracking, login, 404 pública y rutas públicas que empiezan
  por `dashboard`.

## 9. Full Visual QA

Comando final:

```text
npx.cmd playwright test tests/e2e/full-visual-qa.spec.ts --project=chromium --workers=1
```

Resultado final:

- Código de salida: 0.
- Tests: 1 passed.
- Duración: 1.7 min.
- Screenshots generados: 25.
- Teardown: sin timeout.
- Screenshots inspeccionados de forma focal: dashboard desktop/mobile,
  solicitud desktop/mobile, pedido tablet/mobile y panel móvil de comentarios.
- Los screenshots quedan en `test-results/` y no se agregan al commit.

Screenshots generados por la suite:

- `beta-2-shell-dashboard-desktop-expanded-1366.png`.
- `beta-2-shell-dashboard-desktop-collapsed-1366.png`.
- `beta-2-shell-dashboard-mobile-menu-375.png`.
- `beta-1-8-3-admin-dashboard-desktop.png`.
- `beta-1-8-3-admin-dashboard-mobile.png`.
- `beta-1-8-3-solicitud-workspace-desktop-1440.png`.
- `beta-1-8-3-solicitud-workspace-desktop-1366.png`.
- `beta-1-8-3-solicitud-workspace-tablet-900.png`.
- `beta-1-8-3-solicitud-workspace-tablet-780.png`.
- `beta-1-8-3-solicitud-workspace-mobile-375.png`.
- `beta-1-8-3-solicitud-cliente-success.png`.
- `beta-1-8-3-solicitud-comentarios-panel-mobile.png`.
- `beta-1-8-3-solicitud-convertida.png`.
- `beta-1-8-3-solicitud-impresion-archivos.png`.
- `beta-1-8-3-pedido-header-volver-desktop.png`.
- `beta-1-8-3-pedido-archivos-panel-desktop.png`.
- `beta-1-8-3-pedido-toolbar-tablet-badge-volver.png`.
- `beta-1-8-3-pedido-toolbar-tablet-narrow.png`.
- `beta-1-8-3-pedido-toolbar-more-remaining-tablet.png`.
- `beta-1-8-3-pedido-toolbar-tablet-wide.png`.
- `beta-1-8-3-pedido-toolbar-mobile-badge-volver.png`.
- `beta-1-8-3-pedido-comentarios-panel-mobile.png`.
- `beta-1-8-3-pedido-personal-panel-desktop.png`.
- `beta-1-8-3-pedido-informacion-no-cliente-neutral-desktop.png`.
- `beta-1-8-3-pedido-main-no-aportes-tablet.png`.

## 10. QA Responsive

| Breakpoint | Resultado | Cobertura |
| --- | --- | --- |
| 1440x900 | Aprobado | Solicitudes, pedidos, full visual y workspaces. |
| 1366x768 | Aprobado | Dashboard, shell, listados, workspaces y screenshots visuales. |
| 1024x768 | Aprobado por equivalencia focal | No se generó screenshot exacto; la cobertura queda representada por desktop 1366x768 y tablet 900x1000/780x1000 sin overflow. |
| 768x1024 | Aprobado por equivalencia focal | Cubierto por tablet 780x1000 y 900x1000 en workspaces. |
| 390x844 | Aprobado | Dashboard, listados y rutas internas móviles en E2E. |
| 375x812 | Aprobado | Workspaces y panels móviles de Full Visual QA. |

Rutas y superficies revisadas mediante E2E, Full Visual QA o inspección focal:

- `/`, `/solicitud`, `/estado`, `/login`.
- `/dashboard`, `/dashboard/pedidos`, `/dashboard/pedidos/[id]`.
- `/dashboard/solicitudes`, `/dashboard/solicitudes/[id]`.
- `/dashboard/clientes`, `/dashboard/configuracion/usuarios`.
- `/dashboard/configuracion/plantillas`,
  `/dashboard/configuracion/plantillas/[templateId]`.
- `/sin-permisos`, 404 pública y 404 interna.

No se detectó overflow horizontal crítico, superposición incoherente de alerts,
toolbars o barras móviles, ni exposición del `PublicHeader` dentro del área
interna.

## 11. Accesibilidad

Resultado: Aprobado.

Validaciones cubiertas por inspección focal y E2E:

- Un único `h1` por página completa en rutas críticas.
- Jerarquía de headings estable en listados, dashboard y workspaces.
- `aria-current` en navegación interna y pública.
- `aria-busy` en formularios, filtros y confirmaciones.
- `role="alert"` para errores bloqueantes.
- `role="status"` o semántica equivalente para éxitos y feedback.
- Labels de formularios y nombres accesibles en icon buttons.
- Foco visible y retorno de foco en dialogs/drawers y confirmaciones inline.
- `Escape` cancela confirmación inline sin cerrar el workspace.
- Targets táctiles adecuados en barra móvil y acciones destructivas.
- Estados no dependientes exclusivamente del color.

## 12. Seguridad Visual

Resultado: Aprobado con revisión manual.

No se detectaron fugas visibles de:

- `service_role`.
- `SUPABASE_SERVICE_ROLE_KEY`.
- `auth.users`.
- Stack traces.
- Errores SQL/PostgreSQL.
- `file_path` en UI cliente.
- Buckets privados o signed URLs persistentes.
- UUIDs internos innecesarios en superficies públicas.
- Pagos, archivos, historial o comentarios en tracking público.

## 13. Búsquedas de Deuda o Fugas

| Búsqueda | Resultado | Interpretación |
| --- | --- | --- |
| `rg -n "service_role|SUPABASE_SERVICE_ROLE_KEY|auth\\.users|file_path|stack trace|postgres|PostgreSQL" src` | Aprobado con revisión manual | Coincidencias esperadas en tipos, `src/lib/storage` server-side y documentación README. No hay fuga visual nueva. |
| `rg -n "client_name|client_phone|client_email|order_number|UUID|uuid|historial|comentarios|archivos|pagos" "src/app/(publico)" "src/app/not-found.tsx" "src/components/tracking"` | Aprobado con revisión manual | Coincidencias de `client_*` pertenecen al formulario público de solicitud y a su Server Action; no aparecen en tracking público ni 404 pública como fuga. |
| `rg -n "window\\.confirm|showModal|<dialog|createPortal" src/components` | Aprobado | `window.confirm` solo aparece en `InternalFormDialog` e `InternalFormDrawer`; `<dialog>`/`showModal` solo en primitivas contextuales existentes; no hay `createPortal`. |

## 14. Defectos Encontrados y Correcciones Realizadas

### Defecto corregido

El primer E2E serial falló en `tests/e2e/full-visual-qa.spec.ts` con:

```text
No visible solicitud workspace trigger found.
```

Causa:

- El helper `openSolicitudPanel` contaba triggers inmediatamente después de una
  recarga de página.
- Desde la Etapa 14 existen `loading.tsx` segmentados; durante esa transición el
  helper podía evaluar la pantalla antes de que reaparecieran las acciones del
  workspace.
- La UI final sí mostraba el action rail correctamente; el fallo pertenecía al
  harness visual.

Corrección:

- Se ajustó `openSolicitudPanel` para esperar hasta 15 s a que exista un trigger
  directo visible o el menú `Más acciones`, reutilizando el patrón de espera
  activa del propio spec.
- No se modificó código de aplicación.

Validación posterior:

- `npm.cmd run verify`: aprobado.
- Full Visual QA focal: aprobado.
- Suite E2E Chromium serial: aprobado.

## 15. Bloqueantes

Ninguno.

## 16. Pendientes No Bloqueantes

- `audit:security` sigue requiriendo interpretación manual porque mezcla
  coincidencias documentales, tipos generados y código server-side seguro.
- La cobertura responsive exacta de 1024x768 y 768x1024 no generó screenshots
  dedicados en esta subtarea; queda cubierta por breakpoints equivalentes de la
  suite visual y E2E.
- La base local conserva datos QA acumulados, lo que hace que algunos contadores
  visuales sean altos; no afecta el contrato de estados.

## 17. Deuda Aceptada

- Mantener `window.confirm` para dirty-close simple hasta que una etapa futura
  decida si conviene una alternativa transversal.
- Mantener estados inline en secciones secundarias donde una abstracción global
  agregaría complejidad sin beneficio claro.
- Mantener auditorías informativas con revisión manual hasta que exista una
  allowlist o modo estricto diferenciado.

## 18. Resultado Final

Estado final: Aprobado.

La Etapa 14 cumple sus criterios de cierre: estados principales consistentes,
errores seguros, retry limitado a lecturas, fallos parciales localizados,
pending y feedback de acciones normalizados, permisos y not-found diferenciados,
confirmaciones destructivas inline, responsive sin defectos bloqueantes y
seguridad visual revisada.

## 19. Estado Recomendado

Recomendación: cerrar Etapa 14 como completada.

La siguiente etapa recomendada es:

```text
Etapa 15 - Optimización basada en mediciones
```

No se inicia Etapa 15 desde este cierre.
