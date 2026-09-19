# PPO-04M.4 — Managed Production QA Compatibility Audit

**Fecha:** 2026-09-18

**Estado de PPO-04M.4:** `ACTIVE / IN PROGRESS`

**Estado de PPO-04M.4A:** `COMPLETE`

**Estado de PPO-04M.4B:** `ACTIVE / HARNESS IMPLEMENTATION`

**Production QA execution:** `NOT EXECUTED`

**Production pilot rollout:** `NOT EXECUTED`

## 1. Alcance y resultado

Este pase auditó estáticamente la suite Playwright existente para determinar
cómo reutilizarla contra el Production managed protegido. No ejecutó Playwright,
no inició servidores, no accedió a Production, no creó fixtures, no realizó
uploads y no modificó Vercel, Supabase ni Deployment Protection.

```text
Git documentation baseline = 34eb594f37498b3e7904a9a606d339e2d70a67db
accepted Production runtime authority = 313b2076258c6d7a8c7bd9c1bf205213174a91ec
E2E specs inventoried = 32

MANAGED_CANDIDATE = 7
SELFHOSTED_ONLY = 14
VISUAL_QA = 1
REQUIRES_ADAPTATION = 8
UNSAFE_FOR_PRODUCTION = 2
```

La arquitectura recomendada sigue siendo:

```text
reuse existing tests
+ thin managed runner
+ minimal protection adaptation
+ explicit managed allowlist
+ mandatory fixture manifest and verified cleanup
```

El cleanup pendiente bloquea las suites mutantes, pero no bloquea la
implementación del harness ni el slice read-only de M.4B.1. Las entidades sin
borrado QA seguro y los objetos Storage comprometidos permanecen fuera de la
allowlist.

## 2. Criterio de clasificación

- `MANAGED_CANDIDATE`: spec sin mutación persistente relevante, reutilizable
  después de instalar el harness managed común.
- `SELFHOSTED_ONLY`: autoridad específica de Docker/Nginx, localhost
  production-like, bootstrap o baseline Self-Hosted. Se excluye sin modificarla.
- `VISUAL_QA`: recorrido visual/responsive reservado para PPO-04M.4C.
- `REQUIRES_ADAPTATION`: cobertura útil, pero crea o modifica estado y carece de
  identificación/cleanup managed suficiente.
- `UNSAFE_FOR_PRODUCTION`: ejecuta una operación global o modifica configuración
  compartida de manera incompatible con el gate managed actual.

`MANAGED_CANDIDATE` no significa ejecutable hoy: todas las suites autenticadas
dependen primero del contrato fail-closed y de la preservación de la cookie de
Deployment Protection.

Abreviaturas de roles: `A` = admin, `S` = supervisor, `W` = worker/trabajador,
`P` = visitante público.

## 3. Inventario completo de specs

| Spec | Área y roles | Lecturas, mutaciones, fixtures y cleanup | Dependencias, supuestos y visual | Clasificación |
| --- | --- | --- | --- | --- |
| `auth-admin-selfhosted.spec.ts` | Auth Admin; A y cuenta W | Lee usuarios; resetea la contraseña del QA worker y prueba cambio inicial. Usa la identidad compartida; no restaura la contraseña original. | Exige external server y contrato production-like; sin Supabase directo, Storage o screenshots. | `SELFHOSTED_ONLY` |
| `clientes.spec.ts` | Clientes; A/S/W | Crea y actualiza un cliente sintético, además de listing, filtros y restricciones. Usa run-id genérico, pero no elimina el cliente. | Sin Supabase directo ni Storage; asume `.env.local` vía `loginAs`; incluye responsive sin screenshots explícitos. | `REQUIRES_ADAPTATION` |
| `configuracion-servicios.spec.ts` | Catálogo de servicios; A/S/W | Lee catálogo y crea/edita/oculta un servicio QA; también valida restricciones. No existe cleanup del servicio creado. | Sin Supabase directo/Storage; toca configuración compartida; responsive sin screenshots. | `REQUIRES_ADAPTATION` |
| `core-business-handoff-selfhosted.spec.ts` | Handoff transversal; A | Smoke de rutas operativas existentes; no crea fixtures ni limpia. | Autoridad Self-Hosted; captura desktop/mobile; sin Supabase directo o Storage. | `SELFHOSTED_ONLY` |
| `dashboard.spec.ts` | Dashboard, roles y restricciones; A/S/W | Lecturas de dashboard y conteos exactos; no muta negocio. Lee `solicitudes`, `pedidos`, perfiles e historiales mediante clientes QA y cierra esas sesiones. | Supabase directo con publishable key; sin Storage/screenshots; credenciales con fallback local actual. | `MANAGED_CANDIDATE` |
| `dashboard-shell.spec.ts` | Shell, navegación y logout; A/W | Navegación, visibilidad por rol, cookie de sidebar y logout; sin fixture de negocio propio. | Sin Supabase directo/Storage/screenshots; desktop/mobile. El logout cubre redirección a `/login`. | `MANAGED_CANDIDATE` |
| `frozen-production-baseline-selfhosted.spec.ts` | Baseline congelada; A | Lee pedido y archivo fijos de un rehearsal; no muta ni limpia. | Supabase directo, Storage y screenshot; exige external server y un número de pedido fijo Self-Hosted. | `SELFHOSTED_ONLY` |
| `full-visual-qa.spec.ts` | Recorrido visual integral; P/A/S/W | Crea solicitudes, clientes, pedidos, tareas, pagos, comentarios y uploads; cambia estados y roles. No implementa teardown integral. | Borra cookies, captura numerosos screenshots y mezcla desktop/mobile; no usa Supabase directo. Debe esperar a M.4C y a cleanup seguro. | `VISUAL_QA` |
| `internal-listings.spec.ts` | Listings de pedidos/solicitudes/configuración; A | Lecturas, búsqueda, filtros y navegación; no crea fixtures. Puede depender de filas existentes y omitir checks si no hay datos. | Sin Supabase directo/Storage/screenshots; fuerte cobertura responsive. | `MANAGED_CANDIDATE` |
| `mantenimiento.spec.ts` | Cleanup de uploads; A/S/W | Incluye pruebas puras de parser/servicio, pero el caso browser confirma el cleanup global de cargas expiradas. No limita la operación a un run-id. | Storage; screenshots desktop/mobile; puede afectar residuos ajenos al run. | `UNSAFE_FOR_PRODUCTION` |
| `pedido-edit.spec.ts` | Edición de pedidos, pagos, historial y roles; A/S/W | Crea y edita un pedido, registra pagos/historial y asigna W. Usa run-id genérico; no elimina el pedido ni revierte todas las relaciones. | Supabase directo para assertions/RPC y perfiles; sin Storage/screenshots. | `REQUIRES_ADAPTATION` |
| `pedidos.spec.ts` | Pedidos end-to-end; P/A/S/W | Crea múltiples pedidos/solicitudes, personal, tareas, pagos, comentarios y transiciones. No tiene teardown integral. | Supabase directo; inspecciona listing/descarga y tráfico TUS, aunque delega uploads reales al spec dedicado; responsive. | `REQUIRES_ADAPTATION` |
| `pedidos-aggregate-selfhosted.spec.ts` | Agregado de pedidos; A/S/W | Crea y muta pedidos, roles, estados y listing; no cleanup integral. | Supabase directo para perfiles; screenshots y contrato D.5 Self-Hosted. | `SELFHOSTED_ONLY` |
| `pedidos-core-selfhosted.spec.ts` | Core de pedidos; A | Crea pedidos y prueba edición, auto-review, estado y cancelación; sin cleanup. | Contrato D.1 production-like; sin Supabase directo, Storage o screenshots. | `SELFHOSTED_ONLY` |
| `pedidos-payment-comments-selfhosted.spec.ts` | Pagos/comentarios; A/S/W | Crea pedido, pagos y comentarios; usa perfiles QA; sin teardown integral. | Supabase directo, screenshots y modo diagnóstico D.4 Self-Hosted. | `SELFHOSTED_ONLY` |
| `pedidos-personal-selfhosted.spec.ts` | Asignación de personal; A/S/W | Crea pedido, asigna y remueve W; queda el pedido creado. | Supabase directo para identidad W; contrato D.2 Self-Hosted. | `SELFHOSTED_ONLY` |
| `pedidos-tasks-selfhosted.spec.ts` | Tareas y plantillas aplicadas; A/S/W | Crea pedidos/tareas, aplica plantillas y cambia progreso; sin teardown integral. | Supabase directo, screenshots y modo diagnóstico D.3 Self-Hosted. | `SELFHOSTED_ONLY` |
| `pedido-upload-direct.spec.ts` | Upload interno; A | Crea un pedido por caso, reserva/finaliza archivos, prueba TUS, resume, concurrencia, retry y límites. No elimina metadata ni objetos comprometidos. | Storage/TUS browser directo; intercepta requests cross-origin; sin Supabase directo/screenshots. | `REQUIRES_ADAPTATION` |
| `ppo-03g-upload-limits-selfhosted.spec.ts` | Límites de transporte; P/A | Crea pedidos/solicitudes y archivos de tamaño límite; sin cleanup completo. | Lee configuración estática Self-Hosted, exige external server, usa Supabase directo, TUS y range download. | `SELFHOSTED_ONLY` |
| `public-solicitud.spec.ts` | Solicitud pública/catálogo; P/A | Crea solicitudes y un servicio; fuerza disponibilidad de servicios compartidos y oculta/restaura `Impresión`. Los registros creados permanecen y un fallo parcial puede dejar configuración alterada. | Upload pequeño, sin Supabase directo/screenshots; mutación compartida incompatible con Production. | `UNSAFE_FOR_PRODUCTION` |
| `public-solicitud-upload-direct.spec.ts` | Upload público; P/A | Crea solicitudes y reservas firmadas; cubre TUS, resume, retry/finalize, concurrencia y límites. No elimina solicitudes, sesiones ni objetos. | Storage/TUS directo; borra cookies; consulta catálogo como A; sin Supabase directo/screenshots. | `REQUIRES_ADAPTATION` |
| `public-tracking.spec.ts` | Tracking público negativo; P | Solo consulta referencias inválidas; no muta ni requiere fixture. | Sin login, Supabase directo, Storage o screenshots. | `MANAGED_CANDIDATE` |
| `server-action-completion-selfhosted.spec.ts` | Fresh-route tras Server Actions; A | Crea cliente, servicio, plantilla y pedido; no cleanup. | Exige external server y contrato production-like Self-Hosted; sin Supabase directo/Storage/screenshots. | `SELFHOSTED_ONLY` |
| `smoke.spec.ts` | Rutas públicas, login y guards; P/A | Lecturas y login; limpia cookies para checks anónimos, sin datos de negocio. | Sin Supabase directo/Storage/screenshots. `clearCookies()` rompe hoy el bypass managed. | `MANAGED_CANDIDATE` |
| `solicitudes-core-selfhosted.spec.ts` | Solicitudes core/conversión/tracking; P/A | Crea solicitudes, clientes, pedidos, comentarios y estados; sin teardown integral. | Contrato baseline Self-Hosted; borra cookies; sin Supabase directo/Storage/screenshots. | `SELFHOSTED_ONLY` |
| `solicitudes-internas.spec.ts` | Solicitudes internas y conversión; P/A/S/W | Inserta/crea clientes y solicitudes, convierte a pedidos, comenta y cambia estados. No elimina el grafo creado. | Supabase directo y un upload pequeño; responsive; sin screenshots. | `REQUIRES_ADAPTATION` |
| `storage.spec.ts` | Superficies seguras de Storage; P/A/W | Lee paneles si existen; valida archivo bloqueado antes de reserva, IDs inválidos, restricciones y ausencia de superficie pública. No crea objeto aceptado. | Storage sin TUS real, Supabase directo o screenshots. | `MANAGED_CANDIDATE` |
| `storage-access-selfhosted.spec.ts` | Acceso/listing/download/finalize; P/A/S/W | Crea pedidos, solicitudes, asignaciones y archivos; prueba revocación y finalize retry; no cleanup integral. | Supabase directo y TUS; contiene origen localhost fijo para un request anónimo. | `SELFHOSTED_ONLY` |
| `storage-cleanup-selfhosted.spec.ts` | Cleanup físico; P/A | Fabrica objeto committed y staged/expired, ejecuta cleanup y verifica con SQL local; no es portable al managed runner. | Supabase directo, TUS, scripts SQL y entorno Self-Hosted. | `SELFHOSTED_ONLY` |
| `task-templates.spec.ts` | Plantillas/tareas; A/S/W | Crea y edita plantillas/tareas, crea pedidos y aplica plantillas; elimina algunas tareas, no todo el fixture. | Sin Supabase directo/Storage/screenshots; configuración compartida y estado persistente. | `REQUIRES_ADAPTATION` |
| `user-management-compatibility-selfhosted.spec.ts` | Mutaciones de usuarios; A | Valida formularios y mutaciones sobre usuarios QA; no crea cleanup autónomo. | Exige external server y contrato de compatibilidad Self-Hosted. | `SELFHOSTED_ONLY` |
| `usuarios.spec.ts` | Listing/form/roles de usuarios; A/S/W | Lee usuarios, valida el formulario sin completar alta, filtros, paginación y restricciones. No muta identidades. | Sin Supabase directo/Storage/screenshots; responsive. | `MANAGED_CANDIDATE` |

## 4. Coverage map de PPO-04M.4

| Requirement | Specs existentes | Cobertura actual | Gap / adaptación requerida |
| --- | --- | --- | --- |
| `health/live` | Ninguno | Solo existe evidencia HTTP de M.3, no Playwright M.4. | Añadir un spec managed mínimo o un gate equivalente del runner que exija HTTP 200 y contrato. |
| `health/ready` | Ninguno | Igual que liveness. | Añadir gate mínimo que exija HTTP 200 y readiness real. |
| login | `smoke`, todos los specs con `loginAs` | Login real de A/S/W ampliamente usado. | Instalar bypass cookie y fail-closed env antes de reutilizarlo. |
| logout | `dashboard-shell`, `full-visual-qa` | `dashboard-shell` pulsa logout y exige `/login`. | Preservar/reinstalar solo cookie de infraestructura para el siguiente login. |
| roles | `dashboard`, `clientes`, `pedidos`, `usuarios`, `storage` y specs Self-Hosted | A/S/W y visibilidad cubiertos. | Seleccionar casos no mutantes primero; adaptar fixtures para pedidos/clientes. |
| restricciones | `dashboard`, `clientes`, `configuracion-servicios`, `pedidos`, `storage`, `usuarios` | Buena cobertura UI de `/sin-permisos` y guards. | Falta una selección managed explícita y negativas RLS directas focales. |
| dashboard | `dashboard`, `dashboard-shell` | Read-only, conteos, actividad y navegación por rol. | Solo harness managed; los conteos dependen del estado compartido. |
| clientes | `clientes`, `solicitudes-internas` | Listing, creación, edición y acceso. | El cliente creado no puede limpiarse con el contrato actual; admitir inicialmente solo subset read-only. |
| solicitud pública | `public-solicitud`, `public-solicitud-upload-direct`, `solicitudes-core-selfhosted` | Formulario y submit cubiertos. | El spec principal altera catálogo compartido; separar caso seguro y añadir cleanup. |
| conversión de solicitud | `solicitudes-internas`, `solicitudes-core-selfhosted` | Conversión y compatibilidad de servicio cubiertas. | Requiere grafo M4 aislado y eliminación verificada. |
| pedidos | `pedidos`, `pedido-edit` y familia `pedidos-*-selfhosted` | Cobertura funcional extensa. | Requiere subset managed, run-id M4 y teardown. |
| tareas | `pedidos`, `task-templates`, `pedidos-tasks-selfhosted` | Crear, actualizar, completar y aplicar plantilla. | Evitar mutar plantillas compartidas; cleanup topológico. |
| pagos | `pedidos`, `pedido-edit`, `pedidos-payment-comments-selfhosted` | Estados y permisos de pago cubiertos. | Ejecutar solo sobre pedido M4 aislado y borrarlo al final. |
| comentarios/historial | `pedidos`, `pedido-edit`, `solicitudes-internas`, specs Self-Hosted | Comentarios, autoría, orden e historial cubiertos. | Requiere fixture managed propio; no usar datos preexistentes. |
| tracking público | `public-tracking`, `solicitudes-core-selfhosted`, `full-visual-qa` | Negativas seguras en candidato; lifecycle positivo solo en suites mutantes. | Crear solicitud M4 y verificar tracking antes de cleanup. |
| upload interno | `pedido-upload-direct`, `ppo-03g-upload-limits-selfhosted` | Direct TUS real y límites. | Cleanup de committed Storage no está resuelto. |
| upload público | `public-solicitud-upload-direct`, `ppo-03g-upload-limits-selfhosted` | Signed TUS real. | Cleanup de solicitud, sesiones, metadata y objeto no está resuelto. |
| TUS/resume | Ambos specs `*-upload-direct` | HEAD/PATCH, offset y misma resource URL cubiertos. | No propagar bypass header a Supabase; resolver cleanup antes de ejecutar. |
| finalize | `pedido-upload-direct`, `public-solicitud-upload-direct`, `storage-access-selfhosted` | Retry y no repetición de transferencia cubiertos. | Reutilizar los dos specs managed después de adaptación. |
| listing | `storage`, `pedidos`, `storage-access-selfhosted` | Superficie segura y listing positivo existentes. | El candidato no garantiza archivo real; falta fixture managed limpiable. |
| descarga protegida | `storage`, `storage-access-selfhosted`, `ppo-03g-upload-limits-selfhosted` | Negativas managed-candidate; descarga funcional positiva Self-Hosted. | Añadir caso positivo sobre archivo M4 y verificar revocación sin origen fijo. |
| negativas RLS/security | `dashboard`, `clientes`, `pedidos`, `storage`, `usuarios` y varios Self-Hosted | Restricciones UI sólidas; parte de RLS se prueba indirectamente. | Falta matriz managed directa y focal por rol usando solo publishable key y fixtures M4. |

## 5. External-server support actual

`playwright.config.ts` implementa:

```text
PLAYWRIGHT_EXTERNAL_SERVER === "1"
→ webServer omitted

PLAYWRIGHT_BASE_URL present
→ use.baseURL = supplied value

PLAYWRIGHT_BASE_URL absent
→ use.baseURL = localhost development default
```

La expansión condicional deja `webServer` realmente ausente cuando external
server vale exactamente `1`. El runner managed debe imponer ambas variables y
validar que la base URL sea HTTPS y no sea localhost. No debe aceptar el fallback
local ni imprimir el origen.

## 6. Contrato de credenciales y environment

### Hallazgo actual

`helpers/auth.ts` y `helpers/supabase.ts` consultan primero `process.env` y luego
leen `.env.local`. Si falta una variable, los helpers hacen skip en vez de
detener el run. Para Managed Production ambas conductas son fail-open y no se
aceptan.

### Contrato propuesto

El runner debe cargar exclusivamente:

```text
.env.managed.local
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

.env.managed.qa.local
  six role credential variables for A, S and W

parent process only
  PLAYWRIGHT_BASE_URL
  VERCEL_AUTOMATION_BYPASS_SECRET
```

Los nombres se validan, pero sus valores nunca se imprimen. Las identidades son
únicamente las tres cuentas QA provisionadas en M.2B.

Antes de crear el child Playwright deben eliminarse, como mínimo:

```text
SUPABASE_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_SERVER_URL
SUPABASE_DB_PASSWORD
SUPABASE_PROJECT_ID
POSTGRES_PASSWORD
```

También conviene borrar aliases legacy de service role y material JWT heredado.
El bypass secret se consume en el bootstrap del runner y se elimina antes del
spawn. El child recibe las dos variables públicas, seis credenciales QA,
external-server/base URL, un flag managed fail-closed y la ruta temporal del
storage state; no recibe secretos privilegiados.

Los helpers deben rechazar el fallback a `.env.local` cuando el flag managed
esté activo y lanzar error ante una variable ausente. El runner debe preservar
el código de salida de Playwright.

## 7. Deployment Protection

No se debe configurar `extraHTTPHeaders` globalmente. Esa opción podría enviar
el header de bypass al tráfico browser cross-origin hacia Supabase Storage/TUS.

Estrategia mínima:

1. Validar localmente el origen Production recibido, sin hardcodearlo.
2. Crear un contexto HTTP efímero que solo solicite ese origen exacto, sin
   seguir redirects cross-origin.
3. En esa única solicitud usar el bypass y solicitar que Vercel establezca su
   cookie de automatización.
4. Verificar que el contexto obtuvo al menos una cookie aplicable al origen,
   sin asumir ni registrar su nombre.
5. Guardar el storage state en un directorio temporal fuera del repositorio.
6. Destruir el contexto bootstrap, borrar el bypass del child env y arrancar
   Chromium con ese storage state.
7. Eliminar el archivo temporal al terminar, incluso ante fallo.

`loginAs` llama hoy a `page.context().clearCookies()`. La adaptación mínima es
que, en modo managed, después del clear restaure las cookies del storage state
bootstrap. Así elimina la sesión de aplicación anterior y repone únicamente el
estado de infraestructura capturado antes de autenticar, sin depender del
nombre interno de la cookie Vercel.

`smoke.spec.ts` contiene dos `clearCookies()` adicionales y necesita el mismo
helper de reset managed. Ningún header/cookie de bypass se persistirá en Git,
reportes, screenshots o logs.

## 8. Diseño del runner managed

Archivo recomendado:

```text
scripts/run-managed-production-e2e.mjs
```

Contrato:

- parser estricto de los dos env files autorizados;
- fallo por archivo, variable, base URL o bypass ausente;
- allowlist explícita de specs/grupos managed, sin ejecutar todo `tests/e2e`;
- bootstrap same-origin de Deployment Protection;
- child env construido desde allowlist, no heredado indiscriminadamente;
- `PLAYWRIGHT_EXTERNAL_SERVER=1` y Production base URL requerida;
- Chromium y `--workers=1` por defecto;
- ninguna URL, credencial, cookie o secreto en output;
- propagación exacta del exit code;
- cleanup de storage state temporal mediante `finally` y handlers de señal.

No debe copiar los supuestos localhost del runner Self-Hosted. Sí puede
reutilizar su parser estricto, validación de requeridos, scrub del child env y
spawn con CLI local.

## 9. Seguridad y cleanup de datos QA

Cada entidad creada debe contener un token con esta forma lógica:

```text
M4-QA-<run-id>
```

El run-id debe ser único aun con ejecuciones cercanas y aparecer en nombres,
descripciones, filenames y metadata que permitan localizar residuos. PII debe
ser sintética e inequívoca: dominio reservado, teléfonos ficticios, textos QA y
bytes generados en memoria. No se usarán datos, archivos ni identidades reales.

El runner necesita un manifest temporal de IDs y object paths creados. El
cleanup se ejecuta en `finally`, en orden de dependencias, y luego hace residue
detection por run-id. El run solo puede pasar si creación, cleanup y verificación
pasan.

Matriz requerida:

| Recurso | Success / partial failure | Estado actual |
| --- | --- | --- |
| Pedidos y relaciones | Borrar por ID como QA admin y verificar cascadas/ausencia. | RLS permite delete de pedidos, pero los specs no lo hacen. |
| Solicitudes y relaciones | Borrar por ID como QA admin y verificar ausencia. | RLS permite delete de solicitudes, pero los specs no lo hacen. |
| Clientes | Eliminar solo si fueron creados por el run. | No hay policy de delete para clientes: blocker. |
| Plantillas/tareas | Eliminar tareas y plantilla M4 por ID. | Hay delete administrativo, falta harness. |
| Tipos de servicio | No dejar filas QA persistentes. | No hay delete de tipo de servicio: blocker; no crear uno en M.4. |
| Staged Storage | Abortar/reconciliar sesión, esperar criterio autorizado si aplica y verificar metadata/objeto. | Delete físico está condicionado a expired + grace; cleanup inmediato no está garantizado. |
| Committed Storage | Eliminar metadata y bytes sin tocar objetos ajenos. | La policy actual no concede delete general de committed objects: blocker. |
| Solicitud pública | Registrar referencia/ID desde creación y borrar todo el grafo. | Requiere resolución admin posterior; los specs actuales no registran manifest común. |

No se debe resolver estos blockers con `SUPABASE_SECRET_KEY`, service role o
credenciales DB: las reglas del proyecto prohíben usar autoridad administrativa
para tablas de negocio o Storage.

## 10. Paralelismo

Recomendación obligatoria para M.4:

```text
--project=chromium --workers=1
```

La suite comparte tres identidades, filas de configuración, catálogos,
plantillas, solicitudes, pedidos y Storage. Varias specs mantienen fixtures en
variables de módulo y dependen de orden serial dentro del archivo, pero ese modo
no serializa archivos diferentes. La ejecución paralela puede alterar conteos,
visibilidad, disponibilidad de servicios, asignaciones y residuos. El beneficio
de velocidad no compensa la pérdida de determinismo.

## 11. Exclusiones Self-Hosted

Los 14 specs `SELFHOSTED_ONLY` son autoridad exclusiva para uno o varios de
estos contratos:

- external server production-like en localhost;
- Docker/Nginx o bootstrap Self-Hosted;
- baseline fija de datos/artifacts del rehearsal;
- configuración estática de transporte Self-Hosted;
- SQL local de preparación/verificación;
- handoff visual SH y diagnósticos D.1–D.5.

No se modificarán para hacerlos pasar contra Managed. La cobertura funcional
equivalente se toma de specs neutrales o se adapta allí, conservando estos como
evidencia de la ruta Self-Hosted.

## 12. Visual QA boundary

`full-visual-qa.spec.ts` es un recorrido monolítico, serial y mutante. Cubre
desktop/mobile, solicitud pública, tracking, dashboard, solicitudes, pedidos,
tareas, pagos, comentarios/historial, Storage y roles. También borra cookies y
produce screenshots.

Debe reservarse para PPO-04M.4C, después de que M.4B funcional esté verde y el
cleanup managed esté probado. Antes de M.4C necesita:

- bootstrap/preservación de la cookie de protección;
- run-id M4 común;
- manifest y teardown verificable;
- eliminación de dependencia en datos preexistentes;
- paths de screenshots únicamente en artifacts temporales/Playwright;
- selección explícita de desktop y mobile.

En M.4A no se capturaron ni inspeccionaron screenshots.

## 13. Propuesta mínima de cambios

### REQUIRED FOR M.4

Archivos a añadir:

- `scripts/run-managed-production-e2e.mjs`;
- `tests/e2e/helpers/managed-session.ts` para restaurar el storage state de
  infraestructura sin conocer el nombre de la cookie;
- un spec focal read-only para liveness/readiness si esos gates no se integran
  como assertions reportables del runner.

Archivos a modificar:

- `package.json`: script managed explícito;
- `playwright.config.ts`: storage state temporal condicional y external-server
  fail-closed en modo managed;
- `tests/e2e/helpers/auth.ts`: sin `.env.local` ni skip en managed; reset de
  sesión que preserve infraestructura;
- `tests/e2e/helpers/supabase.ts`: sin `.env.local` ni skip en managed;
- `tests/e2e/helpers/qa-data.ts`: run-id común `M4-QA-*`;
- `tests/e2e/smoke.spec.ts`: usar reset de sesión managed en lugar de borrar la
  cookie de infraestructura;
- únicamente los specs mutantes admitidos en la allowlist M.4B, para manifest y
  cleanup por ID.

Archivos explícitamente no modificables para esta adaptación:

- los 14 specs Self-Hosted;
- aplicación y configuración Next.js;
- `vercel.json`;
- migraciones, policies, RPCs y tipos DB;
- configuración remota de Vercel/Supabase;
- `full-visual-qa.spec.ts` hasta M.4C.

### OPTIONAL HARDENING

- extraer el parser env estricto compartido entre runners sin mezclar sus
  contratos;
- añadir un lint/test unitario del scrub del child env;
- producir un resumen JSON sanitizado de suite, cleanup y residuos;
- dividir lógicamente `full-visual-qa` en fases sin duplicar cobertura.

### NOT REQUIRED

- una segunda suite E2E completa;
- cambiar Deployment Protection;
- hardcodear el dominio Production;
- crear un cliente Supabase admin;
- usar secretos server-only o DB en Playwright;
- modificar tests Self-Hosted para Managed;
- ejecutar múltiples browsers o workers durante el piloto.

## 14. Blockers y deuda

1. `loginAs` y `smoke` eliminan hoy la cookie de protección con
   `clearCookies()`.
2. Los helpers aceptan `.env.local` y convierten ausencia de credenciales en
   skip, no en fallo.
3. No existe spec M.4 para `health/live` o `health/ready`.
4. Los specs mutantes no usan el prefijo M4 común ni un manifest/teardown global.
5. Clientes y tipos de servicio no tienen delete QA autorizado.
6. Objetos Storage committed no tienen cleanup físico QA general; staged está
   sujeto a expiración y grace.
7. El tracking positivo, listing/descarga positiva y negativas RLS completas
   requieren fixtures managed limpiables.
8. La suite pública altera disponibilidad de configuración compartida.
9. Varios tests dependen de cantidad/datos preexistentes y pueden hacer skip,
   lo cual no equivale a aceptación.

Los blockers 5 y 6 requieren decisión de arquitectura/operación antes de
autorizar los uploads y recorridos mutantes de M.4B. No deben sortearse ampliando
privilegios del runner.

## 15. Implementación recomendada para M.4B

Orden propuesto:

1. Revisar el runner fail-closed, scrub de env, bootstrap same-origin y
   preservación de cookie implementados en M.4B.0.
2. Con autorización posterior, ejecutar en Production protegido solo el slice read-only allowlisted:
   health, smoke, public tracking negativo, dashboard/shell, listings, usuarios
   y negativas seguras de Storage.
3. Implementar manifest/cleanup para pedidos, solicitudes, plantillas y sus
   relaciones; probar cleanup ante éxito y fallo parcial fuera de Production.
4. Resolver formalmente clientes, tipos de servicio y Storage committed/staged.
5. Admitir por etapas conversión, pedidos/tareas/pagos/comentarios/tracking
   positivo y finalmente uploads/TUS/download.
6. Ejecutar residue detection y revisar logs después de cada grupo.
7. Pasar a M.4C visual solo con M.4B verde y cleanup demostrado.

```text
PPO-04M.4A = COMPATIBILITY AUDIT COMPLETE
PPO-04M.4B = ACTIVE / HARNESS IMPLEMENTATION
PRODUCTION QA EXECUTION = NOT EXECUTED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

## 16. PPO-04M.4B.0 — Managed QA Harness Implementation

### Harness implementado

Se añadió un runner managed separado y fail-closed. No reutiliza el comando
Self-Hosted, no acepta paths arbitrarios desde CLI y construye internamente la
selección read-only. La ejecución real del runner no fue invocada en este pase.

```text
PPO-04M.4B.0 = MANAGED QA HARNESS IMPLEMENTATION
Production requests executed = 0
remote fixtures created = 0
remote uploads executed = 0
```

### Contrato de entorno

El parent exige:

```text
.env.managed.local
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

.env.managed.qa.local
  GODEL_TEST_ADMIN_EMAIL
  GODEL_TEST_ADMIN_PASSWORD
  GODEL_TEST_SUPERVISOR_EMAIL
  GODEL_TEST_SUPERVISOR_PASSWORD
  GODEL_TEST_WORKER_EMAIL
  GODEL_TEST_WORKER_PASSWORD

process environment
  GODEL_MANAGED_PRODUCTION_BASE_URL
  VERCEL_AUTOMATION_BYPASS_SECRET
```

Los parsers rechazan archivos ausentes, asignaciones inválidas, duplicados y
variables requeridas vacías. El origin debe ser HTTPS limpio, sin credenciales,
query, hash, whitespace ni path distinto de `/`. No existe fallback a
`.env.local` en modo managed y no se registra ningún valor.

### Child environment y scrub

El child se construye desde una allowlist de variables de sistema no sensibles,
las dos variables públicas, las seis credenciales QA y estos controles:

```text
GODEL_MANAGED_PRODUCTION_QA = 1
PLAYWRIGHT_EXTERNAL_SERVER = 1
PLAYWRIGHT_BASE_URL = validated parent origin
GODEL_MANAGED_STORAGE_STATE_PATH = temporary path
```

Se eliminan explícitamente:

```text
SUPABASE_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_SERVER_URL
SUPABASE_DB_PASSWORD
SUPABASE_PROJECT_ID
POSTGRES_PASSWORD
JWT_KEYS
JWT_JWKS
SERVICE_ROLE_KEY
VERCEL_AUTOMATION_BYPASS_SECRET
```

Variables ajenas no allowlisted tampoco se heredan. El bypass solo existe en el
parent durante el bootstrap. Los errores internos del bootstrap se convierten
en mensajes sanitizados antes de llegar al log del parent.

### Bootstrap same-origin de Deployment Protection

El parent crea un `APIRequestContext` vacío con el origin validado como
`baseURL` y hace exactamente una request relativa a `/`. Los dos headers de
automatización se suministran únicamente a esa request. `maxRedirects = 0`
impide que el header siga un redirect y no se configura `extraHTTPHeaders` en
Playwright browser.

El bootstrap exige respuesta 2xx y captura solo cookies Secure, path `/`, cuyo
domain aplica al hostname del origin. No conoce ni registra nombres o valores de
cookies. El storage state resultante no conserva origins/localStorage y se
escribe con permisos restrictivos dentro de un directorio temporal del sistema.

El child recibe únicamente la ruta del storage state. El bypass no entra en el
child, no puede adjuntarse a requests browser cross-origin y por tanto no se
propaga a Supabase/TUS. El directorio temporal se valida antes de borrarlo y se
elimina mediante `finally` tanto en éxito como en error; las señales del parent
se reenvían al child para permitir el mismo cierre.

El mecanismo no se ejecutó contra Production. Su contrato same-origin y cleanup
se probaron con un `APIRequestContext` mock local sin red.

### Preservación de sesión de infraestructura

`managed-session.ts` mantiene el comportamiento local existente fuera del modo
managed. En managed exige el storage state inicial, lee exclusivamente sus
cookies, limpia las cookies de aplicación y repone ese conjunto inicial mediante
`BrowserContext.addCookies`. No usa nombres hardcodeados.

`loginAs` usa esta abstracción y convierte credenciales ausentes en hard failure
managed. `helpers/supabase.ts` hace lo mismo para URL, publishable key y
credenciales, sin crear cliente admin. `smoke.spec.ts` dejó de llamar
`clearCookies()` directamente.

### Configuración Playwright

En modo managed la configuración exige external server, base URL y storage
state; limita proyectos a Chromium y fija un worker. Edge y el comportamiento
normal/local permanecen intactos fuera de managed.

### Allowlist read-only final

El runner contiene estos paths exactos:

```text
managed-health.spec.ts
smoke.spec.ts
dashboard.spec.ts
dashboard-shell.spec.ts
internal-listings.spec.ts
public-tracking.spec.ts
storage.spec.ts
usuarios.spec.ts
```

Siempre añade:

```text
--project=chromium
--workers=1
```

No incorpora argumentos adicionales recibidos por CLI. Por ello no puede
seleccionar accidentalmente suites Self-Hosted, mutantes, unsafe o visuales.

### Exclusiones focales y auditoría de skips

La allowlist aplica `grep-invert` exacto a cinco tests:

- coexistencia del shell con pedido preexistente;
- panel Storage de pedido preexistente, que además podía subir un archivo;
- panel Storage de solicitud preexistente;
- navegación de usuarios entre páginas dependiente de más de 50 filas;
- reset de filtros de usuarios dependiente de más de 50 filas.

Esas exclusiones eliminan una mutación persistente y cuatro aceptaciones
condicionadas por datos preexistentes. Permanecen cubiertas las negativas
read-only de Storage y el resto de usuarios/shell.

El único skip restante alcanzable en managed podía aparecer al no resolver el
perfil activo del QA worker en `dashboard.spec.ts`; ahora esa condición falla de
forma explícita en managed y conserva el skip histórico en local. Los skips por
credenciales ausentes de `auth.ts` y `supabase.ts` también se convierten en hard
failure managed. `managed-health.spec.ts` solo se omite fuera del runner managed.

### Health spec

`managed-health.spec.ts` exige HTTP 200 y contratos `{ status: "ok" }` /
`{ status: "ready" }` para liveness y readiness. No autentica producto, no crea
datos y queda marcado como managed-only para no alterar la suite local.

### Validación local de M.4B.0

```text
harness unit tests = 8 PASS / 0 FAIL / 0 SKIP
parser and required env = PASS
public-only selection = PASS
child env scrub = PASS
invalid origin rejection = PASS
fixed allowlist = PASS
same-origin non-redirecting bootstrap mock = PASS
bootstrap error sanitization = PASS
temporary state cleanup on success/error = PASS
lint = PASS with 13 pre-existing warnings
build = PASS
Production requests executed = 0
```

No se ejecutó `test:e2e:managed:readonly`, full Playwright, servidor local ni
browser. No se crearon bypass secrets, screenshots o artifacts persistentes.

## 17. Git safety y archivos

Archivos añadidos:

- `scripts/run-managed-production-e2e.mjs`;
- `scripts/run-managed-production-e2e.test.mjs`;
- `tests/e2e/helpers/managed-session.ts`;
- `tests/e2e/managed-health.spec.ts`.

Archivos modificados:

- `package.json`;
- `playwright.config.ts`;
- `tests/e2e/dashboard.spec.ts`;
- `tests/e2e/helpers/auth.ts`;
- `tests/e2e/helpers/supabase.ts`;
- `tests/e2e/smoke.spec.ts`;
- `docs/production/PPO_04M4_MANAGED_PRODUCTION_QA_REPORT.md`.

No se modificaron specs mutantes, aplicación, configuración Next.js,
dependencias, Supabase, Vercel, Deployment Protection, RLS, grants, RPCs,
migraciones o tipos DB. No se ejecutaron commit, push, merge, rebase, amend o
cambio de rama.

## 18. PPO-04M.4B.1 — Read-only Production QA attempt

### Estado

```text
PPO-04M.4B.1 = BLOCKED IN DEPLOYMENT PROTECTION BOOTSTRAP
READ_ONLY QA = NOT EXECUTED / NOT ACCEPTED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
Production runtime requests executed = 2 SAFE GET
```

### Production authority preflight

La consulta autenticada y read-only al control plane de Vercel confirmó, sin
registrar URLs o identificadores:

```text
target/environment = production
status = READY
source branch exact = true
source SHA 313b2076258c6d7a8c7bd9c1bf205213174a91ec = true
stable Production origin expected = true
stable Production origin clean HTTPS = true
Vercel Authentication deployment type = all
```

La suborden de inspección individual devolvió una denegación de scope. No se
registró su salida cruda. La misma autoridad quedó corroborada mediante las
consultas read-only de deployments, proyecto enlazado y protección. No se hizo
ningún cambio remoto.

### Secret y harness preflight

```text
VERCEL_AUTOMATION_BYPASS_SECRET = present
GODEL_MANAGED_PRODUCTION_BASE_URL = present
.env.managed.local = present / ignored
.env.managed.qa.local = present / ignored
six exact GODEL_TEST_* variables = present
unexpected QA variable names = 0
harness unit tests = 8 PASS / 0 FAIL / 0 SKIP
```

No se imprimieron valores, credenciales, cookies, headers o dominios.

### Bloqueo fail-closed del runner

El contrato local fue corregido fuera de este pase. La reanudación comprobó las
seis claves exactas `GODEL_TEST_*`, valores no vacíos y ausencia de nombres QA
adicionales. El comando autorizado `test:e2e:managed:readonly` se invocó de
nuevo sin argumentos.

El runner alcanzó su única request de bootstrap, pero se detuvo antes de crear
el child Playwright porque el origin respondió HTTP 307. Un segundo GET
diagnóstico, con el mismo aislamiento same-origin y `maxRedirects = 0`, confirmó
sanitizadamente:

```text
request completed = true
status = 307
redirect present = true
redirect same-origin = true
cookies captured = 1
origin-applicable cookies = 1
cleanup = PASS
```

El bypass sí materializó una cookie de infraestructura aplicable y no hubo
redirect cross-origin. El bloqueo se debe a que el harness aprobado acepta solo
2xx en bootstrap. No se modificó código, no se siguió el redirect y no se hizo
fallback a `.env.local`.

### Cobertura y residuos

```text
Playwright child started = false
tests passed = 0
tests failed = 0
tests skipped = 0
health/live = NOT EXECUTED
health/ready = NOT EXECUTED
login/logout = NOT EXECUTED
roles/guards = NOT EXECUTED
dashboard = NOT EXECUTED
listings = NOT EXECUTED
tracking negative = NOT EXECUTED
Storage negatives = NOT EXECUTED
usuarios = NOT EXECUTED
remote fixtures created = 0
remote uploads executed = 0
Playwright artifacts created = 0
```

Las únicas requests contra el runtime fueron dos GET a la raíz: el bootstrap y
su diagnóstico sanitizado. No se iniciaron tests de producto, requests mutantes,
login, fixtures o uploads. Por tanto no hubo residuos atribuibles al run en
clientes, solicitudes, pedidos, tareas, pagos, archivos, Storage o Auth. No
corresponde revisar logs runtime como evidencia de una suite que no comenzó.

### Acción requerida antes de reintentar

Dirección Técnica debe decidir una adaptación focal del bootstrap antes de otro
reintento: aceptar una respuesta 3xx únicamente cuando el redirect sea
same-origin y exista cookie aplicable, o seleccionar un endpoint same-origin
2xx que conserve el mismo contrato de protección. Cualquiera de las dos opciones
requiere autorización para modificar y volver a validar el harness. No se
requiere cambiar Vercel, Supabase o Deployment Protection.

## 19. PPO-04M.4B.1 — Redirect adaptation and read-only execution

### Adaptación autorizada

El primer intento falló cerrado porque el bootstrap exigía 2xx aunque Vercel
había establecido la cookie mediante HTTP 307. Se adaptó únicamente el runner y
sus tests focales al contrato documentado de `x-vercel-set-bypass-cookie`.

El bootstrap mantiene una sola request parent, `maxRedirects = 0`, headers
limitados a esa request y ausencia total del bypass en el child. Acepta:

- 2xx con al menos una cookie aplicable;
- exclusivamente 301, 302, 303, 307 o 308 con `Location` presente y resoluble,
  origin exacto, username/password vacíos y al menos una cookie aplicable.

Rechaza 300, 304, 305, 306, cualquier 4xx/5xx, status desconocido, `Location`
ausente o inválida, cambio de protocolo/hostname/puerto, credenciales URL y
cookie no aplicable. Nunca sigue ni registra el redirect.

```text
harness unit tests = 14 PASS / 0 FAIL / 0 SKIP
lint = PASS / 0 errors / 13 pre-existing warnings
network used by unit tests = false
```

### Preflight final

```text
branch exact = true
HEAD 3684cbb0d72fd6412e5169155ea2089448f1e848 = true
expected worktree files only = true
Production target = production
Production status = READY
runtime source SHA 313b2076258c6d7a8c7bd9c1bf205213174a91ec = true
stable Production origin expected = true
Deployment Protection = all
bypass present = true
six exact GODEL_TEST_* variables = present
unexpected QA variable names = 0
```

No se registraron valores, URLs, IDs, emails, contraseñas, headers, cookies o
secretos.

### Bootstrap y Playwright

```text
bootstrap status class = 3xx
redirect used = true
redirect same-origin = true
infrastructure cookie count > 0 = true
Playwright child started = true
project = chromium
workers = 1
```

### Totales del run

```text
tests selected after five predefined grep-invert exclusions = 44
tests passed = 30
tests failed = 3
tests skipped at runtime = 0
tests did not run after failure limit = 11
duration = 3.2m
READ_ONLY QA = NOT ACCEPTED
```

Los cinco tests excluidos por el harness no se contabilizan como skips. Los once
tests no ejecutados tampoco fueron skips silenciosos: Playwright detuvo el run
tras alcanzar el límite de tres fallos.

### Resultado por superficie

```text
health/live = PASS
health/ready = PASS
public request smoke = PASS
public tracking page smoke = PASS
public tracking invalid reference = PASS
login page = PASS
admin login = PASS
logout = NOT COMPLETED
unauthenticated internal guards = PASS
usuarios supervisor guard = PASS
usuarios worker guard = PASS
dashboard role/guard matrix = NOT EXECUTED after failure limit
dashboard admin = FAIL
dashboard shell desktop = FAIL
dashboard shell mobile/role visibility = NOT EXECUTED after failure limit
internal listings = 13 PASS / 1 FAIL
Storage negatives = 4 PASS
usuarios validation = 4 PASS
```

### Fallos de aceptación

1. `dashboard-shell`: después de autenticar y cargar correctamente el shell
   desktop, no apareció el botón esperado por el locator de expansión; la
   captura mostró la barra lateral expandida.
2. `dashboard`: con cero pedidos activos, el locator regex de `Pedidos activos`
   coincidió tanto con el heading accesible del board como con el heading del
   empty state `No hay pedidos activos`, produciendo strict-mode violation.
3. `internal-listings`: la aceptación desktop exigió una tabla, pero Production
   no tiene pedidos y renderizó correctamente el empty state, sin tabla.

Las tres capturas locales fueron inspeccionadas. No se modificaron los specs
funcionales ni se ampliaron exclusiones. Los traces y videos se tratan como
material local potencialmente sensible y no fueron abiertos, exportados o
subidos.

### Residue evidence

La allowlist no contiene creación autorizada de fixtures y el run no ejecutó
specs mutantes, uploads o creación de usuarios. No se observaron operaciones de
creación atribuibles al run:

```text
new clientes = 0 observed
new solicitudes = 0 observed
new pedidos = 0 observed
new tareas = 0 observed
new pagos = 0 observed
new archivos = 0 observed
new Storage objects = 0 observed
new Auth users = 0 observed
```

Esta evidencia se limita al contrato estático de la allowlist, sus rutas
ejecutadas y la ausencia de marcadores/fixtures del run. No se usaron secretos,
service role, DB privilegiada ni permisos ampliados para enumerar globalmente
Auth o Storage.

### Production logs

La consulta sanitizada de logs se intentó tanto por environment Production como
por el deployment exacto localizado por SHA. Vercel rechazó ambas consultas por
scope. No se imprimió la respuesta cruda ni se inspeccionaron payloads.

```text
events reviewed = 0 / unavailable due to scope
errors/fatal = NOT DETERMINED
HTTP 5xx = NOT DETERMINED
unhandled runtime errors = NOT DETERMINED
Supabase errors = NOT DETERMINED
Auth errors = NOT DETERMINED
```

### Estado resultante

```text
PPO-04M.4B.1 = READ-ONLY QA NOT ACCEPTED
PPO-04M.4B = ACTIVE / FAILURE REVIEW REQUIRED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

El bootstrap seguro queda demostrado y no es el blocker vigente. La aceptación
read-only requiere una decisión posterior sobre los tres tests incompatibles
con el estado vacío de Production y, si se exige evidencia de logs, resolver el
scope read-only de la CLI sin modificar el deployment.

## 20. PPO-04M.4B.1 — Empty-state corrections and deterministic shell rerun

### Clasificación de los tres fallos anteriores

1. El fallo del heading de dashboard era una ambigüedad del test: el matcher
   amplio coincidía con el board y con su empty state. La aplicación era
   correcta.
2. El fallo desktop de listings era una incompatibilidad del test con un estado
   vacío válido: exigía tabla aun cuando no existían registros. La aplicación
   era correcta.
3. El fallo de shell no permitía saber si falló persistencia, render o
   accesibilidad. Se convirtió en diagnóstico secuencial sin volverlo permisivo.

### Cambios exactos

- `dashboard.spec.ts`: el heading por defecto del board usa el matcher semántico
  exacto `/^pedidos activos$/i`; no usa `.first()`.
- `internal-listings.spec.ts`: el contrato desktop espera tabla o empty state.
  Con tabla mantiene headers esperados/prohibidos; sin registros exige el texto
  vacío válido, tabla ausente/oculta, cards ocultas y ausencia de overflow.
- `dashboard-shell.spec.ts`: conserva un único click y valida en orden cookie,
  reducción de ancho y transición accesible. Los asserts emiten las
  clasificaciones técnicas autorizadas.

No se modificaron aplicación, componentes, fixtures, allowlist o configuración
remota.

### Validación local previa

```text
lint = PASS / 0 errors / 13 pre-existing warnings
harness = 14 PASS / 0 FAIL / 0 SKIP
git diff --check = PASS
```

### Production preflight

```text
branch = ops/managed-free-production-pilot
HEAD = 4818d0d1b9dd37d509b910ddf78a5fe8c1a48bd7
Production target = production
Production status = READY
runtime SHA 313b2076258c6d7a8c7bd9c1bf205213174a91ec = exact
stable origin match = true
Deployment Protection = all
bypass = present
six exact GODEL_TEST_* variables = present
```

### Segundo run completo

```text
bootstrap status class = 3xx
redirect used = true
redirect same-origin = true
infrastructure cookie present = true
Playwright child started = true
project = chromium
workers = 1
tests selected = 44
tests passed = 32
tests failed = 2
runtime skipped = 0
tests did not run after failure limit = 10
duration = 3.6m
READ_ONLY QA = NOT ACCEPTED
```

Las cinco exclusiones `grep-invert` siguieron fuera del run y no se contaron
como skips.

### Resultado de las correcciones

```text
dashboard exact board heading = PASS
internal listings desktop empty state = PASS
shell = COOKIE_TRANSITION_FAILED
SHELL_READ_ONLY_PASS = NOT EMITTED
```

El shell volvió a fallar en la primera condición posterior al único click: la
cookie `godel_sidebar_collapsed` no apareció dentro del timeout observable. La
captura mostró la sidebar todavía expandida. Por orden de Dirección Técnica no
se aplicó otra corrección, retry, segundo click, force click, timeout adicional
ni modificación de `DashboardDesktopSidebar.tsx`.

### Segundo fallo y cobertura

El test de badges/conteos de management obtuvo conteos cero, confirmó los badges
y luego intentó abrir el diálogo de solicitudes. En Production vacío el click
no abrió diálogo y la expectativa falló. Se clasifica como una nueva
incompatibilidad del test con acción de conteo cero; no se corrigió en este pase.

```text
global admin dashboard = PASS
dashboard badges/counts = FAIL on zero-count dialog expectation
remaining dashboard role/guard tests = NOT EXECUTED after failure limit
shell desktop = COOKIE_TRANSITION_FAILED
shell mobile/role visibility = NOT EXECUTED after serial failure
internal listings = 14 PASS
health/live = PASS
health/ready = PASS
public tracking negative = PASS
smoke and admin login = 6 PASS
Storage negatives = 4 PASS
usuarios validation/guards = 4 PASS
```

Se inspeccionaron las dos capturas desktop generadas. Videos y traces permanecen
locales bajo `test-results/`, ignorados, y no fueron abiertos, exportados o
subidos.

### Vercel logs

Se consultó primero la ayuda de Vercel CLI 59.23.2. Después se usó la sintaxis
soportada con la ventana temporal del run y únicamente el contexto automático
del proyecto enlazado. La CLI volvió a negar acceso por scope.

```text
VERCEL_RUNTIME_LOGS_CLI = UNAVAILABLE / SCOPE
events reviewed = 0
errors/fatal = NOT DETERMINED
HTTP 5xx = NOT DETERMINED
unhandled runtime errors = NOT DETERMINED
Supabase errors = NOT DETERMINED
Auth errors = NOT DETERMINED
```

No se modificaron scope, permisos, proyecto o deployment.

### Residue evidence y estado

La allowlist permaneció read-only. No se ejecutaron specs mutantes, creación de
fixtures, uploads, alta de Auth users o mutaciones de negocio. No se usaron
service role, secret key o DB privilegiada para ampliar la comprobación.

```text
fixtures created = 0 observed
uploads = 0 observed
Auth users created = 0 observed
business mutations = 0 observed

PPO-04M.4B.1 = READ-ONLY QA NOT ACCEPTED
PPO-04M.4B = ACTIVE / FAILURE REVIEW REQUIRED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

El siguiente checkpoint requiere decisión técnica sobre
`COOKIE_TRANSITION_FAILED` y sobre el contrato de acciones con conteo cero. No
se debe modificar automáticamente la aplicación ni reinterpretar los diez tests
no ejecutados como aceptación.
