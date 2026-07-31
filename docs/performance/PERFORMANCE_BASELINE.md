# Linea base resumida de rendimiento - Etapa 15

Fecha de cierre: 2026-07-20

## Entorno

| Item | Valor |
| --- | --- |
| Next.js | 16.2.6 |
| React | 19.2.4 |
| Base de datos | Supabase local |
| Navegador de medición | Playwright Chromium |
| Sistema | Windows / QA local |

Las cifras de esta línea base son mediciones locales aproximadas. No representan
producción y no constituyen un SLA.

## Rutas Observadas

| Ruta | Observación local representativa |
| --- | --- |
| `/dashboard` | Dashboard interno medible y operativamente aceptable en QA local |
| `/dashboard/pedidos` | Listado interno medible; sin evidencia de problema crítico en default |
| `/dashboard/pedidos/[id]` | Detalle interno estable; el experimento de paneles no redujo transferencia |
| `/dashboard/solicitudes` | Listado interno medible; investigable si crecen datos o búsquedas |
| `/dashboard/solicitudes/[id]` | Detalle interno estable en la linea base local |

## Conclusiones

- No se identifico un problema crítico de JavaScript cliente.
- Los detalles internos de pedidos y solicitudes fueron estables en QA local.
- Los listados y dashboard pueden investigarse en el futuro si crecen los datos
  o aparece degradación real.
- El experimento de lazy loading de paneles de pedido produjo 0 bytes de ahorro
  en transferencia cold de script y fue revertido.
- No se conservaron optimizaciones de aplicación.

## Limitaciones

- Entorno QA local.
- Dataset reducido y acumulativo.
- No representa producción.
- Las cifras no constituyen un SLA ni objetivo contractual.
- Los harnesses experimentales fueron archivados y retirados de la rama limpia.

## Reapertura

Las condiciones para reabrir trabajo de optimización quedan definidas en:

[cierre histórico de Etapa 15](../archive/performance-stages/STAGE_15_CLOSURE.md).
