# Beta 1.8 - Functional QA Report

Fecha: 2026-06-26

Rama: `beta/db-consolidation`

## 1. Objetivo

Regenerar `src/types/database.types.ts` desde la base local consolidada, revisar contratos de aplicacion contra las migraciones activas y ejecutar QA tecnico funcional de la fase Beta 1.8.

## 2. Alcance revisado

- Solicitud publica: `src/app/solicitud/`, `src/lib/solicitudes/`.
- Estado publico: `src/app/estado/`, `src/lib/public-tracking/`.
- Pedidos: `src/lib/pedidos/`, `src/app/dashboard/pedidos/`.
- Storage: `src/lib/storage/`.
- `src/app/api/`: no existe en este estado del proyecto.

## 3. Estado de migraciones

`supabase/migrations/` conserva las 5 migraciones consolidadas activas:

- `20260625000100_01_core_schema.sql`
- `20260625000200_02_security_rls_grants.sql`
- `20260625000300_03_business_rpcs.sql`
- `20260625000400_04_storage.sql`
- `20260625000500_05_final_hardening.sql`

No se modificaron migraciones durante Beta 1.8.

## 4. Tipos regenerados

Se regenero `src/types/database.types.ts` desde la base local consolidada con Supabase CLI.

Resultado del diff:

- Se agrego el schema `graphql_public` generado por Supabase.
- No cambiaron firmas de RPCs de negocio ni tablas publicas del contrato de la app.
- El archivo quedo en UTF-8 sin BOM.

## 5. Revision estatica de contratos de aplicacion

Resultado: OK.

- `src/lib/public-tracking/get-public-tracking-status.ts` consume `consultar_estado_publico` y devuelve DTO publico controlado.
- `/estado` no expone numero interno de pedido, pagos, archivos, rutas, UUIDs internos ni metadata cruda.
- La solicitud publica crea solicitud primero y luego sube archivos al bucket privado oficial.
- Los servicios de pedidos delegan en RPCs seguras para crear, convertir, cambiar estado, actualizar pago y aplicar plantillas.
- `src/lib/storage/` mantiene `GODEL_FILES_BUCKET = "godel-files"` y no expone `file_path` al cliente como URL publica.

No se aplicaron cambios de logica en `src/app/`, `src/lib/` ni componentes.

## 6. Precondiciones de usuarios internos

Se confirmo por SQL sobre `public.perfiles` que existen perfiles activos:

- `admin: 1`
- `supervisor: 1`
- `trabajador: 1`

No se consulto `auth.users` desde codigo de aplicacion.

## 7. QA SQL funcional con rollback

Se ejecuto una transaccion completa con `ROLLBACK`.

Casos validados:

- Creacion de pedido manual `encargo`.
- Bloqueo de transicion invalida directa a produccion.
- Bloqueo de paso a produccion sin tareas para `encargo`.
- Bloqueo de listo para entrega con tareas incompletas.
- Bloqueo de entrega sin pago.
- Bloqueo de entrega con pago parcial.
- Entrega permitida con pago completo.
- Pedido `impresion` con total cero avanza sin tareas y queda con pago cubierto.
- Conversion de solicitud `impresion` aprobada con fallback de titulo `Pedido de impresion`.
- Herencia de `public_reference` y metadata de archivo desde solicitud hacia pedido.
- Tracking publico devuelve `kind = pedido` tras conversion.
- Constraint de `archivos.bucket` bloquea buckets distintos de `godel-files`.

Salida final:

```txt
bucket_constraint_blocks_other_bucket | ok
conversion_fallback_and_file_inheritance | ok
delivery_paid_allowed | ok
delivery_partial_payment_blocked | ok
delivery_unpaid_blocked | ok
invalid_transition_blocked | ok
manual_encargo_created | ok
production_without_tasks_blocked | ok
profiles_active | admin:1, supervisor:1, trabajador:1
public_tracking_after_conversion | ok
public_tracking_contract_safe | ok
ready_with_incomplete_tasks_blocked | ok
zero_total_payment_exempt | ok
ROLLBACK
```

## 8. Storage y RLS

Resultado: OK con advertencia conocida de grants base.

- Bucket `godel-files`: existe y es privado.
- `storage.objects`: RLS activo.
- Policies anonimas de `SELECT`, `UPDATE` o `DELETE`: ninguna.
- Prueba efectiva con objeto temporal: `anon` vio `0` filas y actualizo `0` filas.

Salida efectiva:

```txt
anon_storage_select_count | 0
anon_storage_update_count | 0
ROLLBACK
```

Advertencia tecnica: el catalogo muestra grants amplios heredados para `anon` sobre `storage.objects`, pero RLS bloquea efectivamente lectura y mutacion no autorizadas. Esta advertencia ya venia registrada desde Beta 1.7.

## 9. QA HTTP y visual

Servidor usado: `http://localhost:3000` ya estaba respondiendo; no se inicio un nuevo servidor.

Checks HTTP:

- `/solicitud`: `200`
- `/estado`: `200`
- `/estado?ref=BAD-CODE`: `200`

QA visual con screenshots: no completada.

Motivo: Edge CDP no quedo disponible en este entorno. Los intentos de levantar una instancia temporal de Edge con puerto remoto agotaron tiempo de espera o quedaron colgados. En ese momento no habia Playwright configurado como herramienta principal de QA.

No se capturaron ni inspeccionaron screenshots. La aprobacion visual debe completarse manualmente o con un harness de navegador disponible.

## 10. Audits ejecutados

```bash
npm.cmd run diff:check
npm.cmd run audit:security
npm.cmd run audit:client-supabase
npm.cmd run audit:public-tracking
```

Resultados:

- `diff:check`: OK.
- `audit:security`: OK. Imprime referencias documentales esperadas y la FK de migracion hacia `auth.users`.
- `audit:client-supabase`: OK, sin coincidencias.
- `audit:public-tracking`: OK, sin coincidencias.

## 11. Verify

```bash
npm.cmd run verify
```

Resultado: OK.

- `eslint`: OK.
- `next build`: OK.
- TypeScript: OK.
- Rutas generadas: 17/17.

## 12. Busquedas estaticas

Se revisaron:

- `p_bucket = 'godel-files'`
- `archivos_bucket_godel_files_check`
- `storage.objects`
- `storage.buckets`
- `consultar_estado_publico`
- `convertir_solicitud_a_pedido`
- `actualizar_estado_pedido`
- `actualizar_pago_pedido`
- `crear_pedido_manual`
- `aplicar_plantilla_tareas_pedido`
- terminos sensibles de seguridad indicados por los audits

Resultado:

- `archivos_bucket_godel_files_check` existe en core schema.
- `private.can_insert_pedido_file_metadata` exige `p_bucket = 'godel-files'`.
- Las RPCs esperadas existen en migraciones, tipos y servicios server-side.
- No se detectaron consultas Supabase desde Client Components.
- No se detecto exposicion publica de tracking con `order_number`, pagos o `file_path`.

## 13. Archivos modificados

- `src/types/database.types.ts`
- `docs/development/BETA_1_8_FUNCTIONAL_QA_REPORT.md`

No se modificaron:

- `supabase/migrations/`
- `src/app/`
- `src/lib/`
- `src/components/`

## Ajuste Beta 1.8.1 - Types y Playwright

Se normalizo la generacion de types con:

```bash
npm.cmd run types:supabase
```

El script usa:

```bash
supabase gen types typescript --local --schema public > src/types/database.types.ts
```

Resultado:

- `graphql_public` desaparecio de `src/types/database.types.ts`.
- `@playwright/test@1.61.1` esta instalado como dev dependency.
- Chromium de Playwright esta disponible en la cache local.
- Playwright queda configurado como herramienta principal para QA visual/e2e.
- Chromium gestionado por Playwright queda como proyecto principal.
- Edge queda como proyecto opcional con `channel: "msedge"` y Edge CDP queda como fallback/manual debug.

Scripts agregados:

- `types:supabase`
- `test:e2e`
- `test:e2e:headed`
- `test:e2e:ui`
- `test:e2e:report`

Archivos creados:

- `playwright.config.ts`
- `tests/e2e/smoke.spec.ts`

Archivos actualizados:

- `package.json`
- `package-lock.json`
- `src/types/database.types.ts`
- `.codex/skills/godel-authenticated-visual-qa/SKILL.md`
- `docs/development/BETA_1_8_FUNCTIONAL_QA_REPORT.md`

Smoke test:

```bash
npm.cmd run test:e2e -- --project=chromium
```

Resultado:

- `/solicitud`: OK.
- `/estado`: OK.
- `/login`: OK.
- Login admin autenticado con credenciales QA locales: OK.
- Total: 4 passed.

Nota: no se imprimieron ni guardaron credenciales. El smoke autenticado usa unicamente variables locales de entorno.

## Ajuste Beta 1.8.2 - Mensajes de login

Se corrigio el manejo de errores del login para diferenciar credenciales incorrectas de fallos temporales de conexion. La UI muestra mensajes amigables sin detalles tecnicos, mientras que los detalles quedan limitados al log del servidor.

Mensajes finales:

- Campos vacios: `Ingresa tu correo y contraseña.`
- Credenciales incorrectas: `Correo o contraseña incorrectos.`
- Error temporal de conexion o servicio: `No pudimos iniciar sesión en este momento. Inténtalo nuevamente en unos minutos.`
- Usuario sin perfil activo: `Tu usuario no tiene acceso interno activo. Contacta al administrador.`

Verificacion manual:

- Campos vacios: OK.
- Credenciales incorrectas: OK.
- Credenciales correctas con perfil activo: OK.
- Usuario Auth sin perfil activo: no probado en esta pasada.
- Simulacion de URL local incorrecta en servidor aislado: intento realizado, pero `next dev` aislado agoto tiempo de espera antes de completar la prueba. La rama de error queda cubierta por codigo y `verify`; requiere repeticion manual si se quiere evidencia visual especifica de infraestructura caida.

## Beta 1.8.3 - QA visual completo con Playwright

Servidor usado: `http://localhost:3000` ya estaba respondiendo; no se inicio un nuevo servidor.

Browser usado: Playwright Chromium.

Archivos agregados:

- `tests/e2e/full-visual-qa.spec.ts`
- `tests/e2e/fixtures/sample-print-request.pdf`

### 1. Precondiciones

- Playwright disponible: `Version 1.61.1`.
- Perfiles activos confirmados en `public.perfiles`: `admin`, `supervisor`, `trabajador`.
- Credenciales QA tomadas de `.env.local`/entorno local. No se documentaron passwords.
- No se consulto `auth.users` desde codigo de aplicacion.
- No se uso `service_role`.

### 2. Flujo publico de solicitudes

Resultado: OK.

- Solicitud `encargo` creada desde `/solicitud`.
- Solicitud `impresion` creada desde `/solicitud` con fixture PDF.
- Referencias de la pasada completa:
  - Encargo: `GD-QEMR-AE0T`
  - Impresion: `GD-LITW-DSE1`
- La UI mostro confirmacion y codigo de seguimiento.
- No se detecto exposicion publica de UUIDs, `file_path`, `order_number`, `pedido_pagos`, `storage.objects` ni secretos.

### 3. Tracking publico

Resultado: OK.

- `/estado?ref=GD-QEMR-AE0T`: OK.
- `/estado?ref=GD-LITW-DSE1`: OK.
- Referencia invalida `BAD-CODE`: muestra error controlado.
- Referencia inexistente `GD-ZZZZ-ZZZZ`: muestra error controlado.
- Tras conversion, el tracking publico usa la misma referencia del pedido convertido sin exponer numero interno.

### 4. Login y dashboard admin

Resultado: OK.

- Login admin por `/login`: OK.
- Dashboard admin: OK.
- Nav admin con `Solicitudes`, `Pedidos`, `Usuarios`, `Configuracion`: OK.
- Screenshots desktop y mobile capturados temporalmente e inspeccionados durante la corrida:
  - `test-results/beta-1-8-3-admin-dashboard-desktop.png`
  - `test-results/beta-1-8-3-admin-dashboard-mobile.png`
- Los artefactos temporales de `test-results/` fueron limpiados despues de documentar la evidencia.
- Observacion visual: layout legible en desktop y mobile, sin solapes criticos ni overflow horizontal evidente.

### 5. Gestion de solicitud y conversion

Resultado: OK.

- Solicitud de encargo localizada desde `/dashboard/solicitudes?q=...`.
- Cambios de estado: `nueva` -> `en_revision` -> `contactada` -> `aprobada`.
- Cliente creado desde la solicitud.
- Solicitud convertida a pedido.
- Referencia publica heredada al pedido convertido: `GD-QEMR-AE0T`.

### 6. Pedido manual encargo

Resultado: OK.

- Pedido manual encargo creado desde `/dashboard/pedidos/nuevo`.
- Referencia publica: `GD-ADC3-5F69`.
- Bloqueo visual de produccion antes de revision: OK.
- Bloqueo visual de produccion sin tareas: OK.
- Tarea cuantificada `Imprimir 10 paginas`: OK.
- Bloqueo de listo para entrega con tarea incompleta: OK.
- Progreso de tarea a `10 / 10`: OK.
- Listo para entrega con pago pendiente: OK.
- Entrega bloqueada con pago parcial: OK.
- Entrega permitida con pago completo: OK.

### 7. Pedido manual impresion

Resultado: OK.

- Pedido manual impresion creado desde `/dashboard/pedidos/nuevo`.
- Referencia publica: `GD-E9CE-12FC`.
- Flujo directo sin tareas obligatorias: OK.
- Avance `creado` -> `en_revision` -> `en_produccion` -> `listo_entrega`: OK.

### 8. Storage / archivos internos

Resultado: OK.

- Archivo `sample-print-request.pdf` subido desde UI interna del pedido.
- La UI mostro el archivo y el historial asociado.
- No se mostro `file_path` en el detalle.

### 9. Rol supervisor

Resultado: OK.

- Login supervisor: OK.
- Puede acceder a pedidos.
- No ve `Usuarios` en la navegacion.
- Acceso directo a `/dashboard/usuarios` bloqueado por pantalla de permisos internos.

### 10. Rol trabajador

Resultado: OK.

- Login trabajador: OK.
- Puede acceder a pedidos.
- No ve `Solicitudes` en la navegacion.
- Acceso a `/dashboard/pedidos/nuevo` bloqueado con mensaje de permisos.
- Pedido asignado visible para trabajador: OK.
- Pedido no asignado bloqueado/no disponible: OK.

### 11. Pruebas ejecutadas

```bash
npm.cmd run test:e2e -- --project=chromium tests/e2e/full-visual-qa.spec.ts
npm.cmd run test:e2e -- --project=chromium
npm.cmd run diff:check
npm.cmd run audit:security
npm.cmd run audit:client-supabase
npm.cmd run audit:public-tracking
npm.cmd run verify
```

Resultados:

- Focused Playwright Beta 1.8.3: OK, `1 passed`.
- Suite Playwright Chromium completa: OK, `5 passed`.
- `diff:check`: OK.
- `audit:security`: OK; imprime referencias documentales esperadas y FK de migracion hacia `auth.users`.
- `audit:client-supabase`: OK, sin coincidencias.
- `audit:public-tracking`: OK, sin coincidencias.
- `verify`: OK (`eslint`, `next build`, TypeScript, 17/17 rutas).

### 12. Busquedas estaticas

Se revisaron:

- `p_bucket = 'godel-files'`
- `archivos_bucket_godel_files_check`
- `storage.objects`
- `storage.buckets`
- `consultar_estado_publico`
- `convertir_solicitud_a_pedido`
- `actualizar_estado_pedido`
- `service_role`
- `SUPABASE_SERVICE_ROLE_KEY`

Resultado:

- `archivos_bucket_godel_files_check` existe en `supabase/migrations/20260625000100_01_core_schema.sql`.
- `private.can_insert_pedido_file_metadata` exige `p_bucket = 'godel-files'` en `supabase/migrations/20260625000200_02_security_rls_grants.sql`.
- Las RPCs y Storage aparecen en migraciones, tipos, servicios server-side y documentacion esperada.
- Las referencias a `service_role` y `SUPABASE_SERVICE_ROLE_KEY` son reglas/audits/documentacion esperada o patrones negativos del test; no se agrego uso operativo.

Conclusion Beta 1.8.3: aprobada para continuar a Beta 1.9 desde QA visual/e2e local.

## 14. Dictamen

Estado tecnico DB/types/app contracts: aprobado.

Estado QA visual completa: aprobado en Playwright Chromium.

Recomendacion: Beta 1.8 queda cerrada localmente con QA funcional visual completa para continuar hacia Beta 1.9.
