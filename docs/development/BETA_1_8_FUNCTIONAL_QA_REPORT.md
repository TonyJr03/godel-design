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

## 14. Dictamen

Estado tecnico DB/types/app contracts: aprobado.

Estado QA visual completa: pendiente.

Recomendacion: Beta 1.8 queda tecnicamente consistente y con QA SQL/HTTP aprobada. Beta 1.8.1 deja Playwright listo para continuar, pero no debe cerrarse como QA funcional visual completa hasta ejecutar una pasada real de navegador con `admin`, `supervisor` y `trabajador`, incluyendo screenshots desktop/mobile y revision de consola.
