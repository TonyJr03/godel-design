# Dashboard Workspace — QA Etapa 11

## Alcance

QA de cierre del dashboard operativo en `/dashboard` tras las etapas 11.1 a 11.6. La revisión cubrió contrato visual por rol, responsive, accesibilidad mínima, auditorías técnicas y E2E Chromium serial.

No se modificaron permisos, RLS, consultas, migraciones ni modelo de datos durante esta etapa de cierre.

## Validación por rol

### Admin / supervisor

- Resultado: Aprobado.
- Observaciones: El dashboard muestra `Dashboard operativo`, tablero principal centrado en pedidos activos (`Nuevos`, `En revisión`, `En producción`) y rail de acciones con Atención, Solicitudes, Entregas, Historial y Resumen. El main no muestra solicitudes pendientes ni listos para entrega; esos flujos quedan en paneles contextuales. `Solicitudes` muestra el total real y `Entregas` el total de listos.

### Trabajador

- Resultado: Aprobado.
- Observaciones: El dashboard muestra `Mi trabajo asignado`, no expone acción ni panel de Solicitudes, usa pedidos asignados como foco, mantiene copy personal en Atención, Entregas, Historial y Resumen, y no muestra métricas globales de solicitudes/clientes.

## Validación responsive

### Desktop 1366x768

- Resultado: Aprobado.
- Observaciones: Validado por E2E serial y captura `test-results/beta-1-8-3-admin-dashboard-desktop.png`. No se observó overflow horizontal; el rail de iconos se mantiene sticky y las cards son legibles.

### Desktop 1440x900

- Resultado: Aprobado.
- Observaciones: Validado con Chromium headless en `test-results/stage-11-dashboard-admin-1440.png`. No se detectó overflow horizontal; el tablero mantiene jerarquía y el rail queda visible.

### Mobile 390x844

- Resultado: Aprobado.
- Observaciones: Validado con capturas `test-results/beta-1-8-3-admin-dashboard-mobile.png`, `test-results/stage-11-dashboard-admin-390.png` y `test-results/stage-11-dashboard-worker-390.png`. La barra mobile del workspace aparece, las cards siguen siendo legibles y no se detectó overflow horizontal.

## Accesibilidad mínima

- Resultado: Aprobado con cobertura razonable.
- Observaciones: Las cards completas usan `aria-label`; el historial conserva link icon-only con `aria-label` y `title`; el rail expone nombres accesibles; el foco visible está cubierto en rail, cards y enlaces. El origen del historial se identifica con badge Pedido/Solicitud y el workflow con borde, por lo que no se depende solo del color.

## Validación técnica

| Comando | Resultado | Observaciones |
| --- | --- | --- |
| `npm run diff:check` | Aprobado | Sin errores. Se ejecutó antes de documentación y se repite al cierre final. |
| `npm run verify` | Aprobado | `eslint` y `next build` pasaron. |
| `npm run audit:security` | Aprobado con revisión manual | Código 0. Reportó coincidencias documentales esperadas y FK de migración a `auth.users`; no se detectó uso operativo nuevo. |
| `npm run audit:client-supabase` | Aprobado | Sin coincidencias en `src/components`. |
| `npm run audit:public-tracking` | Aprobado | Sin coincidencias. |
| `npm run test:e2e:chromium:serial` | Aprobado | Resultado final: 39 passed, 3 skipped. El primer intento falló por selectores/copy obsoletos del nuevo workspace; se ajustaron solo tests permitidos y el serial final pasó. |

## Decisiones de cierre

- Se ajustaron únicamente tests E2E afectados por cambios visuales/copy aprobados: selectores de sidebar, paneles contextuales y links ambiguos `+N pedidos más`.
- Se reutilizó el servidor local `http://localhost:3000` gestionado por Playwright; no se creó un servidor adicional para la revisión manual ligera.
- Las credenciales QA se leyeron desde entorno local mediante los helpers existentes y no se imprimieron ni se guardaron.

## Pendientes / deuda técnica

- Los scripts de auditoría siguen reportando coincidencias documentales esperadas; conviene mantener la interpretación manual o evaluar allowlists en una fase futura.
- Quedaron 3 tests skipped en el serial final por condiciones de datos existentes, no por fallo del dashboard workspace.

## Conclusión

La Etapa 11 queda cerrada. El dashboard funciona como workspace operativo centrado en pedidos activos, con paneles contextuales para atención, solicitudes, entregas, historial y resumen; diferencia admin/supervisor y trabajador; mantiene las reglas de permisos/RLS existentes; y pasa validación técnica, auditorías y E2E Chromium serial.
