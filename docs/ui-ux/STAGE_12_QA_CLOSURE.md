# Cierre QA - Etapa 12

Fecha: 2026-07-17

## 1. Objetivo del cierre

Validar el cierre técnico, visual y documental de la Etapa 12: formularios internos contextuales, formularios operativos en paneles, retiro de fallbacks obsoletos y not-found interno del dashboard.

## 2. Alcance validado

- Clientes: listado, detalle, crear/editar por dialog, mobile y permisos.
- Usuarios: listado, filtros, crear/editar por dialog, error de creación dentro del dialog y permisos.
- Pedidos: creación manual por dialog, detalle, paneles operativos inline, permisos y entrega.
- Solicitudes: paneles operativos inline, cliente, estado, conversión y comentarios.
- Plantillas: listado oficial, crear/editar por dialog, detalle y tareas inline.
- Rutas fallback retiradas: validación de not-found interno.
- Dashboard interno: shell, resumen, workspaces, storage seguro y tracking público.

## 3. Validación técnica

| Comando | Resultado | Observaciones |
| --- | --- | --- |
| `git status --short` inicial | Aprobado | Árbol limpio antes de empezar 12.9. |
| `npm.cmd run diff:check` | Aprobado | Sin errores de whitespace al inicio del cierre. |
| `npm.cmd run verify` | Aprobado | Lint y build pasaron antes de ajustes de cierre. |
| `npm.cmd run test:e2e:chromium:serial` | Aprobado | Resultado final: 39 passed, 3 skipped. |

## 4. Auditorías internas

| Auditoría | Resultado | Observaciones |
| --- | --- | --- |
| `npm.cmd run audit:security` | Aprobado con revisión manual | Código 0. Reporta coincidencias documentales esperadas y FK de migración a `auth.users`; no se detectó uso operativo nuevo de `service_role`, `SUPABASE_SERVICE_ROLE_KEY` ni consultas app-side a `auth.users`. |
| `npm.cmd run audit:client-supabase` | Aprobado | Sin coincidencias en `src/components`. |
| `npm.cmd run audit:public-tracking` | Aprobado | Sin coincidencias sensibles en tracking público. |

## 5. E2E

| Suite | Resultado | Observaciones |
| --- | --- | --- |
| `npm.cmd run test:e2e:chromium:serial` | Aprobado | 39 passed, 3 skipped. Se actualizaron tests obsoletos que esperaban links/rutas fallback retiradas. |
| `tests/e2e/clientes.spec.ts` | Aprobado | Valida crear/editar por dialog y mobile. |
| `tests/e2e/usuarios.spec.ts` | Aprobado | Valida crear/editar por dialog, error inline y permisos. |
| `tests/e2e/pedidos.spec.ts` | Aprobado | Valida creación por dialog, paneles inline, permisos y entrega. |
| `tests/e2e/solicitudes-internas.spec.ts` | Aprobado | Valida paneles inline y conversión compacta. |
| `tests/e2e/task-templates.spec.ts` | Aprobado | Valida crear/editar por dialog y tareas inline. |
| `tests/e2e/full-visual-qa.spec.ts` | Aprobado | Capturó e inspeccionó evidencia visual desktop/mobile de dashboard, solicitudes y pedidos. |

## 6. QA manual focal

| Área | Desktop | Mobile | Observaciones |
| --- | --- | --- | --- |
| Clientes | Aprobado | Aprobado | Crear cliente abre dialog; editar desde detalle abre dialog; no hay navegación a fallback. |
| Usuarios | Aprobado | Aprobado | Crear usuario abre dialog; error de UUID queda dentro del dialog; editar usuario abre dialog. |
| Pedidos | Aprobado | Aprobado | Crear pedido abre dialog con Encargo/Impresión; paneles Estado, Tareas, Archivos, Comentarios, Personal y Pagos siguen inline/contextuales. |
| Solicitudes | Aprobado | Aprobado | Estado, Cliente, Conversión y Comentarios siguen en paneles; conversión mantiene Datos del encargo/impresión y Datos del pedido. |
| Plantillas | Aprobado | Aprobado | Crear/editar plantilla usa dialog; tareas de plantilla siguen inline en detalle. |
| Not-found interno | Aprobado | Aprobado | Rutas retiradas y rutas internas inexistentes caen en not-found del dashboard, sin `PublicHeader`. |

## 7. Búsquedas de deuda técnica

| Búsqueda | Resultado | Observaciones |
| --- | --- | --- |
| Fallbacks retirados en `src docs` | Aprobado con referencias históricas | No hay rutas activas en `src/app` o `src/components`. Quedan referencias históricas en docs y READMEs bajo `src/lib`. |
| `rg "nuevo/actions|editar/actions|/nuevo/actions|/editar/actions" src` | Aprobado | Sin resultados. |
| `rg "TaskTemplatesList|TaskTemplatesSection" src` | Aprobado | Solo coincidencias por substring en `InternalTaskTemplatesList` y `revalidateTaskTemplatesList`; la búsqueda exacta no devuelve legacy. |
| `rg "backHref|backLabel|\[unusedProp: string\]" src` | Aprobado | Sin resultados. |

## 8. Decisiones confirmadas

- Crear/editar clientes se realiza por dialog.
- Crear/editar usuarios se realiza por dialog.
- Pedido manual se crea por dialog desde listado.
- Crear/editar plantillas se realiza por dialog.
- Formularios operativos de pedidos y solicitudes se mantienen inline/panel.
- Las rutas fallback de crear/editar fueron retiradas.
- El área dashboard tiene not-found interno.
- No quedan componentes legacy inline de plantillas.

## 9. Hallazgos pendientes

### Bloqueantes

- Ninguno.

### No bloqueantes

- `audit:security` sigue reportando coincidencias documentales esperadas; requiere lectura manual hasta que exista allowlist o modo estricto diferenciado.
- La base local acumula muchos datos QA. Se aplicó batching en `loadTaskProgressByPedidoId` para evitar fallos del resumen del dashboard con listas grandes.

### Pendientes para Etapa 13

- Mantener fuera de Etapa 12 los formularios públicos, login y consulta pública de estado.

### Pendientes para deuda técnica futura

- Actualizar documentación histórica fuera del alcance de 12.9 que aún menciona rutas fallback antiguas.
- Evaluar limpieza periódica de datos QA locales para reducir ruido visual y tiempos de suite.

## 10. Resultado de cierre

Estado recomendado: Aprobado.
