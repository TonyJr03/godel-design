# Beta 1 - Cierre de consolidacion de base de datos

Fecha: 2026-06-26

Rama: `beta/db-consolidation`

## 1. Objetivo de Beta 1

Beta 1 consolido el contrato de base de datos del proyecto Godel Diseno: schema,
migraciones, RLS, grants, RPCs, Storage privado, hardening final, tipos
generados y QA tecnica/funcional. El objetivo fue reemplazar el historial de
migraciones incrementales por un set reproducible, seguro y verificable desde
cero.

## 2. Resultado final

Las 19 migraciones historicas fueron reemplazadas por 5 migraciones consolidadas
activas en `supabase/migrations/`:

- `20260625000100_01_core_schema.sql`
- `20260625000200_02_security_rls_grants.sql`
- `20260625000300_03_business_rpcs.sql`
- `20260625000400_04_storage.sql`
- `20260625000500_05_final_hardening.sql`

La carpeta temporal `supabase/migrations_consolidated/` no existe en el estado
final.

## 3. Cambios principales

- Core schema consolidado con tablas, enums, constraints, triggers y funciones
  privadas estructurales.
- RLS y grants consolidados para roles `anon` y `authenticated`.
- RPCs finales de negocio y consulta publica.
- Storage privado con bucket oficial `godel-files`.
- Hardening final de grants, comentarios y checks defensivos.
- Types regenerados con `--schema public` mediante `npm.cmd run types:supabase`.
- Playwright incorporado como herramienta principal de QA visual/e2e.
- QA visual completo ejecutado con Chromium.

## 4. Seguridad

- `anon` mantiene un acceso minimo y controlado para solicitud publica, metadata
  publica de archivos permitida y `consultar_estado_publico`.
- `authenticated` opera bajo RLS y validaciones server-side por perfil activo,
  rol y permisos.
- RPCs internas cerradas para `anon` y ejecutables solo por roles necesarios.
- `consultar_estado_publico` queda como RPC publica controlada para `/estado`.
- `godel-files` es privado.
- No se usa `service_role` ni `SUPABASE_SERVICE_ROLE_KEY` en app code.
- El tracking publico no expone `file_path`, `order_number`, pagos, cliente,
  contacto, historial interno, comentarios, personal ni UUIDs.
- La entrega de pedidos queda bloqueada si el pago no esta completo.

## 5. QA ejecutado

- `supabase db reset` local con las 5 migraciones consolidadas.
- Auditorias npm de seguridad, cliente Supabase y tracking publico.
- `npm.cmd run verify`.
- Playwright smoke.
- Playwright visual QA completo con roles `admin`, `supervisor` y `trabajador`.
- QA SQL funcional con `BEGIN`/`ROLLBACK`.
- QA de permisos, RLS, grants, Storage, tracking, conversion, tareas y pagos.

## 6. Evidencias documentales

- `docs/development/BETA_1_DB_AUDIT.md`
- `docs/development/BETA_1_MIGRATION_CONSOLIDATION_PLAN.md`
- `docs/development/BETA_1_7_CONSOLIDATED_RESET_REPORT.md`
- `docs/development/BETA_1_8_FUNCTIONAL_QA_REPORT.md`

## 7. Incidencias resueltas

- Normalizacion de types con `--schema public`.
- Playwright/Chromium quedo como herramienta estable y principal frente a Edge
  CDP, que queda como fallback manual.
- Mejora de mensajes de login para diferenciar credenciales incorrectas de
  fallos temporales de conexion.
- Correccion local de `.env.local` documentada como incidencia de entorno, sin
  exponer secrets ni credenciales.

## 8. Observaciones pendientes

- Mantener Playwright como QA recurrente en fases futuras.
- Dividir el full visual QA en specs mas pequenos si la suite crece.
- Implementar limpieza/reconciliacion segura de objetos huerfanos de Storage
  como mejora futura.
- Mantener datos seed/QA si se decide automatizar usuarios mas adelante, sin
  service role en app code.
- Evaluar si el acceso no autorizado a rutas internas debe unificarse siempre
  con pantalla de permisos o redirect.

## 9. Criterio de cierre

Beta 1 queda:

```txt
Aprobada
```

El proyecto queda listo para avanzar a la siguiente fase planificada.
