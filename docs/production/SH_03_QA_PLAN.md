# SH-03 — Plan QA funcional production-like

## Estado

```text
SH-02 = CLOSED / APPROVED
SH-03 = ACTIVE
SH-03.0 = IMPLEMENTED / PENDING ARCHITECTURAL REVIEW
NEXT AFTER APPROVAL = SH-03.1
```

## Objetivo

SH-03 demostrará que Godel funciona sobre `App Docker + Nginx + Supabase
self-hosted`, no solo sobre `npm run dev + Supabase CLI local`. Esta subfase
es de diseño: no ejecuta la suite funcional completa, no provisiona usuarios,
no modifica la baseline 01–06 ni lógica de producto.

## Estado de partida

SH-02 cerró la topología production-like en `http://localhost:8080`: Nginx es
la entrada pública, Next server usa `http://api-gw:8000` y Storage/TUS público
ya tiene smoke técnico. SH-03 parte de ese estado estable para validar flujos de
usuario y negocio, incluidos roles y TUS autenticado.

La suite actual contiene 18 specs Playwright. Sus helpers leen primero
`process.env` y solo hacen fallback a `.env.local`; por tanto el código de los
tests ya puede consumir un environment inyectado para self-hosted. Sin embargo,
la configuración Playwright fija `baseURL` y `webServer` a `npm run dev` en
`http://localhost:3000`, por lo que todavía no puede ejecutar directamente el
profile production-like sin un ajuste focal de runner.

## Inventario E2E

| Dominio | Specs existentes | Dependencia principal | SH-03 subfase |
| --- | --- | --- | --- |
| Smoke, Auth/session y protección de rutas | `smoke`, `dashboard-shell` | baseURL, credenciales QA para login | SH-03.1 |
| Roles/permisos y dashboard | `dashboard`, `clientes`, `usuarios` | admin/supervisor/trabajador; algunas fixtures vía cliente QA autenticado | SH-03.1 / SH-03.2 |
| Solicitudes, tracking y conversión | `public-solicitud`, `public-tracking`, `solicitudes-internas` | catálogo y datos QA; cliente QA en solicitudes internas | SH-03.2 |
| Pedidos, edición y tareas | `pedidos`, `pedido-edit`, `task-templates`, `pedido-upload-direct` | usuarios QA y fixtures normales de negocio | SH-03.2 / SH-03.3 |
| Pagos, configuración y mantenimiento | cobertura dentro de `pedidos`, `configuracion-servicios`, `mantenimiento` | admin QA y datos transitorios | SH-03.2 |
| Storage, TUS, finalize, listados y descargas | `storage`, `public-solicitud-upload-direct`, `pedido-upload-direct` | reservas, sesión autenticada y fixture PDF | SH-03.3 |
| Listados/responsivo | `internal-listings`, paginación de módulos | datos suficientes y navegador | SH-03.2 |
| Visual transversal | `full-visual-qa`; aspectos visuales de `mantenimiento` | screenshots y viewport | fuera del gate funcional inicial; ejecutar solo si un subgate lo exige |

Las specs que usan `createQaSupabaseClient` lo hacen mediante el cliente normal
autenticado para preparar o verificar fixtures; no hay acceso PostgreSQL directo
en la suite E2E. Todas las specs comparten la asunción actual de `baseURL :3000`
por Playwright. Login y los clientes QA requieren las variables `GODEL_TEST_*`;
si faltan, algunos helpers omiten pruebas y no son evidencia válida de SH-03.

## Dependencias del Supabase CLI

`npm run qa:bootstrap` es exclusivamente local hoy. Lee `.env.local`, exige URL
localhost/127.0.0.1, obtiene `project_id` de `supabase/config.toml`, deriva el
contenedor `supabase_db_<project_id>` y ejecuta por Docker/psql
`bootstrap-local-qa-profiles.sql`. Luego usa Auth Admin con
`SUPABASE_SECRET_KEY` para crear o actualizar solo las tres identidades QA,
ejecuta el SQL de perfiles y comprueba login.

El bootstrap ya tiene propiedades que deben preservarse: valida credenciales,
sanitiza diagnósticos, verifica Docker local, rechaza UUIDs inesperados, no
acepta duplicados Auth y converge usuarios existentes mediante actualización
controlada. Su acoplamiento que impide usarlo contra self-hosted es únicamente
el target de DB/container y la lectura implícita de `.env.local`, no la lógica
de idempotencia Auth.

## Estrategia de provisioning QA self-hosted

Se recomienda la alternativa **B: generalizar el bootstrap existente con un
target explícito y parámetros de env**, conservando `local` como default:

```text
qa:bootstrap --target local        → Supabase CLI actual, sin cambio de workflow
qa:bootstrap --target self-hosted  → Compose self-hosted efectivo
```

El core actual de validación, sanitización, Auth Admin, idempotencia y login se
reutiliza. Solo se parametriza la resolución del env y la ejecución del SQL de
perfiles. Para `self-hosted`, SH-03.1 debe resolver el contenedor DB mediante
el Compose efectivo de `infra/supabase/docker-compose.yml` más
`infra/supabase-godel.override.yml` y `.env` no versionado, no por nombre
derivado ni container ID. El SQL seguirá siendo tooling QA explícito ejecutado
por `docker compose ... exec -T db psql`; no cambia RLS ni baseline.

| Alternativa | Decisión | Motivo |
| --- | --- | --- |
| A. Segundo script completo | No recomendada | Duplicaría validación, sanitización e idempotencia. |
| B. Target/profile explícito | Recomendada | Cambio mínimo y preserva el flujo local. |
| C. Core + dos entrypoints | Reserva | Solo si la implementación B revela bifurcación material. |
| D. Provisioning manual | No aceptable como gate | No es repetible ni verifica convergencia. |

El target solo puede operar sobre los tres emails QA configurados. Usuarios
existentes se actualizan de forma controlada; no se borran usuarios reales ni se
crean duplicados ilimitados. Los roles mínimos son `admin`, `supervisor` y
`trabajador`, cada uno con Auth y perfil interno activo coherente.

## Contrato de environments QA

`compose.env.local` continúa siendo exclusivamente runtime production-like:
las cuatro variables Supabase de Godel, bind, imágenes y recursos. No contiene
credenciales QA. SH-03.1 debe usar un archivo QA separado no versionado y
gitignored, con solo los seis valores `GODEL_TEST_*` de email/password.

El bootstrap recibirá runtime env y QA env como entradas explícitas; no copiará
keys ni secretos entre archivos. La secret key requerida por el tooling se lee
del runtime env de Godel en memoria y nunca se pasa a Playwright/browser. Las
variables QA se inyectarán al proceso de test, que ya las prioriza sobre
`.env.local`.

## Estrategia Playwright

SH-03.1 debe añadir una configuración explícita, no una segunda configuración
completa: `PLAYWRIGHT_BASE_URL` seleccionará la base URL y un flag de servidor
externo deshabilitará `webServer` cuando se apunte a Nginx. El default seguirá
siendo `npm run dev` y `http://localhost:3000` para desarrollo local.

El futuro comando production-like será equivalente a:

```text
QA env explícito + PLAYWRIGHT_BASE_URL=http://localhost:8080
+ servidor externo + playwright chromium serial
```

Debe ejecutarse contra Nginx ya sano, sin iniciar otro Next dev server ni
exponer api-gw. La primera ejecución será serial y focal por subfase; la
regresión agregada queda para SH-03.4.

## Matriz funcional

| Dominio | Evidencia existente | SH-03 subfase | Gate |
| --- | --- | --- | --- |
| Topología, Auth/REST/Storage proxy, health | SH-02 smoke técnico | Referencia | No repetir salvo anomalía |
| Provisioning Auth + perfiles QA | Bootstrap CLI idempotente | SH-03.1 | Tres roles Auth/perfil/login |
| Session, routing y roles | E2E login/dashboard/rutas | SH-03.1 | Roles y denegaciones por Nginx |
| Auth Admin | UI y tests de usuarios | SH-03.1 | Admin permitido; no-admin bloqueado |
| Dashboard, clientes, solicitudes, pedidos, tareas, pagos, configuración | E2E focal existente | SH-03.2 | Flujos core y RLS por proxy |
| Tracking público | E2E existente | SH-03.2 | Datos públicos mínimos, sin fuga |
| TUS autenticado y público, resume/finalize | E2E y smoke público existente | SH-03.3 | Transferencia, control plane y aislamiento |
| Listados y descargas | `storage` y flujos internos | SH-03.3 | RLS y URLs seguras |
| Regresión, auditorías y cierre | Scripts estáticos existentes | SH-03.4 | Suite acordada + gates estáticos |

## División SH-03

| Subfase | Alcance |
| --- | --- |
| SH-03.0 | Diseño QA production-like y estrategia de fixtures. |
| SH-03.1 | Provisioning QA self-hosted; Auth/session/roles/Auth Admin. |
| SH-03.2 | Core business: dashboard, clientes, solicitudes, pedidos, tareas, pagos, configuración y tracking. |
| SH-03.3 | Storage: TUS autenticado/público, resume, finalize, listados, descargas y protecciones. |
| SH-03.4 | Regresión agregada, gates estáticos, documentación y cierre SH-03. |

## Gates

Antes de SH-03.1: SH-02 cerrado, app/Nginx/Supabase sanos y env runtime validado.
SH-03.1 debe demostrar provisioning repetible y runner externo sin alterar el
default local. Cada subfase ejecutará solo sus specs focales; no se declarará
éxito por tests skipped debido a credenciales ausentes. SH-03.4 agregará la
regresión acordada, `audit:security`, `git diff --check` y `diff:check`.

## Riesgos

- Datos persistentes self-hosted requieren nombres/referencias QA únicas y
  cleanup focal; no se debe limpiar globalmente.
- Las specs seriales comparten fixtures y no deben paralelizarse por defecto.
- Visual QA no sustituye el gate funcional y puede ejecutarse separadamente.
- TUS autenticado requiere una identidad self-hosted real; no se suplanta con
  service-role ni se crea una migración.
- `TD-UPLOAD-001`, antiabuso, antivirus, backup/restore y portabilidad siguen
  perteneciendo a PPO-03G, PPO-05, SH-04 y SH-05 respectivamente.

## Handoff

La siguiente acción, después de revisión arquitectónica, es SH-03.1. Debe
implementar el target de bootstrap self-hosted y la selección explícita de
Playwright, sin romper `npm run qa:bootstrap` ni el workflow local.
