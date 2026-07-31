# Cierre QA - Etapa 13

Fecha: 2026-07-18

## 1. Objetivo

Cerrar formalmente la Etapa 13: consolidación del área pública de Godel Diseño,
separando la experiencia de cliente, la puerta interna de `/login` y el área
autenticada de `/dashboard/**`.

El cierre documenta resultados, decisiones finales, validaciones, auditorías,
QA responsive, accesibilidad, seguridad pública y deuda aceptada. No introduce
funcionalidad nueva ni rediseño adicional.

## 2. Alcance validado

- Home pública en `/`.
- Solicitud pública en `/solicitud`.
- Consulta pública de estado en `/estado`.
- Estado público inválido en `/estado?ref=INVALIDA`.
- 404 pública global en `/no-existe`.
- Puerta interna en `/login`.
- `PublicHeader` sticky.
- `PublicFooter` reutilizable.
- Separación visual y conceptual entre área pública, login e interno.

## 3. Decisiones finales

- `/login` conserva su URL y route group interno, pero funciona visualmente como
  puerta de acceso interna.
- El área pública no muestra enlaces visibles hacia `/login`.
- `PublicHeader` y `PublicFooter` quedan reservados para rutas públicas de
  cliente.
- `/estado` mantiene un DTO público mínimo y no amplía datos expuestos.
- `/solicitud` mantiene el contrato funcional del formulario público.
- La 404 pública solo ofrece acciones públicas: inicio, solicitud y estado.
- No se agregan catálogo, carrito, pagos, panel de cliente ni datos públicos
  adicionales.

## 4. Rutas públicas finales

| Ruta | Estado | Observaciones |
| --- | --- | --- |
| `/` | Aprobada | Home pública con CTA a solicitud y consulta de estado. |
| `/solicitud` | Aprobada | Formulario público con flujos Encargo e Impresión. |
| `/estado` | Aprobada | Consulta por referencia pública. |
| `/estado?ref=INVALIDA` | Aprobada | Error público seguro para referencia inválida. |
| `/no-existe` | Aprobada | 404 pública con acciones públicas integradas en el hero. |
| `/login` | Aprobada como puerta interna | Separada de navegación pública y sin PublicHeader. |

## 5. Separación público / login / interno

| Zona | Rutas | Resultado |
| --- | --- | --- |
| Área pública | `/`, `/solicitud`, `/estado`, 404 pública | Navegación y mensajes orientados al cliente. |
| Puerta interna | `/login` | Acceso interno sin navegación pública completa. |
| Área interna autenticada | `/dashboard/**` | Sin cambios en Etapa 13; sigue protegida por autenticación, permisos y RLS. |

Confirmaciones de cierre:

- `/login` sigue separado de la navegación pública.
- Ninguna ruta pública enlaza a `/login`.
- `PublicHeader` no muestra acceso interno.
- `PublicFooter` no muestra acceso interno.
- La 404 pública no menciona login, dashboard ni permisos.

## 6. Validación técnica

| Comando | Resultado | Observaciones |
| --- | --- | --- |
| `npm.cmd run diff:check` | Aprobado | Ejecutado al cierre; sin errores de whitespace. |
| `npm.cmd run verify` | Aprobado | Lint y build pasaron. |

## 7. Auditorías

| Auditoría | Resultado | Observaciones |
| --- | --- | --- |
| `npm.cmd run audit:security` | Aprobado con revisión manual | Código 0. Reporta coincidencias documentales esperadas y FK de migración a `auth.users`; no se detectó uso operativo nuevo de `service_role`, `SUPABASE_SERVICE_ROLE_KEY` ni consultas app-side a `auth.users`. |
| `npm.cmd run audit:client-supabase` | Aprobado | Sin coincidencias en `src/components`. |
| `npm.cmd run audit:public-tracking` | Aprobado | Sin coincidencias sensibles en tracking público. |

## 8. E2E

| Suite | Resultado | Observaciones |
| --- | --- | --- |
| `npm.cmd run test:e2e:chromium:serial` | Ejecutada con advertencia no bloqueante | La salida visible recorrió 42 tests: 39 aprobados y 3 omitidos. El proceso alcanzó timeout de 300 s después del último test visible, por lo que queda como pendiente no bloqueante revisar el cierre de proceso o ampliar timeout de CI/local. |
| `tests/e2e/public-solicitud.spec.ts` | Aprobado en salida visible | Valida formulario público, flujos y errores seguros. |
| `tests/e2e/public-tracking.spec.ts` | Aprobado en salida visible | Valida rechazo seguro de referencias inválidas. |
| `tests/e2e/smoke.spec.ts` | Aprobado en salida visible | Valida carga de solicitud, estado, login y login admin cuando hay credenciales QA. |
| `tests/e2e/storage.spec.ts` | Aprobado en salida visible para tracking público | Valida que tracking público no expone superficie de descarga ni metadata. |

## 9. Full Visual QA

| Comando | Resultado | Observaciones |
| --- | --- | --- |
| `npx.cmd playwright test tests/e2e/full-visual-qa.spec.ts --project=chromium --workers=1` | Ejecutado con advertencia no bloqueante | El test `Beta 1.8.3 visual QA end-to-end` apareció como `ok` y generó screenshots. El proceso alcanzó timeout de 300 s durante el cierre, por lo que la revisión del teardown queda pendiente no bloqueante. |

## 10. QA manual responsive

Rutas revisadas:

- `/`
- `/solicitud`
- `/estado`
- `/estado?ref=INVALIDA`
- `/no-existe`
- `/login`

Breakpoints revisados:

- 1440x900
- 1024x768
- 768x1024
- 390x844

Resultado:

- Sin overflow horizontal detectado.
- `PublicHeader` sticky funciona en rutas públicas.
- `PublicFooter` aparece en home, solicitud, estado y 404 pública.
- `/login` no usa la navegación pública completa.
- CTAs públicos se mantienen visibles y usables.
- La 404 pública mantiene acciones públicas dentro del hero.

## 11. Accesibilidad

- Un solo `h1` por página revisada.
- `aria-current` correcto en rutas públicas con navegación activa.
- Labels visibles en formularios públicos.
- Errores y alertas públicas se mantienen cerca del contexto.
- El resultado de tracking mantiene `role="progressbar"` con `aria-valuemin`,
  `aria-valuemax` y `aria-valuenow` cuando hay progreso visible.
- Foco visible, contraste y targets táctiles se revisaron de forma focal.

## 12. Seguridad pública de `/estado`

`/estado` mantiene una superficie pública limitada:

- Usa referencia pública.
- No expone `client_name`.
- No expone `client_phone`.
- No expone `client_email`.
- No expone `order_number`.
- No expone archivos.
- No expone comentarios.
- No expone historial interno.
- No expone UUIDs internos.
- No expone pagos.

## 13. Contrato funcional de `/solicitud`

El formulario público conserva:

- `submitPublicSolicitudAction`.
- `workflow_type`.
- `STORAGE_FILE_INPUT_ACCEPT`.
- `name` e `id` de campos existentes.
- Tabs Encargo e Impresión.
- Archivo requerido para Impresión.
- Campos propios de Encargo.
- Validaciones y errores cerca de los campos.
- Éxito con código de seguimiento.

No se modificaron Server Actions, DTO público, queries, Storage, RLS, permisos,
modelo de datos ni rutas.

## 14. Búsquedas de deuda/fugas

| Búsqueda | Resultado | Observaciones |
| --- | --- | --- |
| `rg -n "/login|Acceso interno|dashboard|permiso|permisos|administración|administracion" src/app/\(publico\) src/app/not-found.tsx src/components/layout/PublicHeader.tsx src/components/layout/PublicFooter.tsx` | Aprobado | Sin coincidencias. |
| `rg -n "client_name|client_phone|client_email|order_number|historial|comentarios|archivos|uuid|payment|pago|pagos" src/app/\(publico\)/estado src/components/tracking/PublicTrackingResultCard.tsx` | Aprobado | Sin coincidencias. |
| `rg -n "submitPublicSolicitudAction|workflow_type|STORAGE_FILE_INPUT_ACCEPT|name=|id=" src/components/solicitudes/PublicSolicitudForm.tsx` | Aprobado | Coincidencias esperadas del contrato funcional. |
| `rg -n "PublicFooter" src/app/\(publico\) src/app/not-found.tsx` | Aprobado | `PublicFooter` aparece en home, solicitud, estado y 404 pública. |

## 15. Pendientes bloqueantes

Ninguno.

## 16. Pendientes no bloqueantes

- Revisar por separado por qué Playwright no devuelve control antes de 300 s
  aunque los tests visibles terminen correctamente.
- Mantener `audit:security` con revisión manual hasta que exista una allowlist o
  modo estricto para separar coincidencias documentales de uso operativo.
- Ejecutar una pasada visual pública dedicada en cierre integral de Etapa 16 si
  se decide crear un spec específico para home, solicitud, estado, 404 y login.

## 17. Resultado final

Estado recomendado: Etapa 13 aprobada y cerrada.

La experiencia pública queda consolidada, responsive, accesible de forma focal y
separada del acceso interno. No se detectaron fugas hacia `/login`, exposición
de datos privados en `/estado` ni cambios en dominio, permisos, RLS, Storage,
DTO público, Server Actions o rutas.
