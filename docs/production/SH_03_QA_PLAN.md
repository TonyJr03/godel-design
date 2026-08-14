# SH-03 — Plan QA funcional production-like

## Estado

```text
SH-02 = CLOSED / APPROVED
SH-03 = IN PROGRESS
SH-03.0 = CLOSED / APPROVED
SH-03.1 = CLOSED / APPROVED
SH-03.2 = CLOSED / APPROVED
SH-03.2A = CLOSED / APPROVED
SH-03.2B = CLOSED / APPROVED
SH-03.2C = CLOSED / APPROVED
SH-03.2D = CLOSED / APPROVED
SH-03.2D.1 = CLOSED / APPROVED
SH-03.2D.2 = CLOSED / APPROVED
SH-03.2D.3 = CLOSED / APPROVED
SH-03.2D.4 = CLOSED / APPROVED
SH-03.2D.5 = CLOSED / APPROVED
SH-03.2E = CLOSED / APPROVED
SH-03.3 = IN PROGRESS
SH-03.3A = CLOSED / APPROVED
SH-03.3B = CLOSED / APPROVED
SH-03.3C = IMPLEMENTED / PENDING ARCHITECTURAL REVIEW
SH-03.3D = NOT STARTED
SH-03.3E = NOT STARTED
SH-03.4 = NOT STARTED
```

## Objetivo

SH-03 demostrará que Godel funciona sobre `App Docker + Nginx + Supabase
self-hosted`, no solo sobre `npm run dev + Supabase CLI local`. SH-03.0 cerró
el diseño y SH-03.1 implementó el provisioning QA y el runner externo, sin
modificar la baseline 01–06 ni lógica de producto.

## Estado de partida

SH-02 cerró la topología production-like en `http://localhost:8080`: Nginx es
la entrada pública, Next server usa `http://api-gw:8000` y Storage/TUS público
ya tiene smoke técnico. SH-03 parte de ese estado estable para validar flujos de
usuario y negocio, incluidos roles y TUS autenticado.

Al inicio de SH-03, la suite contenía 21 specs Playwright. Sus helpers leían primero
`process.env` y solo hacen fallback a `.env.local`; por tanto el código de los
tests ya podía consumir un environment inyectado para self-hosted. En ese punto,
la configuración Playwright fijaba `baseURL` y `webServer` a `npm run dev` en
`http://localhost:3000`; SH-03.1 incorporó el runner self-hosted y SH-03.3A
eliminó los detectores de Server Actions dependientes de ese puerto.

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
en la suite E2E. Al inicio de SH-03, todas las specs compartían la asunción de
`baseURL :3000` por Playwright; el runner self-hosted de SH-03.1 usa
`PLAYWRIGHT_BASE_URL=http://localhost:8080` y deshabilita `webServer`. Login y
los clientes QA requieren las variables `GODEL_TEST_*`;
si faltan, algunos helpers omiten pruebas y no son evidencia válida de SH-03.

## Dependencias del Supabase CLI

Al inicio de SH-03, `npm run qa:bootstrap` era exclusivamente local: leía
`.env.local`, exigía URL localhost/127.0.0.1, obtenía `project_id` de
`supabase/config.toml`, derivaba el contenedor `supabase_db_<project_id>` y
ejecutaba por Docker/psql `bootstrap-local-qa-profiles.sql`. Hoy
`qa:bootstrap:selfhosted` cubre el target self-hosted explícito. El bootstrap
local usa Auth Admin con
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

## SH-03.2C — Solicitudes production-like lifecycle

Validado por Chromium serial a través de `http://localhost:8080`: solicitud
pública Encargo sin Storage, auto-review, asociación/creación de cliente,
comentarios, estados (avance, aprobación y rechazo con confirmación) y
conversión a Pedido. Cada Action se probó inicialmente con su patrón actual;
los fallbacks TD-NEXT-001 se aplicaron solo tras reproducir el bloqueo de
`ActionState` en éxito.

Quedan fuera de esta subfase los flujos de SH-03.2D/SH-03.3. Los gates focales
de permisos y `service_id` ya quedaron evidenciados por Nginx. SH-03.2C está
cerrada/aprobada y SH-03.2D — Pedidos está en curso.

Al cierre de SH-03.2C, el fallback de `AutoReviewOnOpen` era explícitamente
opt-in: Solicitudes entregaba su URL canónica y Pedidos no entregaba esa prop,
por lo que continuaba con `router.refresh()`. Por ello
`startPedidoReviewOnOpenAction` era `TEST IN SH-03.2D`: la ausencia de
`useActionState` no basta para declararla `NOT APPLICABLE` cuando existe un
consumidor real de resultado directo tras mutación y revalidación. Esta
clasificación no declara una afectación ni autoriza aplicar fallback preventivo.

## SH-03.2D.1 — Pedido Edit + Auto-review + Status

El checkpoint D.1 reprodujo por separado los tres patrones de Pedido por
Chromium serial a través de Nginx. Edición, auto-review y estado persistían sus
mutaciones, pero no asentaban `ActionState`/frescura con la revalidación de
éxito. Solo esas tres actions retiraron su propia revalidación de éxito y usan
la navegación documental canónica ya aprobada: edición usa `assign()`,
auto-review usa el opt-in `replace()` de `AutoReviewOnOpen` y estado propaga el
opt-in existente de `StatusFlowPanel`.

El gate nuevo `pedidos-core-selfhosted.spec.ts` cubre validación y edición
3/3, auto-review 3/3 y estado de Impresión para avance/cancelación con Escape
y foco restaurado. Las otras once actions de Pedido siguen `TEST IN SH-03.2`.
SH-03.2D permanece en curso y los bloques D.2–D.5 y SH-03.3 no se inician en
este checkpoint.

## SH-03.2D.2 — Personal assignment/removal

El checkpoint D.2 reprodujo independientemente por Chromium serial a través de
Nginx el pending de `assignPedidoWorkerAction` y `removePedidoWorkerAction`:
cada mutación persistía tras dejar completar su POST y navegar al detalle, pero
no asentaba `ActionState` con la revalidación de éxito. Solo esas dos actions
retiraron su propia revalidación y `PedidoWorkerAssignmentForm` recibe su URL
canónica compartida para navegar tras cada `state.ok`.

`pedidos-personal-selfhosted.spec.ts` valida el combobox requerido, assign 3/3,
remove 3/3, fila/badge frescos, Worker asignado con Personal de solo lectura y
Supervisor con controles de gestión. SH-03.2D permanece en curso; D.3, D.4,
D.5 y SH-03.3 siguen fuera de este checkpoint.

## SH-03.2D.3 — Pedido Tasks + Task Templates

Estado: `CLOSED / APPROVED`. Las siete actions
reprodujeron independientemente el patrón TD-NEXT-001 y sus consumidores ya
navegan tras `state.ok` a la URL canónica: `createPedidoTaskAction`,
`updatePedidoTaskTitleAction`, `updatePedidoTaskProgressAction`,
`completePedidoTaskAction`, `reopenPedidoTaskAction`, `deletePedidoTaskAction`
y `applyTaskTemplateAction`. La evidencia focal Nginx es PASS 3/3 por action,
sin timeout, reload, nonce, `router.refresh` ni estado optimista.

`pedidos-tasks-selfhosted.spec.ts` también verifica el desbloqueo de producción
después de crear una tarea, Worker QA asignado con creación de tarea y sin
controles administrativos, Supervisor gestionable, y visual Chromium a
1366×768 / 390×844. La regresión histórica de plantillas conserva evidencia
segmentada: 3 PASS + 2 SKIP legítimos y apply aislado PASS 1/1; sus fixtures
corregidas son stale/no deterministas, no deuda técnica. D.4 está en curso;
D.5 sigue sin iniciar.

## SH-03.2D.4 — Payments + Comments

Estado: `CLOSED / APPROVED`. El patrón original de
`updatePedidoPaymentAction` y `createPedidoCommentAction` se reprodujo de forma
independiente por Nginx: ambas mutaciones persistían, pero no completaban
`ActionState`, mantenían pending y no entregaban detalle fresco. Cada action
retiró solamente su `revalidatePedidoDetail` de éxito; los consumidores reciben
la URL canónica explícita y usan el fallback TD-NEXT-001 tras `state.ok`.

`pedidos-payment-comments-selfhosted.spec.ts` demuestra validación financiera,
tres updates 100/0 → 100/100 → 300/200 hasta Pagado, tres comentarios con orden
ascendente/autor/timestamp, y roles focales Supervisor/Worker asignado. El
histórico `pedido-edit.spec.ts` adaptó solo Pago a la navegación canónica y
pasó 4/4. D.5 cerró/aprobó; SH-03.3 continúa fuera de alcance.

## SH-03.2D.5 — Aggregate Pedido regression

Estado: `CLOSED / APPROVED`. El histórico
`pedidos.spec.ts` mezclaba la accesibilidad del workspace con una mutación TUS
(`setInputFiles` → upload → estado completado). Se retiró exclusivamente ese
tramo y la aserción visual de contador que dependía de él. La cobertura pasiva
de Archivos permanece: trigger, diálogo único, foco, estructura, input cuando
aplica, empty state, hrefs de descarga existentes sin `file_path`, bucket,
signed URL ni origen Supabase, y devolución de foco. Clasificación:
`HISTORICAL STORAGE SCOPE LEAK / OUT-OF-SCOPE HISTORICAL MUTATION`; el owner
de upload/resume/download es `pedido-upload-direct.spec.ts` en SH-03.3.

`pedidos.spec.ts` pasa `15 PASS / 2 SKIP` legítimos. Sus ajustes históricos
adicionales esperan la navegación canónica de los fallbacks ya aprobados y
asignan la identidad Worker QA exacta, no el primer trabajador disponible.
No hubo cambio de producto, Storage ni nuevo TD-NEXT.

El nuevo gate serial `pedidos-aggregate-selfhosted.spec.ts` pasa 2/2 por
Nginx/Chromium: Encargo `creado → en_revision → en_produccion →
listo_entrega → entregado`, bloqueo por tareas incompletas y después por pago,
pago completo, controles cerrados, historial representativo, listado por
búsqueda/filtro/clear, cancelación separada e Impresión sin tareas con el mismo
gate financiero de entrega. También cubre Admin, Supervisor, Worker asignado
(comentario y tareas; pagos/personal solo lectura) y Worker removido con
not-found lógico sin datos filtrados. La paginación específica de Pedidos sigue
ejecutable y pasó en el histórico con dataset de seis páginas.

Tracking público focal pasó y no expuso datos internos. La inspección visual
Chromium revisó Encargo activo en 1366×768 e Impresión cerrada en 390×844: rail,
diálogos, foco, acciones, ausencia de overflow y de fugas técnicas correctos.
Las capturas son temporales y no se versionan. Inventario sin cambios: 31 SAFE,
0 TEST, 5 N/A, 36 total.

## SH-03.2E — Core business aggregate regression and handoff

Estado: `IMPLEMENTED / PENDING ARCHITECTURAL REVIEW`. E integra sin nuevas mutaciones las evidencias de los
bloques aprobados y ejecuta la regresión serial de los dominios core mediante
Chromium por Nginx.

| Dominio | Evidencia E |
| --- | --- |
| Dashboard/shell | `dashboard.spec.ts` + `dashboard-shell.spec.ts`: 13 PASS, 1 SKIP legítimo. |
| Clientes y Servicios | `clientes.spec.ts`: 9 PASS; `configuracion-servicios.spec.ts`: 6/6 PASS. |
| Plantillas | Reutiliza D.3: 3 PASS, 2 SKIP legítimos, apply aislado 1/1 PASS. |
| Solicitudes/tracking | `solicitudes-core-selfhosted.spec.ts`: 9/9; `public-tracking.spec.ts`: 1/1. |
| Pedidos | `pedidos-aggregate-selfhosted.spec.ts`: 2/2; histórico D.5 conservado 15 PASS / 2 SKIP legítimos. |
| Listados | `internal-listings.spec.ts`: 14/14 PASS. |
| Smoke y visual | Dashboard → Clientes → Solicitudes → Pedidos → Configuración: PASS 1/1; screenshots temporales inspeccionadas desktop 1366×768 y mobile 390×844. |

El smoke E comprueba HTTP 200, h1 esperado, ausencia de fuga técnica y de
overflow. Storage se excluye íntegramente: ninguna mutación TUS, reserve/
finalize, resume, multi-file, listado, descarga, aislamiento/RLS o cleanup se
ejecuta en E.

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

### Handoff SH-03.2E → SH-03.3

E conserva SH-03.2 como `ACTIVE`: no cierra la subfase ni implementa Storage.
La matriz core queda validada serialmente por Chromium/Nginx: Dashboard y shell
(13 PASS, 1 SKIP legítimo), Clientes (9 PASS), Servicios (6/6), Solicitudes
(9/9, incluido tracking válido), Pedidos aggregate (2/2), Listados internos
(14/14), tracking inválido (1/1) y smoke Admin Dashboard → Clientes →
Solicitudes → Pedidos → Configuración (1/1, HTTP 200, h1, sin fuga técnica ni
overflow). Plantillas reutiliza evidencia D.3: 3 PASS, 2 SKIP legítimos y apply
aislado 1/1 PASS; no se reabre esa mutación.

La inspección visual E usa capturas temporales y no versionadas: Configuración
desktop 1366×768 y Pedidos mobile 390×844 permanecen legibles, sin clipping,
overflow ni texto técnico. El handoff de SH-03.3 recibe Core Business aprobado,
TD-NEXT-001 sin nuevas manifestaciones (31 SAFE / 0 TEST / 5 N/A, total 36),
la deuda activa ya registrada, health sano y baseline congelada.

Storage no fue ejecutado por E. SH-03.3 es owner exclusivo de TUS autenticado
de Pedido, TUS público de Solicitud, reserve/finalize, resume, multi-file,
listados, descargas, aislamiento/RLS y cleanup; deberá ejecutar
`storage.spec.ts`, `public-solicitud-upload-direct.spec.ts`,
`pedido-upload-direct.spec.ts` y sus gates auxiliares. Migraciones 01–06,
migration 07, `database.types`, Supabase upstream, Compose, Dockerfile y Nginx
permanecen fuera de cambios de E.

SH-03.1 preserva `npm run qa:bootstrap` para Supabase CLI local y añade un
target self-hosted explícito, con runtime/QA env separados, Compose efectivo
para perfiles y Playwright por Nginx sin `webServer`. El provisioning repetido,
login de tres roles y denegaciones de Usuarios fueron demostrados. La mutación
Auth Admin de reset y el gate final de Usuarios completaron por UI. La corrección
focal confirmó el bloqueo post-revalidación y descartó el filesystem read-only
como cofactor. Los cuatro creates verificados y la superficie de Usuarios usan
navegación documental canónica tras éxito; SH-03.1 quedó cerrada/aprobada. La
fila canónica `Impresión` fue reparada en datos y validada por REST/Nginx y
Chromium. SH-03.2A, SH-03.2B y SH-03.2C cerraron y fueron aprobadas. SH-03.2D
está en curso.

SH-03.2A cerró el inventario core y la baseline read-only production-like. Su
informe [SH_03_CORE_QA_REPORT.md](SH_03_CORE_QA_REPORT.md) registra la
corrección aprobada de navegación de listados y el alcance actualizado de
TD-NEXT-001. SH-03.2 sigue activa; SH-03.2B y SH-03.2C quedan
cerradas/aprobadas; SH-03.2D y SH-03.2D.5 también cerraron/aprobaron, y
SH-03.2E queda implementada y pendiente de revisión arquitectónica.
