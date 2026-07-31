# Beta 2.10.1 - Auditoría final de arquitectura y consistencia

## 1. Objetivo

Esta auditoría revisa el estado final de Beta 2 antes del cierre. El foco es
confirmar que la consolidación hecha entre Beta 2.0 y Beta 2.9 dejó el proyecto
coherente en arquitectura de capas, dominios, seguridad, Storage, tracking
público, Dashboard, Configuración/templates, QA y documentación.

Esta subfase es documental. No modifica código funcional, tests, helpers,
configuración, migraciones, RLS, RPCs, componentes ni tipos generados.

## 2. Resumen ejecutivo

Estado general: Beta 2 queda arquitectónicamente consistente y lista para cierre
si los gates finales de verificacion pasan en el entorno local antes del merge.

Quedo consolidado:

- `src/lib/<dominio>` como capa de dominio y servicios server-side.
- Server Actions como adaptadores finos entre formularios/rutas y servicios.
- Componentes como UI/interacción, sin Supabase directo en Client Components.
- DTOs visibles por allowlist, especialmente en rutas públicas y Storage.
- Seguridad basada en permisos TypeScript, validación server-side, RLS, RPCs y
  policies de Storage.
- QA e2e focal por dominios principales, con suite serial Chromium como gate
  estable y full visual QA como aceptación transversal.
- Build/verify sin dependencia operativa de Google Fonts.

Riesgos restantes: son principalmente deuda técnica/operativa futura, no
bloqueos de cierre de Beta 2: paralelismo e2e, usuarios QA compartidos,
fixtures/cleanup, cobertura real estable de Storage/tracking, full visual QA
grande, y posible RPC futura para tareas de plantilla si aparece concurrencia.

Recomendación general: cerrar Beta 2 después de ejecutar y registrar los gates
finales, mantener `src/lib` como capa de dominio, y preparar Beta 2.10.2 como
cierre documental/pre-merge con estado de comandos y checklist final.

## 3. Estado de fases Beta 2

| Fase | Área | Estado | Evidencia | Observaciones |
|---|---|---|---|---|
| Beta 2.0 | Auditoría integral | Cerrada | `docs/development/BETA_2_CODE_AUDIT.md` | Identificó deudas iniciales: full visual grande, fecha fija, wrappers RPC, patrones repetidos y decisión `src/lib` vs `src/services`. |
| Beta 2.1 | Arquitectura de capas | Cerrada | `docs/project-standards/ARCHITECTURE_RULES.md` | Formalizo `src/lib/<dominio>` como capa de dominio y rechazo crear `src/services`. |
| Beta 2.2 | Consolidación transversal mínima | Cerrada | Helpers e2e, helpers de acciones/RPC y documentación de estándares | Redujo fragilidad de fechas e2e y repetición transversal sin introducir arquitectura nueva. |
| Beta 2.3 | Pedidos | Cerrada | `src/lib/pedidos/README.md` | Pedidos concentra loaders, validaciones, acciones de dominio, RPC wrappers, pagos, tareas, asignaciones, historial y DTOs seguros. |
| Beta 2.4 | Solicitudes y tracking público | Cerrada | `docs/development/BETA_2_4_SOLICITUDES_AUDIT.md`, `src/lib/solicitudes/README.md`, `src/lib/public-tracking/README.md` | Se separaron flujo público, gestión interna y contrato público `/estado`. |
| Beta 2.5 | Clientes, usuarios y permisos | Cerrada | `docs/development/BETA_2_5_CLIENTES_USUARIOS_PERMISOS_AUDIT.md`, README de dominios | La app gestiona `public.perfiles`, no crea usuarios Auth ni consulta `auth.users`. |
| Beta 2.6 | Storage y archivos | Cerrada | `docs/development/BETA_2_6_STORAGE_AUDIT.md`, `src/lib/storage/README.md` | Bucket privado, path builders server-side, DTOs seguros y signed URLs solo en route handlers. |
| Beta 2.7 | Dashboard, actividad y work-items | Cerrada | `docs/development/BETA_2_7_DASHBOARD_AUDIT.md`, `src/lib/dashboard/README.md` | Dashboard por rol con DTOs seguros; `workflow_type` distingue `encargo` vs `impresion` para tareas. |
| Beta 2.8 | Configuración/templates | Cerrada | `docs/development/BETA_2_8_TASK_TEMPLATES_AUDIT.md`, `src/lib/task-templates/README.md` | Plantillas solo para `encargo`; aplicación crítica mediante RPC. |
| Beta 2.9 | QA, Playwright y tooling | Cerrada | `docs/development/BETA_2_9_QA_TOOLING_AUDIT.md`, `BETA_2_9_FOCAL_QA_MATRIX.md`, `BETA_2_9_QA_TOOLING_STRATEGY.md` | 11 specs e2e, 30 tests Chromium esperados, gate serial y estrategia final documentada. |

## 4. Arquitectura de capas

`src/app`

- Contiene rutas App Router, pages, layouts, route handlers y Server Actions.
- Las pages cargan datos server-side y entregan DTOs a componentes.
- Las Server Actions revisadas actúan como adaptadores: leen `FormData`, llaman
  servicios de `src/lib`, revalidan rutas y devuelven estados controlados.
- Los route handlers de descarga de archivos crean cliente Supabase server-side
  para validar acceso y delegan la generación de signed URL en `src/lib/storage`.

`src/components`

- Contiene UI, formularios, filtros, tabs, botones y visualización.
- Búsqueda obligatoria `rg "createClient\(" src/components src/app`: no hay
  coincidencias en `src/components`; las coincidencias aparecen en
  `src/app/login/actions.ts` y route handlers internos de descarga.
- No se detecta Supabase directo en Client Components.

`src/lib`

- Es la capa de dominio aprobada. Los dominios principales viven en
  `src/lib/<dominio>`.
- Los servicios validan input, perfil activo, permisos, acceso al recurso,
  mapean DTOs y encapsulan RPCs cuando corresponde.
- No existe `src/services` (`Test-Path src/services` devuelve `False`).
- La decisión final sigue siendo no crear una capa paralela por nombre; `src/lib`
  ya cumple el rol de backend de aplicación.

`src/types`

- Contiene tipos base/generados: `database.types.ts` y `database.ts`.
- No se detecta necesidad de mover DTOs de dominio a `src/types`; los DTOs
  visibles permanecen cerca de cada dominio.
- `src/types/database.types.ts` no debe tocarse en el cierre.

Ausencia de `src/services`

- La búsqueda sensible sobre `src docs supabase` devuelve menciones
  documentales de `src/services`, pero no carpeta ni código operativo.
- Los README de dominio repiten explícitamente "No crear `src/services`".

Boundaries client/server

- Los Client Components no son autoridad de seguridad.
- La protección real vive en proxy, loaders server-side, servicios de dominio,
  permisos TypeScript, RLS, RPCs y policies de Storage.
- Las ayudas visuales de UI no reemplazan permisos ni validaciones server-side.

## 5. Dominios consolidados

| Dominio | Carpeta | README | Estado | Deuda |
|---|---|---|---|---|
| Pedidos | `src/lib/pedidos` | Si | Consolidado: loaders, listado, detalle, estados, tareas, pagos, asignaciones, historial, comentarios, RPC wrappers. | Full QA sigue cubriendo mucho; algunos flujos internos pueden ampliar QA focal en fases futuras. |
| Solicitudes | `src/lib/solicitudes` | Si | Consolidado: validación pública por workflow, gestión interna, estados, cliente desde solicitud, comentarios/historial, RPC wrappers. | Reconciliacion Storage y hardening público siguen fuera de alcance. |
| Public tracking | `src/lib/public-tracking` | Si | Consolidado como contrato público propio por `public_reference` y DTO mínimo. | Caso focal con referencia real estable queda como mejora futura. |
| Clientes | `src/lib/clientes` | Si | Consolidado: listado, detalle, crear/editar, permisos y DTOs internos. | No hay eliminación ni deduplicación avanzada. |
| Usuarios | `src/lib/usuarios` | Si | Consolidado sobre `public.perfiles`; no crea usuarios Auth, no usa emails/passwords. | Cambios de roles requieren fase coordinada TS/RLS/docs/QA. |
| Auth | `src/lib/auth` | Si | Consolidado: perfil actual interno activo y contexto de usuario cuando aplica. | No reemplaza permisos ni RLS; debe mantenerse pequeno. |
| Permissions | `src/lib/permissions` | Si | Consolidado: matriz TS y rutas de dashboard. | Riesgo de drift si se cambia TS sin SQL/RLS y QA. |
| Storage | `src/lib/storage` | Si | Consolidado: bucket privado, validación, path builders, DTOs seguros, signed URLs server-side. | Fixtures/cleanup, reconciliación de huérfanos, antivirus/rate limiting quedan posteriores. |
| Dashboard | `src/lib/dashboard` | Si | Consolidado: resumen por rol, work-items y actividad con DTOs seguros. | Si crecen métricas, medir y evaluar agregación/RPC dedicada. |
| Task templates | `src/lib/task-templates` | Si | Consolidado: Configuración/templates, validaciones, errores seguros y aplicación RPC a `encargo`. | Crear/eliminar/reordenar tareas usa operaciones secuenciales; evaluar RPC si hay concurrencia real. |

## 6. Seguridad y permisos

Resultados de búsquedas sensibles:

- `rg "src/services|service_role|SUPABASE_SERVICE_ROLE_KEY|auth.users" src docs supabase` encontro coincidencias principalmente en documentación, README de dominios y migraciones. En `src/lib` las coincidencias son reglas negativas/documentales del tipo "no usar" o "no consultar".
- `rg "service_role|SUPABASE_SERVICE_ROLE_KEY|auth.users" src/app src/components src/lib` no muestra uso operativo en app code; las coincidencias en `src/lib/*/README.md` son prohibiciones documentadas.
- `rg "createClient\(" src/components src/app` no encontro `createClient` en componentes. Solo aparece en `src/app/login/actions.ts` y en route handlers internos de descarga.
- `rg "file_path|bucket|signedUrl|signed URL|createSignedUrl|storage.objects" src/components src/app/estado src/lib/public-tracking` solo encontro prohibiciones en `src/lib/public-tracking/README.md`; no hay exposición operativa en componentes ni `/estado`.

Conclusiones:

- No se detecta uso operativo de `service_role`.
- No se detecta uso operativo de `SUPABASE_SERVICE_ROLE_KEY`.
- No se detecta consulta a `auth.users` desde app code.
- No se detecta Supabase directo en Client Components.
- Los DTOs visibles se mantienen por allowlist, no como rows crudas.
- Rutas protegidas dependen de proxy, loaders, servicios y RLS; el sidebar es
  ayuda visual, no frontera de seguridad.
- Permisos TypeScript y RLS están alineados conceptualmente: TypeScript mejora
  UX y mensajes; RLS/RPC/policies siguen siendo defensa final.
- Las RPCs críticas siguen encapsulando operaciones transaccionales:
  conversión de solicitud a pedido, cambio de estado, pagos, historial/comentarios
  tipados y aplicación de plantillas.

## 7. Storage y archivos

Estado final:

- El bucket oficial es privado: `godel-files`.
- No hay buckets públicos ni descarga pública de archivos.
- `file_path` se construye server-side con path builders.
- Formularios y componentes no aceptan `file_path`, bucket, `visibility`,
  `uploaded_by`, categoría ni signed URL como fuente de verdad.
- Metadata visible se devuelve mediante DTOs seguros.
- Los listados internos no devuelven `file_path`, bucket, rutas privadas ni
  signed URLs.
- La descarga interna usa route handlers protegidos y signed URLs de corta
  duracion generadas server-side.
- `/estado` no lista archivos, no descarga archivos y no revela rutas privadas.
- La herencia de archivos al convertir solicitud en pedido conserva metadata; no
  mueve ni copia objetos fisicos de Storage.

Deuda aceptada:

- Storage y Postgres no son una transacción única; pueden existir objetos
  huérfanos si falla metadata tras upload.
- No hay fixture/cleanup estable para upload y descarga positiva real en e2e.
- No hay antivirus, rate limiting, captcha, honeypot ni monitoreo agregado.
- Ninguna de estas deudas se debe resolver abriendo lectura/listado/borrado
  anónimo ni exponiendo signed URLs a componentes.

## 8. Dashboard y Configuración

Dashboard:

- `/dashboard` consume `getDashboard()` como fachada principal.
- El contexto valida perfil activo y permiso `dashboard.view`.
- La respuesta se separa por rol: management (`admin`/`supervisor`) y worker
  (`trabajador`).
- Trabajador no recibe solicitudes generales, clientes globales, perfiles
  globales, configuración, pedidos no asignados ni métricas financieras
  agregadas.
- DTOs de Dashboard excluyen metadata cruda, `file_path`, bucket, signed URLs,
  datos Auth, secretos y errores técnicos.
- Work-items y summary ya usan `workflow_type`: solo `encargo` requiere tareas
  obligatorias; `impresion` puede avanzar sin tareas.

Configuración/templates:

- Configuración está limitada a `admin`.
- Las plantillas aplican a pedidos `workflow_type = encargo`.
- Los pedidos `workflow_type = impresion` no deben recibir plantillas.
- La UI oculta el selector para `impresion`, pero la defensa real está en la
  RPC `aplicar_plantilla_tareas_pedido`.
- `task-templates` concentra tipos, validaciones, errores seguros y acciones de
  dominio.
- La gestión de tareas de plantilla mantiene deuda de atomicidad si aparece uso
  concurrente real.

## 9. QA y tooling

Estado e2e:

- Specs actuales: 11 archivos `.spec.ts`.
- Helpers actuales: `auth.ts`, `assertions.ts`, `date.ts`, `qa-data.ts`.
- Fixture existente: `fixtures/sample-print-request.pdf`.
- Total esperado documentado al cierre Beta 2.9: 30 tests Chromium.
- Gate estable actual: `npm.cmd run test:e2e:chromium:serial`.
- Full visual QA queda como aceptación transversal, no como sustituto de specs
  focales.

Specs actuales:

- `smoke.spec.ts`: salud básica pública/login.
- `public-solicitud.spec.ts`: formulario público y validaciones seguras.
- `public-tracking.spec.ts`: tracking público, especialmente casos inválidos.
- `dashboard.spec.ts`: dashboard por rol y rutas protegidas.
- `clientes.spec.ts`: Clientes internos.
- `usuarios.spec.ts`: Usuarios/perfiles y permisos.
- `storage.spec.ts`: Storage, descargas y superficie pública.
- `task-templates.spec.ts`: Configuración/templates y aplicación a pedidos.
- `pedidos.spec.ts`: Pedidos internos focales.
- `solicitudes-internas.spec.ts`: Solicitudes internas focales.
- `full-visual-qa.spec.ts`: recorrido amplio de aceptación.

Tooling:

- `playwright.config.ts` define `webServer` con `npm run dev`,
  `reuseExistingServer: !process.env.CI`, traces/videos/screenshots en fallo y
  proyectos Chromium/Edge.
- `package.json` contiene scripts oficiales: `test:e2e`,
  `test:e2e:chromium`, `test:e2e:chromium:serial`, `diff:check`,
  `audit:security`, `audit:client-supabase`, `audit:public-tracking` y
  `verify`.
- `.gitignore` ignora `/test-results/`, `/playwright-report/` y `debug.log`.
- La búsqueda de fuentes confirma que en `src`/`package.json`/config no hay
  `next/font/google`, `fonts.googleapis`, `Geist` ni `Geist_Mono`; las
  coincidencias restantes están en documentos históricos de Beta 2.9.

Deuda paralela:

- La suite paralela completa no debe ser gate de cierre todavía.
- Specs autenticados/mutantes comparten usuarios QA y datos persistentes.
- El modo serial es la referencia confiable hasta tener sesiones aisladas,
  fixtures, seed y cleanup controlado.

Verificación local Beta 2.10.1:

- `npm.cmd run diff:check`: OK.
- `npm.cmd run audit:security`: OK; imprime coincidencias documentales
  esperadas y la FK de migración hacia `auth.users`.
- `npm.cmd run audit:client-supabase`: OK, sin coincidencias.
- `npm.cmd run audit:public-tracking`: OK, sin coincidencias.
- `npm.cmd run verify`: OK; `lint` y `next build` pasan sin descarga de Google
  Fonts.
- `npm.cmd run test:e2e:chromium:serial`: OK, 30/30.
- `npm.cmd run test:e2e -- --project=chromium tests/e2e/full-visual-qa.spec.ts`:
  OK, 1/1.
- Screenshots de full visual QA inspeccionados en desktop y mobile; no se
  observaron roturas visuales bloqueantes.

## 10. Documentación

Documentos principales de Beta 2 y función:

- `docs/development/BETA_2_CODE_AUDIT.md`: auditoría integral inicial y plan de subfases.
- `docs/project-standards/ARCHITECTURE_RULES.md`: regla formal de capas y `src/lib`.
- `docs/project-standards/SECURITY_RULES.md`: reglas de secretos, Supabase, rutas públicas y errores.
- `docs/project-standards/DATABASE_RULES.md`: reglas de migraciones, RLS, RPCs y tipos.
- `docs/project-standards/QA_AND_REPORTING.md`: reglas de QA y reporte.
- `docs/development/BETA_2_4_SOLICITUDES_AUDIT.md`: solicitudes y tracking público.
- `docs/development/BETA_2_5_CLIENTES_USUARIOS_PERMISOS_AUDIT.md`: clientes, usuarios y permisos.
- `docs/development/BETA_2_6_STORAGE_AUDIT.md`: Storage y archivos.
- `docs/development/BETA_2_7_DASHBOARD_AUDIT.md`: Dashboard, actividad y work-items.
- `docs/development/BETA_2_8_TASK_TEMPLATES_AUDIT.md`: Configuración/templates.
- `docs/development/BETA_2_9_QA_TOOLING_AUDIT.md`: auditoría inicial de QA/tooling.
- `docs/development/BETA_2_9_FOCAL_QA_MATRIX.md`: matriz cambio -> spec.
- `docs/development/BETA_2_9_QA_TOOLING_STRATEGY.md`: estrategia final de QA/tooling.
- README de dominios en `src/lib/*/README.md`: contratos, límites y "que no hacer" por dominio.

## 11. Deuda técnica restante

| Deuda | Área | Severidad | Bloquea Beta 2 | Fase recomendada |
|---|---|---|---|---|
| Paralelismo e2e completo | QA | Media | No | Beta posterior de tooling/CI |
| Usuarios QA compartidos | QA/Auth | Media | No | Beta posterior de fixtures QA |
| Fixtures/seed/cleanup controlado | QA/Datos | Media | No | Beta posterior de QA data |
| `storage.spec.ts` con dependencia parcial de datos existentes | QA/Storage | Media | No | Storage QA hardening |
| Tracking real focal con referencia estable | QA/Public tracking | Media | No | Public tracking QA hardening |
| Full visual QA grande | QA | Media | No | Mantener como aceptación; dividir solo si crece dolor real |
| Operaciones secuenciales en tareas de plantilla | Configuración/templates | Media | No | Evaluar si aparece concurrencia/volumen |
| Posible RPC futura para templates | Configuración/templates | Media | No | Solo si QA/uso real justifica atomicidad |
| UI/UX pendiente como fase separada | Producto/UI | Media | No | Fase UI/UX dedicada |
| Catálogo fuera de alcance | Producto | Baja | No | Fase funcional futura |
| Pagos online fuera de alcance | Producto/Finanzas | Baja | No | Fase funcional futura |
| Reconciliacion de objetos huérfanos | Storage | Media | No | Hardening operativo Storage |
| Anti-spam/rate limiting/captcha en rutas públicas | Seguridad operativa | Media | No | Pre-producción pública |
| Antivirus/escaneo profundo | Storage/Seguridad | Media | No | Pre-producción pública |
| Monitoreo operativo agregado | Observabilidad | Baja-Media | No | Infra/operaciones |

## 12. Riesgos antes de merge

Antes de mergear Beta 2 a rama principal o avanzar a la siguiente beta, revisar:

- `git status --short` limpio salvo este documento mientras la subfase este en curso.
- Commits locales organizados y subidos.
- `npm.cmd run diff:check`.
- `npm.cmd run audit:security`.
- `npm.cmd run audit:client-supabase`.
- `npm.cmd run audit:public-tracking`.
- `npm.cmd run verify`.
- `npm.cmd run test:e2e:chromium:serial`.
- `npm.cmd run test:e2e -- --project=chromium tests/e2e/full-visual-qa.spec.ts`.
- Revisión manual de documentos de cierre.
- No artefactos Playwright trackeados.
- No `.env.local`, credenciales, screenshots sensibles, traces ni videos en commit.
- No cambios accidentales en app code, tests, helpers, migraciones/RLS/RPC,
  componentes, Playwright config, package.json, `.gitignore` ni tipos generados.

## 13. Recomendación final

Beta 2 queda lista para cierre arquitectónico con los comandos finales pasando
en esta subfase. No se detecta bloqueo de arquitectura, seguridad o QA que
obligue a modificar código funcional antes del cierre.

La recomendación para Beta 2.10.2 es hacer cierre pre-merge: registrar resultados
finales de comandos, confirmar `git status`, revisar artefactos ignorados,
consolidar notas de deuda y preparar el resumen final para la rama principal.

## 14. Checklist de cierre

- [x] Arquitectura revisada.
- [x] `src/lib/<dominio>` revisado como capa de dominio.
- [x] Ausencia de `src/services` revisada.
- [x] Server Actions revisadas como adaptadores finos.
- [x] Supabase en Client Components revisado.
- [x] Dominios revisados.
- [x] Seguridad revisada.
- [x] Permisos TS/RLS revisados conceptualmente.
- [x] RPCs críticas revisadas conceptualmente.
- [x] Storage revisado.
- [x] Tracking público revisado.
- [x] Dashboard revisado.
- [x] Configuración/templates revisado.
- [x] QA revisado.
- [x] Tooling revisado.
- [x] Documentación revisada.
- [x] Deuda registrada.
- [x] Cosas que no deben tocarse en el cierre registradas.
- [x] No se modifico código funcional.
- [x] No se modificaron tests.
- [x] No se modificaron helpers.
- [x] No se modificaron migraciones, RLS ni RPCs.
