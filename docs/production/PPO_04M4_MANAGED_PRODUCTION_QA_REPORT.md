# PPO-04M.4 — Managed Production QA Compatibility Audit

**Fecha:** 2026-09-18

**Estado de PPO-04M.4:** `ACTIVE / IN PROGRESS`

**Estado de PPO-04M.4A:** `COMPLETE`

**Estado de PPO-04M.4B:** `ACTIVE / MUTATING QA DESIGN`

**Production QA execution:** `NOT EXECUTED`

**Production pilot rollout:** `NOT EXECUTED`

> **Handoff PPO-04M.4B.3.0 (2026-09-20).** M.4B.1 queda
> `CLOSED / READ_ONLY QA PASS`; M.4B.2 queda
> `CLOSED / MUTATING QA ARCHITECTURE APPROVED` en la autoridad
> [PPO_04M4B2_MUTATING_QA_DESIGN.md](PPO_04M4B2_MUTATING_QA_DESIGN.md).
> Se implementó sólo infraestructura local de manifests: identidad aleatoria,
> esquema v1 validado, persistencia atómica, discovery/gate de residuos y
> ownership fail-closed para `solicitud`/`trabajo_plantilla`. No hay adaptador
> Supabase/HTTP ni mutación remota. Validación local: safety harness `14/14` y
> read-only harness congelado `19/19`.
>
> La revisión arquitectónica identificó y corrigió la semántica de cleanup
> multirrecurso: `cleanup_required` admite hermanos `planned`, `created`,
> `cleanup_pending` y `clean`, sin admitir recursos nuevos ni reactivación;
> cualquier recurso `blocked` obliga al run a quedar `blocked`. El esquema v1,
> el ownership fail-closed y el residue gate permanecen sin cambios.
>
> `PPO-04M.4B.3.0 = IMPLEMENTED / STATE MODEL CORRECTED / PENDING FINAL REVIEW`;
> `PRODUCTION MUTATING QA = NOT EXECUTED`; `FIRST PRODUCTION MUTATION = NOT AUTHORIZED`.

> **Handoff PPO-04M.4B.3.1 (2026-09-20).** M.4B.3.0 queda
> `CLOSED / SAFETY INFRASTRUCTURE APPROVED`, con autoridad aprobada
> `f1c4e3c801da46f024a4e11c3e31a714c58033e4`. Se implementó el flujo dedicado
> de una sola solicitud pública `encargo`: confirmación destructiva explícita,
> residue gate, bootstrap previo al manifest, intent `planned` previo a
> Playwright, child environment mínimo, discovery exacto, ownership pre-delete,
> DELETE acotado, verificación posterior y recovery sólo para `solicitud`.
> El runner unitario cubre `23/23` casos con adapters falsos y cero HTTP.
>
> `PPO-04M.4B.3.1 = IMPLEMENTED / PENDING ARCHITECTURAL REVIEW`;
> `PRODUCTION MUTATING QA = NOT EXECUTED`; `FIRST PRODUCTION MUTATION = NOT AUTHORIZED`.

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

## 21. PPO-04M.4B.1 — Hydration diagnosis and interaction hardening

### Diagnóstico controlado

El segundo run fallido había aislado dos interacciones perdidas: el click de
colapso no persistía la cookie y la acción `Solicitudes` con conteo cero no
abría su diálogo. El código confirmó que el conteo cero no deshabilita la
acción y que su panel contiene el empty state válido
`Sin solicitudes pendientes`.

Se añadió temporalmente una espera de 1000 ms después de que `loginAs()`
confirmara `/dashboard` y su heading, exclusivamente en Managed Production QA.
Tras revalidar el deployment Production READY, su rama y SHA exactos, el origen
estable y Deployment Protection para todos los deployments, se ejecutó una sola
vez la allowlist read-only completa.

```text
bootstrap status class = 3xx
redirect used = true
redirect same-origin = true
infrastructure cookie present = true
tests selected = 44
tests passed = 44
tests failed = 0
tests skipped = 0
duration = 6.4m
shell cookie transition = PASS
Solicitudes zero-count dialog = PASS
Solicitudes zero-count empty state = PASS
HYDRATION_RACE_CONFIRMED = true
```

La espera temporal se eliminó inmediatamente después del run y
`tests/e2e/helpers/auth.ts` quedó idéntico a HEAD. No queda ningún timeout,
retry, segundo click, `force`, `dispatchEvent` o `networkidle` como solución.

```text
ROOT CAUSE = PRE-HYDRATION INTERACTION RACE
temporary wait removed = true
```

### Hardening aplicado

El workspace expone `isInteractiveReady` desde su contexto. El servidor y el
primer render cliente producen `false`; un efecto posterior a hidratación lo
lleva a `true` mediante una microtarea, sin delay temporal. `openAction()` y
`openMore()` ignoran defensivamente cualquier invocación anterior a readiness.

Los controles de rail, trigger, toolbar tablet y barra mobile usan `disabled`
nativo mientras no exista readiness, combinado con el disabled funcional de
cada acción. Los controles `Más` siguen el mismo contrato. No cambiaron labels,
badges, permisos, tonos, layout, SSR ni naturaleza de los botones.

La barra lateral desktop mantiene cookie, ancho, labels, `aria-expanded` y
`aria-controls`. Su botón de colapso/expansión empieza deshabilitado y el handler
rechaza ejecución antes de readiness. El click sobre el fondo completo de una
sidebar colapsada no se modificó; sigue atravesando el handler guardado, pero no
dispone de un disabled nativo propio. Esta superficie residual queda documentada
sin ampliar el alcance autorizado.

Los tests funcionales ahora exigen que el control esté habilitado antes de cada
click único del shell y antes de abrir una acción del workspace. Con conteo cero
siguen abriendo el panel y comprueban los contratos reales:

```text
Solicitudes = Sin solicitudes pendientes
Entregas = Sin pedidos listos
```

No se crearon fixtures ni se cambió el contrato de conteos.

### Validación local y estado

```text
harness = 14 PASS / 0 FAIL / 0 SKIP
lint = PASS / 0 errors / 13 pre-existing warnings
build = PASS
Production requests after implementation = 0
Production runtime SHA = 313b2076258c6d7a8c7bd9c1bf205213174a91ec / UNCHANGED
```

No se ejecutó nuevamente la suite contra Production después de implementar el
hardening, porque el runtime desplegado todavía no contiene la solución. No se
promovió ni redesplegó ningún deployment y no se modificaron Vercel, Supabase,
Deployment Protection, datos de negocio, variables o dependencias.

```text
PPO-04M.4B.1 = ACTIVE / HYDRATION FIX PENDING PREVIEW VALIDATION
PRODUCTION RUNTIME = UNCHANGED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
PREVIEW VALIDATION REQUIRED BEFORE PRODUCTION UPDATE
READ_ONLY QA PASS = NOT CLAIMED FOR THE NEW IMPLEMENTATION
```

## 22. PPO-04M.4B.1 — Exact Preview validation attempt

**Fecha:** 2026-09-19

### Autoridad y target

El worktree comenzó limpio sobre la rama autorizada y el commit que contiene el
hydration hardening:

```text
branch = ops/managed-free-production-pilot
HEAD = fbf8bc4d6e4469dacbf199f36c62c1a5dc71a0fc
hydration fix commit = fbf8bc4d6e4469dacbf199f36c62c1a5dc71a0fc
```

La consulta autenticada y read-only de Vercel encontró exactamente un
deployment READY dentro del listado Preview cuya rama y SHA coinciden. El CLI
representa el target no productivo sin valor explícito en este listado; el
scope `--environment preview` y la ausencia de target Production establecen la
clasificación sin recurrir a alias ni a otro deployment.

```text
exact Preview candidates = 1
query environment = preview
status = READY
source branch exact = true
source SHA exact = true
deployment is not Production = true
Vercel Authentication = All Deployments
Preview protected = true
```

No se registraron URL, deployment ID, project ref, cookies, headers, tokens ni
secretos. El bypass dedicado existente estaba presente; no se creó otro.

Para esta ejecución se conservó sin cambios el contrato histórico del runner:

```text
runner variable historical name = GODEL_MANAGED_PRODUCTION_BASE_URL
actual target for this run = PREVIEW
```

El origen asignado a esa variable existió únicamente en el proceso del run y
correspondió al Preview exacto. No se cambió código ni configuración.

### Preflight y runtime smoke

```text
.env.managed.local = present / ignored
.env.managed.qa.local = present / ignored
six exact GODEL_TEST_* variables = present
unexpected QA variable names = 0
VERCEL_AUTOMATION_BYPASS_SECRET = present
temporary hydration wait present = false

harness = 14 PASS / 0 FAIL / 0 SKIP
/api/health/live = HTTP 200 / status ok
/api/health/ready = HTTP 200 / status ready
/login = HTTP 200
/ = HTTP 200
```

Los cuatro probes fueron GET protegidos y same-origin contra el Preview exacto.
No realizaron mutaciones.

### Managed read-only Playwright

El runner se ejecutó sin argumentos adicionales, con Chromium, un worker, la
allowlist fija y las cinco exclusiones predefinidas.

```text
selected = 44
passed = 31
failed = 5
runtime skipped = 0
did not run = 8
duration = 7.9m
PREVIEW_READ_ONLY_QA = NOT ACCEPTED
```

Los cinco fallos fueron:

1. el test de badges/conteos no encontró el heading del dashboard después del
   login;
2. el test responsive de pedidos tampoco encontró ese heading durante login;
3. la navegación responsive a solicitudes agotó el timeout de `page.goto`;
4. la navegación del contrato de controles a usuarios agotó el timeout de
   `page.goto`;
5. otro `beforeEach` de listings no encontró el heading posterior al login.

No se realizó rerun ni se añadieron timeouts, retries de click, segundo click,
`force`, `dispatchEvent` o `networkidle`.

### Gate de hidratación

El test completo del shell desktop sí pasó, incluyendo las assertions añadidas
por el hardening:

```text
dashboard shell collapse control enabled before click = PASS
single click only = PASS
sidebar cookie transition = PASS
sidebar width transition = PASS
toggle accessible transition = PASS
```

El test de conteos falló durante `loginAs()` antes de intentar cualquiera de
las dos acciones. Por tanto el Preview no produjo evidencia de los gates
zero-count en este run:

```text
Solicitudes zero-count action enabled before click = NOT EXECUTED
Solicitudes dialog opens = NOT EXECUTED
Solicitudes zero-count empty state = NOT EXECUTED

Entregas zero-count action enabled before click = NOT EXECUTED
Entregas dialog opens = NOT EXECUTED
Entregas zero-count empty state = NOT EXECUTED
```

No se reinterpretó el PASS previo de Production con espera diagnóstica como
aceptación del nuevo build Preview.

### Residuos, artifacts y logs

La allowlist ejecutada permaneció read-only. No se usaron secret key, service
role o acceso DB privilegiado para ampliar la verificación.

```text
fixtures created = 0 observed
business mutations = 0 observed
uploads = 0 observed
Auth users created = 0 observed
```

Los videos, traces y contextos de error generados por Playwright permanecen
locales e ignored. No se inspeccionaron ni exportaron tokens, cookies o headers.

La consulta read-only de logs del deployment exacto volvió a ser rechazada por
el scope actual:

```text
VERCEL_RUNTIME_LOGS_CLI = UNAVAILABLE / SCOPE
events reviewed = 0
errors/fatal = NOT DETERMINED
HTTP 5xx = NOT DETERMINED
```

No se cambiaron scopes, permisos, proyecto, deployment ni Deployment
Protection.

### Estado resultante

```text
HYDRATION FIX PREVIEW = NOT ACCEPTED
PPO-04M.4B.1 = ACTIVE / PREVIEW READ_ONLY QA NOT ACCEPTED
PRODUCTION UPDATE = NOT EXECUTED
PRODUCTION RUNTIME = 313b2076258c6d7a8c7bd9c1bf205213174a91ec / UNCHANGED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

No se promovió ni redesplegó Production. El informe queda modificado sólo en el
worktree local para preservar la correspondencia entre el Preview validado y
`fbf8bc4d6e4469dacbf199f36c62c1a5dc71a0fc`.

## 23. PPO-04M.4B.1 — Failure artifact diagnosis

**Fecha:** 2026-09-20

### Alcance

Se preservó el reporte local anterior y no se repitió inicialmente ningún test.
El diagnóstico inspeccionó los cinco `error-context`, los frames locales finales
y los traces ya generados. Sólo se extrajeron pathnames, tipos de request,
status, duraciones, timings de navegación y errores de consola sanitizados. No
se copiaron ni exportaron URLs completas, hosts, headers, cookies, cuerpos,
credenciales, tokens o valores Supabase.

El hydration gate del shell había pasado completamente en el run original y no
existe evidencia de una regresión de esa corrección:

```text
HYDRATION_RACE regression = false
```

### Cinco fallos exactos

| Spec y test | Fase | Pathname observado | Error y timeout | Clasificación |
| --- | --- | --- | --- | --- |
| `dashboard.spec.ts` — `management dashboard badges and more links use exact counts` | `loginAs`, después del redirect aceptado | `/dashboard` | heading del dashboard no visible en 20 s | `POST_LOGIN_NAVIGATION_TIMEOUT` |
| `internal-listings.spec.ts` — `pedido responsive cards keep approved hierarchy below xl` | `beforeEach/loginAs`, después del redirect aceptado | `/dashboard` | heading del dashboard no visible en 20 s | `POST_LOGIN_NAVIGATION_TIMEOUT` |
| `internal-listings.spec.ts` — `solicitud responsive cards show workflow before service below xl` | navegación del test hacia solicitudes | `/dashboard`; target `/dashboard/solicitudes` | `page.goto` agotó el timeout global de 30 s | `LISTING_NAVIGATION_TIMEOUT` |
| `internal-listings.spec.ts` — `listing header controls have unique DOM instances and IDs` | navegación tras completar contratos anteriores | `/dashboard/clientes`; target `/dashboard/configuracion/usuarios` | `page.goto` quedó pendiente al agotarse el timeout global de 30 s; quedaban aproximadamente 10 s para esa navegación | `LISTING_NAVIGATION_TIMEOUT` |
| `internal-listings.spec.ts` — `listing header keeps title and description together with active filters` | `beforeEach/loginAs`, después del redirect aceptado | `/dashboard` | heading no visible en 20 s dentro de un hook de 30 s | `POST_LOGIN_NAVIGATION_TIMEOUT` |

Los dos fallos denominados originalmente de login no quedaron en `/login`:
Auth y el redirect habían terminado, pero el contenido operativo posterior no
reemplazó el loading boundary dentro del tiempo disponible.

### Evidencia visual

Los cinco frames finales muestran un shell autenticado desktop o mobile y el
estado `Preparando vista… / Cargando información operativa.` de
`dashboard/loading.tsx`. Ninguno muestra formulario de login, alerta de Auth o
estado inactivo.

```text
page classification = dashboard / authenticated shell / loading boundary
visible alert present = false
visible alert category = NO_VISIBLE_LOGIN_ERROR
submit button state = NOT PRESENT / ALREADY AUTHENTICATED
INVALID_CREDENTIALS_MESSAGE = false
TEMPORARY_LOGIN_ERROR_MESSAGE = false
INACTIVE_PROFILE_MESSAGE = false
```

Se inspeccionaron frames de `1280x720`, `1366x768` y `390x844`. No se exportó
ninguna imagen fuera del directorio temporal de diagnóstico.

### Trace y Auth

En los cinco traces el submit produjo un POST de login completado y un redirect
HTTP 303. Las duraciones observadas estuvieron entre 0.7 s y 4.5 s. La
navegación posterior a `/dashboard` recibió HTTP 200; las respuestas observadas
estuvieron entre 0.4 s y 8.6 s.

```text
login completed = true
server action completed normally = true
Auth HTTP observable status = 303 redirect after submit
AUTH_FAILURE_NOT_OBSERVED = true
AUTH_429_CONFIRMED = false
AUTH_5XX_CONFIRMED = false
AUTH_REQUEST_TIMEOUT = false
AUTH_ERROR_MISCLASSIFIED = false
AUTH_RATE_LIMIT_SUSPECTED = false
AUTH_RATE_LIMIT_CONFIRMED = false
```

El browser trace no observa el hop interno desde la Server Action hacia
Supabase, pero sí demuestra que el POST visible no terminó en 429/5xx, que el
redirect se completó y que el shell autenticado quedó renderizado. Las mismas
credenciales además pasaron en otros tests del run.

Dos traces registraron `ERR_CONNECTION_RESET` desde la página de login sobre un
recurso auxiliar de feedback del Preview. No afectó el POST de login. No hubo
page exceptions registradas.

### Evidencia de navegación de listings

En los dos fallos directos de navegación:

```text
login completed = true
navigation started = true
response received = true
HTTP status = 200
DOMContentLoaded/load completion within test budget = false
target UI eventually rendered in failed run = false
classification = PREVIEW_COLD_START_OR_LATENCY
```

La navegación a solicitudes recibió HTTP 200 en aproximadamente 4.7 s, pero
`page.goto` permaneció pendiente hasta el timeout de 30 s. La navegación a
usuarios recibió HTTP 200 en aproximadamente 0.4 s, pero comenzó cuando el caso
ya había consumido la mayor parte de su presupuesto global y quedó pendiente al
terminar el test. No se observó respuesta 5xx ni fallo de assertion del UI
target; las expectations posteriores no llegaron a ejecutarse.

Varios traces terminaron con assets o fetches pendientes/cancelados, y dos
registraron connection reset del recurso auxiliar de feedback. La evidencia es
compatible con latencia/transporte transitorio del Preview y consumo acumulado
del presupuesto de los tests, no con un error determinista de Auth, servidor o
contrato funcional.

### Reproducción focal mínima

Como los artifacts no distinguían por sí solos un fallo persistente de un
factor de carga/acumulación, se ejecutó una única reproducción focal contra el
mismo Preview y SHA, con Chromium y un worker. Se seleccionaron solamente:

- el test de badges/conteos que había fallado tras login;
- el test responsive de solicitudes cuyo `page.goto` había expirado.

El primer intento de preparar el comando falló localmente por quoting antes de
compilar el script de bootstrap; no inició browser ni realizó requests al
Preview. La reproducción browser efectiva fue una sola.

```text
focal tests selected = 2
focal passed = 2
focal failed = 0
focal skipped = 0
duration = 32.2s
login-failing test ISOLATED_PASS = true
listing-navigation test ISOLATED_PASS = true
```

No se ejecutó nuevamente la suite completa, no se cambió código y no se
añadieron retries, waits, `networkidle`, clicks adicionales o timeouts.

### Diagnóstico y recomendación

```text
most likely root cause = transient Preview delivery/navigation latency under accumulated suite load
confidence = medium
confidence that this is not Auth rate limiting = high
confidence that this is not hydration regression = high
```

El siguiente cambio recomendado no es funcional ni de Supabase: Dirección
Técnica debería autorizar un hardening del orchestration de QA que ejecute la
allowlist en lotes seriales acotados o procesos Playwright frescos y agregue sus
resultados, conservando Chromium, `workers=1`, assertions, exclusiones y
ausencia de retries. Antes de implementarlo conviene definir el batch boundary
y mantener conteos globales fail-closed. No se recomienda cambiar credenciales,
rate limits, hydration hardening ni aumentar timeouts como primera medida.

### Estado

```text
PPO-04M.4B.1 = ACTIVE / FAILURE DIAGNOSIS
PREVIEW READ_ONLY QA = NOT ACCEPTED
PRODUCTION UPDATE = NOT EXECUTED
PRODUCTION RUNTIME = 313b2076258c6d7a8c7bd9c1bf205213174a91ec / UNCHANGED
PRODUCTION REQUESTS DURING DIAGNOSIS = 0
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

No se modificaron aplicación, tests, runner, Supabase, Vercel, Deployment
Protection o configuración remota.

## 24. PPO-04M.4B.1 — Batched read-only harness

### Decisión de diseño

El diagnóstico anterior se conserva: los cinco timeouts del run completo son
compatibles con latencia transitoria y presupuesto acumulado del Preview, y los
dos casos focales pasaron de forma aislada. No se confirmó regresión de
hidratación, rate limiting de Auth, respuesta 5xx ni timeout de la solicitud de
Auth.

El runner Managed read-only quedó dividido en cinco procesos Playwright frescos,
secuenciales y con `workers=1`:

1. `foundation` (2 specs): `managed-health.spec.ts`, `smoke.spec.ts`;
2. `dashboard` (1 spec): `dashboard.spec.ts`;
3. `shell` (1 spec): `dashboard-shell.spec.ts`;
4. `listings` (1 spec): `internal-listings.spec.ts`;
5. `remaining-readonly` (3 specs): `public-tracking.spec.ts`,
   `storage.spec.ts`, `usuarios.spec.ts`.

La allowlist original continúa siendo la autoridad total. Antes de cualquier
request remoto, el runner comprueba que la unión de los lotes contiene
exactamente sus ocho specs, sin duplicados, faltantes ni extras. Cada lote
conserva Chromium, el mismo filtro de exclusiones, el mismo target, child
environment sanitizado y storage state; no añade retries, argumentos externos
ni cambios de timeout.

Cada lote inicia un child process independiente y escribe artifacts en
`test-results/managed-readonly/<batch>`. Un fallo funcional no impide ejecutar
los lotes restantes y el exit code agregado sólo es cero si los cinco lotes
terminan en cero. Un fallo de infraestructura detiene inmediatamente la
secuencia. El forwarding de señales se instala sólo para el child activo y se
limpia al finalizar, evitando listeners duplicados y procesos huérfanos. El
parent limita su salida operativa al inicio y salida de cada lote y al resumen
agregado.

La variable de bypass de Deployment Protection permanece únicamente en el
bootstrap same-origin y nunca forma parte del child environment.

### Validación local

```text
managed harness unit tests = PASS (19 passed, 0 failed, 0 skipped)
lint = PASS (0 errors; 13 pre-existing warnings)
git diff --check = PASS
npm run diff:check = PASS
npm run audit:security = PASS (0 blocking violations)
build = NOT RUN / NOT REQUIRED
Preview requests = 0
Production requests = 0
```

No se ejecutó Playwright contra Preview o Production, no se modificó
configuración remota y no hubo promoción, redeploy ni cambio del runtime de
Production.

### Estado

```text
PPO-04M.4B.1 = ACTIVE / BATCHED READ_ONLY HARNESS IMPLEMENTED / PENDING REVIEW
PREVIEW RE-RUN = NOT EXECUTED
PRODUCTION RUNTIME = 313b2076258c6d7a8c7bd9c1bf205213174a91ec / UNCHANGED
PRODUCTION REQUESTS DURING IMPLEMENTATION = 0
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

## 25. PPO-04M.4B.1 — Batched Preview read-only QA

### Autoridad y preflight

```text
branch = ops/managed-free-production-pilot
HEAD = 01552f8bee59b5f9982a2d722e39795461918f43
initial worktree clean = true

Preview environment = preview
Preview status = READY
source branch exact = true
source SHA exact = true
deployment is Production = false
exact matching Preview deployments = 1
```

La resolución se hizo por metadata Git del deployment, no mediante un branch
alias. `vercel inspect` requirió reutilizar el scope del proyecto enlazado y
confirmó el deployment READY sin cambiar configuración. No se registraron URL,
deployment ID, project ref, cookie, token ni bypass secret.

Deployment Protection permaneció sin cambios:

```text
Vercel Authentication = All Deployments
Preview protected = true
configured bypass present = true
local VERCEL_AUTOMATION_BYPASS_SECRET present = true
```

Los dos archivos Managed estaban presentes e ignorados. El contrato QA contenía
exactamente los seis nombres `GODEL_TEST_*` requeridos, con cero nombres
faltantes, inesperados o duplicados. Sólo se comprobó presencia; no se
registraron valores.

El nombre histórico del target se conservó:

```text
runner variable name = GODEL_MANAGED_PRODUCTION_BASE_URL
actual run target = PREVIEW
```

El gate local previo pasó con 19 tests, cero fallos y cero skips.

### Runtime smoke protegido

El bootstrap devolvió 307, su redirect fue same-origin y produjo la cookie de
infraestructura. El bypass sólo se envió en ese bootstrap; los probes
posteriores usaron la cookie y validaron manualmente cualquier redirect como
same-origin.

```text
GET /api/health/live  = HTTP 200 / status ok
GET /api/health/ready = HTTP 200 / status ready
GET /login            = HTTP 200
GET /                  = HTTP 200
```

### Cinco procesos Playwright

Se ejecutó una sola vez, sin argumentos, `npm run
test:e2e:managed:readonly`. No hubo ejecución manual de specs, rerun, retry,
cambio de timeout ni aumento de paralelismo.

| Orden | Batch | Seleccionados/ejecutados | Passed | Failed | Runtime skipped | Did not run | Exit |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `foundation` | 8 | 8 | 0 | 0 | 0 | 0 |
| 2 | `dashboard` | 10 | 10 | 0 | 0 | 0 | 0 |
| 3 | `shell` | 3 | 3 | 0 | 0 | 0 | 0 |
| 4 | `listings` | 14 | 14 | 0 | 0 | 0 | 0 |
| 5 | `remaining-readonly` | 9 | 9 | 0 | 0 | 0 | 0 |

```text
batches_total = 5
batches_passed = 5
batches_failed = 0
overall = PASS

selected/executed = 44
passed = 44
failed = 0
runtime skipped = 0
did not run = 0
```

Cada output directory contiene su propio `.last-run.json` con estado `passed`
y cero failed tests. Sus escrituras ocurrieron en el orden de los cinco batches,
confirmando la secuencia de procesos frescos. Las cinco exclusiones por
`grep-invert` no entraron en la selección y no son runtime skips: una pertenece
a `shell`, dos a `storage` y dos a `usuarios`.

El recolector sanitizado del comando conservó el agregado `5/5 PASS`, pero usó
inicialmente un prefijo incorrecto al extraer las líneas por batch y no retuvo
esas líneas del temporal. No se hizo rerun. El desglose se reconcilió con los
cinco `.last-run.json`, el orden de escritura, la allowlist fija y el inventario
estático 8 + 10 + 3 + 14 + 9 = 44. Los únicos `test.skip` dinámicos relevantes
al inventario seleccionado quedan desactivados por el modo Managed; los demás
pertenecen a casos excluidos por `grep-invert`.

### Gates funcionales focales

El batch `shell` pasó el test que exige control habilitado antes del click,
click único, transición de cookie, reducción/aumento de ancho y transición
accesible de `aria-expanded`. No usa `waitForTimeout`, `networkidle`, segundo
click, `force` ni `dispatchEvent`. El guard de hidratación vigente usa una
microtask, no un delay temporal.

```text
collapse control enabled before click = PASS
single click = PASS
cookie transition = PASS
width transition = PASS
accessible toggle transition = PASS
temporary hydration delay present = false
```

Las lecturas RLS posteriores confirmaron que ambos conteos Managed seguían en
cero. El test `dashboard`, que pasó, abrió los dos workspace actions y ejecutó
las assertions de empty state:

```text
Solicitudes count = 0
Solicitudes button enabled = PASS
Solicitudes dialog opens = PASS
Sin solicitudes pendientes = PASS

Entregas count = 0
Entregas button enabled = PASS
Entregas dialog opens = PASS
Sin pedidos listos = PASS
```

No se crearon datos para forzar esos estados.

El batch `listings` pasó sus 14 casos y ningún batch reprodujo los timeouts del
run monolítico:

```text
POST_LOGIN_NAVIGATION_TIMEOUT = not reproduced
LISTING_NAVIGATION_TIMEOUT = not reproduced
ACCUMULATED_SINGLE_PROCESS_FACTOR = SUPPORTED BY BATCHED PASS
```

La última clasificación es apoyo operacional compatible con la evidencia, no
una demostración de causalidad absoluta.

### Artifacts, residuos y logs

Los artifacts nuevos quedaron aislados bajo:

```text
test-results/managed-readonly/foundation
test-results/managed-readonly/dashboard
test-results/managed-readonly/shell
test-results/managed-readonly/listings
test-results/managed-readonly/remaining-readonly
```

Cada directorio contiene únicamente su `.last-run.json`. El `.last-run.json`
en la raíz de `test-results` preexistía desde el run monolítico anterior y no
fue escrito por esta ejecución batched. No se subieron artifacts ni se
exportaron cookies, tokens o headers.

```text
fixtures created = 0 observed
business mutations = 0 observed
uploads = 0 observed
Auth users created = 0 observed
privileged DB access = false
```

Los conteos de empty state usaron autenticación QA normal y lecturas RLS. Un
primer intento auxiliar no pudo interpretar localmente `Content-Range`; no
alteró datos. El segundo obtuvo los conteos y cerró su sesión. No se usó cliente
administrativo, acceso DB privilegiado ni credencial server-only.

Vercel runtime logs estuvieron disponibles con el scope read-only existente:

```text
records inspected = 100
5xx = 0
error/fatal = 0
unhandled runtime exception = 0
Auth bootstrap failures = 0
```

### Comparación y estado

El run monolítico anterior terminó con 39 passed y 5 failed por timeouts; la
misma allowlist, assertions, Chromium y `workers=1`, distribuida en cinco
procesos frescos, terminó 44/44. No se modificó aplicación, Supabase, Vercel,
Deployment Protection ni configuración remota durante este pase.

```text
HYDRATION FIX PREVIEW = PASS
BATCHED READ_ONLY PREVIEW QA = PASS

PPO-04M.4B.1 = ACTIVE / PREVIEW VALIDATED / PRODUCTION UPDATE PENDING

PRODUCTION RUNTIME = 313b2076258c6d7a8c7bd9c1bf205213174a91ec / UNCHANGED
PRODUCTION UPDATE = NOT EXECUTED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

## 26. PPO-04M.4B.1 — Promoted Production read-only QA

### Promotion authority y Production actual

Dirección Técnica promovió manualmente el Preview previamente validado. Codex
no ejecutó promoción, redeploy ni cambio Git. Vercel realizó un rebuild
Production independiente, por lo que este deployment fue validado de nuevo y
no se reutilizó la aceptación del Preview.

```text
branch = ops/managed-free-production-pilot
Git HEAD = 01552f8bee59b5f9982a2d722e39795461918f43

environment/target = production
deployment status = READY
source branch exact = true
source SHA exact = true
current Production = true
previous Production SHA is current = false
stable Production origin points to current deployment = true
```

El control plane presentó un único Production READY con la rama y SHA
autorizadas. El target actual del proyecto, el resultado de `vercel inspect` y
la asignación del alias estable coincidieron. No se registraron URL,
deployment ID, project ref u otros identificadores sensibles.

### Build, environment y protección

```text
build status = PASS
framework = Next.js
deployment status = READY

Production environment entries = 3
NEXT_PUBLIC_SUPABASE_URL = present
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = present
SUPABASE_SECRET_KEY = present
SUPABASE_SERVER_URL = absent
SUPABASE_SERVICE_ROLE_KEY = absent

Vercel Authentication = All Deployments
new Production protected = true
VERCEL_AUTOMATION_BYPASS_SECRET = present
```

La comprobación de environment se limitó a nombres y scope Production. No se
leyeron valores ni se modificaron variables. Una solicitud sin bypass al
dominio estable recibió un redirect cross-origin hacia infraestructura Auth de
Vercel, confirmando la protección del nuevo Production.

### Runtime smoke

El bootstrap protegido devolvió 307, validó el redirect same-origin y produjo
la cookie de infraestructura. El bypass sólo se envió en ese bootstrap; los
probes posteriores usaron la cookie con redirects manuales same-origin.

```text
GET /api/health/live  = HTTP 200 / status ok
GET /api/health/ready = HTTP 200 / status ready
GET /login            = HTTP 200
GET /                  = HTTP 200

runner variable name = GODEL_MANAGED_PRODUCTION_BASE_URL
actual run target = PRODUCTION
```

El gate local del harness pasó con 19 tests, cero fallos y cero skips.

### Batched Production run

Se ejecutó una sola vez y sin argumentos `npm run
test:e2e:managed:readonly`. No hubo rerun, tests manuales, retries, cambio de
timeout ni modificación de código.

| Orden | Batch | Selected | Executed | Passed | Failed | Runtime skipped | Did not run | Exit |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `foundation` | 8 | 8 | 8 | 0 | 0 | 0 | 0 |
| 2 | `dashboard` | 10 | 3 | 2 | 1 | 0 | 7 | 1 |
| 3 | `shell` | 3 | 3 | 3 | 0 | 0 | 0 | 0 |
| 4 | `listings` | 14 | 14 | 9 | 5 | 0 | 0 | 1 |
| 5 | `remaining-readonly` | 9 | 9 | 8 | 1 | 0 | 0 | 1 |

```text
batches_total = 5
batches_passed = 2
batches_failed = 3
overall = FAIL

selected = 44
executed = 37
passed = 30
failed = 7
runtime skipped = 0
did not run = 7
```

Los cinco procesos frescos sí arrancaron y el runner continuó después de los
fallos funcionales, como exige su contrato. `foundation` y `shell` pasaron;
`dashboard`, `listings` y `remaining-readonly` no pasaron aceptación.

### Fallos originales

`dashboard` falló en `admin history panel follows the rolling activity window`.
La pantalla estaba completamente renderizada y el count de Historial era cero,
pero el botón permaneció deshabilitado mientras el test exigía que estuviera
habilitado. Al ser el tercer caso de un spec serial, siete casos posteriores no
se ejecutaron.

`listings` registró cinco fallos:

1. el contrato mobile/tablet agotó 30 s durante `page.goto`;
2. el contrato responsive de Solicitudes agotó el presupuesto alrededor de la
   assertion del empty state, aunque la captura final mostraba ese empty state
   renderizado;
3. el control de instancias DOM/IDs agotó el timeout global con una pantalla de
   Clientes ya renderizada;
4. el control de chips activos agotó 30 s durante `page.goto`;
5. el control de desplazamiento compacto del resultado agotó 30 s durante
   `page.goto`.

`remaining-readonly` falló en la validación de paginación/canonical URLs de
Usuarios: `page.goto` agotó 30 s y la captura terminó en el estado de carga
“Preparando vista”.

Los siete traces no observaron HTTP 5xx ni 429. Las capturas disponibles
mostraron shells autenticados; no se confirmó fallo de login. Cuatro screenshots
de fallo fueron inspeccionados localmente y no se copiaron al reporte.

### Gates focales

El batch `shell` pasó sus tres casos seleccionados:

```text
collapse control enabled before click = PASS
single click = PASS
cookie transition = PASS
width transition = PASS
accessible toggle transition = PASS
temporary delay present = false
```

El segundo caso de `dashboard` terminó antes del fallo de Historial y validó
los counts cero y sus diálogos:

```text
Solicitudes count = 0
Solicitudes button enabled = PASS
Solicitudes dialog = PASS
Sin solicitudes pendientes = PASS

Entregas count = 0
Entregas button enabled = PASS
Entregas dialog = PASS
Sin pedidos listos = PASS
```

```text
POST_LOGIN_NAVIGATION_TIMEOUT = not reproduced
LISTING_NAVIGATION_TIMEOUT = reproduced
```

No se aumentaron timeouts y no se hizo reproducción focal.

### Logs, artifacts y residuos

```text
Production log events reviewed = 500
HTTP 5xx count = 0
error/fatal count = 0
unhandled runtime exceptions = 0
Auth errors = 0
Supabase/runtime configuration errors = 0
```

Los artifacts quedaron bajo los cinco directorios
`test-results/managed-readonly/<batch>`. Los tres batches fallidos conservaron
sus traces, videos, error contexts y screenshots según correspondía. No se
subieron artifacts ni se exportaron cookies, headers, tokens o request bodies.

```text
fixtures created = 0 observed
business mutations = 0 observed
uploads = 0 observed
Auth users created = 0 observed
privileged DB access = false
```

### Estado

El nuevo Production tiene autoridad, build, environment, protección y smoke
correctos, pero el gate funcional read-only no queda aceptado por siete fallos.
No se inicia diseño/ejecución mutante ni rollout.

```text
PRODUCTION SOURCE SHA = 01552f8bee59b5f9982a2d722e39795461918f43
PRODUCTION READ_ONLY QA = NOT ACCEPTED

PPO-04M.4B.1 = ACTIVE / PRODUCTION READ_ONLY QA FAILED
PPO-04M.4B = ACTIVE / READ_ONLY FAILURE DIAGNOSIS REQUIRED

PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

## 27. PPO-04M.4B.1 — Managed remote QA timing adaptation

### Diagnóstico confirmado

La revisión estática posterior al run Production fallido confirmó que el count
cero de Historial no deshabilita su acción en `DashboardWorkspace`. El
`disabled` nativo observado provenía exclusivamente del gate transitorio
`!isInteractiveReady` durante la hidratación. El helper `openWorkspaceAction()`
mantiene una comprobación ordinaria `toBeEnabled()` antes del click; no se
detectó un defecto del contrato funcional de Historial ni se relajó esa
assertion.

El fallo ocurrió dentro del presupuesto remoto disponible antes de que la
acción terminara su readiness interactivo. Además, el spec Dashboard estaba en
modo `serial`: el primer fallo impidió ejecutar siete casos posteriores, aunque
no existieran skips de runtime.

Los defaults vigentes eran 30 s por test y 5 s por assertion. El presupuesto
del test incluye `beforeEach`, login, cuerpo del caso, navegaciones y
assertions. Esto afecta especialmente a los contratos de listings que agrupan
varias navegaciones; un caso recorre cinco rutas en dos viewports, para diez
navegaciones completas dentro de un único timeout de test.

```text
history count 0 disables product action = false
observed disabled source = pre-interactive hydration readiness
history functional contract bug = false
managed remote readiness budget implicated = true

dashboard mode before = serial
dashboard mode after = default
dashboard did not run caused by serial failure = 7
```

### Adaptación implementada

Se introdujo únicamente una política condicional en `playwright.config.ts`:

| Ejecución | Test timeout | Expect timeout | Workers | Retries |
| --- | ---: | ---: | ---: | ---: |
| Managed Production QA | 90 s | 15 s | 1 | 0 |
| Local / self-hosted | 30 s | 5 s | default existente | 0 |

El spec Dashboard pasó explícitamente de modo `serial` a `default`. El runner,
su inventario de batches, los specs de listings y Usuarios, y la semántica de
`page.goto` permanecen sin cambios. No se añadieron `actionTimeout`,
`navigationTimeout`, `globalTimeout`, retries, esperas temporales, `networkidle`,
segundos clicks, `force`, `dispatchEvent` ni reintentos manuales.

### Validación local

```text
managed config evaluation = timeout 90000 / expect 15000 / workers 1
normal config evaluation = timeout 30000 / expect 5000
managed retries = 0
action/navigation/global timeout overrides = absent

npm run test:e2e:managed:harness:test = PASS / 19 passed / 0 failed
npm run lint = PASS / 0 errors / 13 pre-existing out-of-scope warnings
npm run verify = PASS / lint + Next.js build
npm run audit:security = PASS / 0 blocking violations
git diff --check = PASS
npm run diff:check = PASS
```

Este pase no inició navegador, servidor ni ejecución E2E. Se realizaron cero
solicitudes a Production y cero solicitudes a Preview. No se modificaron
aplicación, configuración remota, Supabase, Vercel, Deployment Protection ni el
runtime desplegado.

```text
branch = ops/managed-free-production-pilot
Git HEAD = 01552f8bee59b5f9982a2d722e39795461918f43

PPO-04M.4B.1 = ACTIVE / MANAGED REMOTE QA TIMING ADAPTATION IMPLEMENTED / PENDING REVIEW
PRODUCTION READ_ONLY QA = NOT ACCEPTED
PRODUCTION RUNTIME = 01552f8bee59b5f9982a2d722e39795461918f43 / UNCHANGED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

## 28. PPO-04M.4B.1 — Final Production read-only QA rerun preflight

### Autoridades separadas

El harness QA y el runtime Production tienen autoridades distintas e
intencionales. La adaptación de Playwright no requiere promoción ni redeploy.

```text
branch = ops/managed-free-production-pilot
QA harness Git authority = 6da0bac5e945f18f8eec38b7ff15750f72b1d493
worktree at preflight = clean

Production runtime authority = 01552f8bee59b5f9982a2d722e39795461918f43
Production target = production
Production status = READY
source SHA exact = true
source branch exact = true
stable Production origin points to current Production = true
```

### Protection y environment

La consulta read-only del proyecto confirmó `ssoProtection.deploymentType =
all`. Un GET sin bypass recibió HTTP 302 hacia un origen distinto de
autenticación, por lo que el Production continúa protegido. El bypass requerido
estaba presente localmente; no se leyó ni registró su valor.

```text
Vercel Authentication = All Deployments
Production protected = true
VERCEL_AUTOMATION_BYPASS_SECRET = present

NEXT_PUBLIC_SUPABASE_URL = present / Production
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = present / Production
SUPABASE_SECRET_KEY = present / Production
SUPABASE_SERVER_URL = absent / Production
SUPABASE_SERVICE_ROLE_KEY = absent / Production
```

Las verificaciones se limitaron a nombres, scope, estado y conteos. No se
registraron valores, URLs completas, deployment IDs, project refs, headers,
cookies, tokens, request bodies ni PII.

### Contrato local y harness gate

```text
managed test timeout = 90000
managed expect timeout = 15000
managed workers = 1
normal test timeout = 30000
normal expect timeout = 5000
retries = 0
actionTimeout override = absent
navigationTimeout override = absent
globalTimeout override = absent
dashboard mode = default

npm run test:e2e:managed:harness:test = PASS
tests = 19
passed = 19
failed = 0
skipped = 0
```

### Runtime smoke blocker

Se intentó una sola vez el bootstrap protegido mediante el helper fail-closed
del runner. La solicitud no produjo un storage state válido y el helper terminó
con `Deployment Protection bootstrap failed`. El fallo ocurrió antes de los
cuatro probes de smoke, por lo que no se ejecutaron requests a
`/api/health/live`, `/api/health/ready`, `/login` ni al root autenticado.

Conforme al stop condition, no se repitió el bootstrap, no se ejecutó Playwright
manual y no se inició `npm run test:e2e:managed:readonly`.

```text
protected bootstrap attempts = 1
protected bootstrap = FAIL
PRODUCTION_RUNTIME_SMOKE_FAILED

foundation = NOT EXECUTED
dashboard = NOT EXECUTED
shell = NOT EXECUTED
listings = NOT EXECUTED
remaining-readonly = NOT EXECUTED

batched runner executions = 0
manual Playwright executions = 0
reruns = 0
Production/Preview configuration changes = 0
```

No hubo sesión de aplicación, rol autenticado, viewport, screenshot, trace o
video en este pase. El único acceso de runtime fue el GET de bootstrap de
infraestructura. No se enviaron credenciales de usuario ni se usaron
privilegios de base de datos.

```text
fixtures created = 0 observed
business mutations = 0 observed
uploads = 0 observed
Auth users created = 0 observed
privileged DB access = false
```

No se revisó una ventana de logs de E2E porque el run batched no comenzó. La
aceptación read-only permanece pendiente; no se inicia QA mutante ni rollout.

```text
git diff --check = PASS
npm run diff:check = PASS
npm run audit:security = PASS / 0 blocking violations
tracked modification = PPO_04M4_MANAGED_PRODUCTION_QA_REPORT.md only
```

```text
PRODUCTION READ_ONLY QA = NOT ACCEPTED

PPO-04M.4B.1 = ACTIVE / FINAL PRODUCTION READ_ONLY QA RERUN BLOCKED
PPO-04M.4B = ACTIVE / PROTECTED BOOTSTRAP REVIEW REQUIRED

PRODUCTION RUNTIME = 01552f8bee59b5f9982a2d722e39795461918f43 / UNCHANGED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

## 29. PPO-04M.4B.1 — Protected bootstrap diagnosis

### Preflight

La autoridad Git, la autoridad del runtime y Deployment Protection fueron
revalidadas antes de acceder al runtime. El fallo anterior ocurrió durante el
bootstrap de infraestructura y antes de cualquier ejecución Playwright E2E.

```text
branch = ops/managed-free-production-pilot
Git HEAD = 6da0bac5e945f18f8eec38b7ff15750f72b1d493
Production runtime SHA = 01552f8bee59b5f9982a2d722e39795461918f43

Production READY = true
Production source SHA exact = true
stable Production origin current = true
Vercel Authentication = All Deployments
GODEL_MANAGED_PRODUCTION_BASE_URL = present
VERCEL_AUTOMATION_BYPASS_SECRET = present

bootstrap failure occurred before Playwright test execution = true
```

### Probe A — bypass directo sin cookie

Se creó un `APIRequestContext` limpio y se realizó un único GET read-only a
`/api/health/live`, con bypass directo, redirects desactivados y sin solicitar
cookie. No se inspeccionó ni registró el body.

```text
PROBE_A_STATUS = 200
PROBE_A_STATUS_CLASS = 2xx
PROBE_A_LOCATION_PRESENT = false
PROBE_A_SET_COOKIE_PRESENT = false

AUTOMATION_BYPASS_SECRET_VALID = true
```

### Probe B — establecimiento de cookie

Tras el PASS de Probe A, se creó un segundo `APIRequestContext` limpio y se
realizó el segundo y último GET permitido al root, solicitando la cookie de
infraestructura. El redirect fue permitido y same-origin. La cookie observada
cumplió `Secure = true`, `path = /` y dominio aplicable al hostname Production.

```text
PROBE_B_EXECUTED = true
PROBE_B_STATUS = 307
PROBE_B_STATUS_CLASS = 3xx
PROBE_B_REDIRECT_STATUS_ALLOWED = true
PROBE_B_LOCATION_PRESENT = true
PROBE_B_LOCATION_SAME_ORIGIN = true
PROBE_B_APPLICABLE_INFRASTRUCTURE_COOKIE_COUNT = 1
PROBE_B_APPLICABLE_COOKIE_CONTRACT_VALID = true
```

No se registraron Location, Set-Cookie, host/origin, headers completos, cookies,
secretos ni identificadores de bypass.

### Clasificación

```text
BYPASS_BOOTSTRAP_HEALTHY

bypass entry metadata review executed = false
local secret likely stale = false
Production requests performed = 2
browser executions = 0
Playwright E2E executions = 0
business mutations = 0
```

La evidencia actual demuestra que el bypass directo y el establecimiento de
cookie funcionan con el contrato vigente. El fallo anterior queda clasificado
como transitorio o externo al contrato persistente; no se ejecutó
automáticamente el runner de 44 tests y la aceptación read-only continúa
pendiente de una nueva autorización de Dirección Técnica.

No se abrió Chromium, no hubo rol autenticado, viewport, screenshot, trace o
video. No se modificaron Production, Vercel, Supabase ni el runtime desplegado.

```text
PPO-04M.4B.1 = ACTIVE / BYPASS_BOOTSTRAP_HEALTHY / RERUN AUTHORIZATION REQUIRED
PRODUCTION READ_ONLY QA = NOT ACCEPTED
PRODUCTION RUNTIME = 01552f8bee59b5f9982a2d722e39795461918f43 / UNCHANGED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

## 30. PPO-04M.4B.1 — Final Production read-only QA rerun

### Autoridad y gates previos

Dirección Técnica autorizó exactamente un rerun después del diagnóstico sano.
El fallo de bootstrap anterior queda clasificado como `TRANSIENT DEPLOYMENT
PROTECTION BOOTSTRAP FAILURE`, sin causa puntual determinada. Probe A y Probe B
permanecen como evidencia diagnóstica sana y no fueron repetidos.

```text
branch = ops/managed-free-production-pilot
QA Git authority = 6da0bac5e945f18f8eec38b7ff15750f72b1d493
Production runtime authority = 01552f8bee59b5f9982a2d722e39795461918f43

Production target = production
Production status = READY
Production source SHA exact = true
stable Production origin current = true
Vercel Authentication = All Deployments
Production protected = true
VERCEL_AUTOMATION_BYPASS_SECRET = present

managed test timeout = 90000
managed expect timeout = 15000
managed workers = 1
retries = 0
actionTimeout override = absent
navigationTimeout override = absent
globalTimeout override = absent
dashboard mode = default

harness tests = 19
harness passed = 19
harness failed = 0
harness skipped = 0
```

### Bootstrap real y ejecución única

Se ejecutó una sola vez y sin argumentos `npm run
test:e2e:managed:readonly`. El bootstrap real de Deployment Protection produjo
el storage state esperado y el batch `foundation` comenzó normalmente. No hubo
rerun, Playwright manual, test focal, segundo intento ni cambio de timeout.

```text
authorized rerun executions = 1
actual runner bootstrap = PASS
BOOTSTRAP_FAILURE_RECURRENT = false
```

| Orden | Batch | Selected | Executed | Passed | Failed | Runtime skipped | Did not run | Exit |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `foundation` | 8 | 8 | 8 | 0 | 0 | 0 | 0 |
| 2 | `dashboard` | 10 | 10 | 10 | 0 | 0 | 0 | 0 |
| 3 | `shell` | 3 | 3 | 3 | 0 | 0 | 0 | 0 |
| 4 | `listings` | 14 | 14 | 14 | 0 | 0 | 0 | 0 |
| 5 | `remaining-readonly` | 9 | 9 | 9 | 0 | 0 | 0 | 0 |

```text
batches_total = 5
batches_passed = 5
batches_failed = 0
overall = PASS

selected = 44
executed = 44
passed = 44
failed = 0
runtime skipped = 0
did not run = 0
```

### Dashboard, hidratación y estados cero

El spec Dashboard ejecutó sus diez casos. Historial completó con el conteo
visible esperado de cero, la acción terminó habilitada dentro del presupuesto
Managed, recibió un único click y abrió el diálogo correspondiente. El modo
`default` evitó ocultar cualquiera de los siete tests posteriores.

```text
dashboard selected = 10
dashboard executed = 10

history button eventually enabled = PASS
history single click = PASS
history dialog opens = PASS
history visible activity items = 0

Solicitudes count = 0
Solicitudes button enabled = PASS
Solicitudes dialog opens = PASS
Sin solicitudes pendientes = PASS

Entregas count = 0
Entregas button enabled = PASS
Entregas dialog opens = PASS
Sin pedidos listos = PASS
```

El caso principal de shell pasó todas sus assertions con clicks únicos y sin
espera artificial.

```text
collapse control enabled = PASS
single click = PASS
cookie transition = PASS
width transition = PASS
aria-expanded transition = PASS
temporary hydration delay = false
```

### Timing remoto

Los catorce casos de listings y los nueve del batch restante completaron. El
contrato de listings que recorre cinco rutas en dos viewports terminó en 28.7 s
y el caso de paginación/canonical URLs de Usuarios terminó en 20.8 s.

```text
LISTING_NAVIGATION_TIMEOUT = not reproduced
USUARIOS_NAVIGATION_TIMEOUT = not reproduced
MANAGED_REMOTE_TIMING_CONTRACT = SUPPORTED
```

Este resultado demuestra cumplimiento dentro del presupuesto QA del runtime
remoto protegido; no caracteriza Production como un sistema de baja latencia.

### Logs y residuos

Se revisaron sanitizadamente hasta 1000 eventos de la ventana Production del
run, sin registrar mensajes completos, URLs, headers, cookies, tokens, request
bodies ni PII.

```text
Production log events reviewed = 1000
HTTP 5xx count = 0
error/fatal count = 0
unhandled runtime exceptions = 0
Auth errors = 0
Supabase/runtime configuration errors = 0

fixtures created = 0 observed
business mutations = 0 observed
uploads = 0 observed
Auth users created = 0 observed
privileged DB access = false
```

### Cobertura del pase

El runner utilizó Playwright Chromium en cinco procesos frescos y secuenciales,
con los roles `admin`, `supervisor` y `trabajador`. Cubrió health, login, rutas
públicas, dashboard, shell desktop/mobile, listings responsive, Storage
read-only y restricciones de Usuarios. Al pasar todos los casos no se generaron
screenshots, traces ni videos de fallo para inspección.

No se modificaron producto, tests, runner, Supabase, Vercel, Deployment
Protection ni el runtime desplegado.

```text
PRODUCTION READ_ONLY QA = PASS

PPO-04M.4B.1 = READ_ONLY QA PASS
PPO-04M.4B = ACTIVE / MUTATING QA DESIGN NEXT

PRODUCTION RUNTIME = 01552f8bee59b5f9982a2d722e39795461918f43 / UNCHANGED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

## 31. PPO-04M.4B.3.1 — First managed solicitud mutation

### Autoridad y preflight

Dirección Técnica autorizó exactamente una ejecución del runner mutante. El
tooling QA no fue desplegado; el runtime Production permaneció sin cambios.

```text
branch = ops/managed-free-production-pilot
Git QA authority = 10e7d0d061cd475ef7525c6b6a820fb266dba114
Production runtime authority = 01552f8bee59b5f9982a2d722e39795461918f43

Production target = production
Production status = READY
Production source SHA exact = true
stable Production origin current = true
Vercel Authentication = All Deployments
initial worktree clean = true

.env.managed.local = present
.env.managed.qa.local = present
GODEL_MANAGED_PRODUCTION_BASE_URL = present
VERCEL_AUTOMATION_BYPASS_SECRET = present
persisted mutating confirmation = false

pre-run clean manifests = 0
pre-run pending manifests = 0
pre-run invalid manifests = 0
residue gate = PASS
```

Los harness locales pasaron antes de autorizar el proceso remoto:

```text
manifest harness = PASS / 14 passed / 0 failed / 0 skipped
mutating runner harness = PASS / 23 passed / 0 failed / 0 skipped
read-only harness = PASS / 19 passed / 0 failed / 0 skipped
```

### Ejecución única

La confirmación destructiva exacta existió sólo durante la invocación y fue
retirada inmediatamente al terminar. Se ejecutó una única vez `npm run
test:e2e:managed:mutating`; no hubo rerun, retry, recovery, Playwright manual ni
probes manuales adicionales.

```text
confirmation gate = PASS
Deployment Protection bootstrap = PASS
manifest created = true
runId generated = true / value not reported
planned persisted before browser = true

Playwright started = true
browser = Chromium
route = /solicitud
viewport = Desktop Chrome project default
tests = 1
passed = 1
failed = 0
skipped = 0
Playwright exit = 0

functional test = PASS
success UI = PASS
public reference observed = true / value not reported
```

El browser operó de forma anónima sobre el formulario público. La sesión QA
admin real se utilizó únicamente en el adaptador Supabase de cleanup, mediante
publishable key y RLS existente. No se capturaron screenshots porque el test no
falló; no se registraron credenciales, URL Production, runId, teléfono, email,
referencia pública, tokens ni request bodies.

### Cleanup y residuos

El estado final limpio con `remoteId` y referencia capturados demuestra que el
discovery encontró exactamente una fila y recorrió el camino
`planned → created → cleanup_pending → clean`. El exit global cero exige que
tanto la prueba funcional como el cleanup hayan pasado.

```text
ownership rows discovered = 1
contract validation = PASS
workflow_type = encargo
cliente_id = null
converted_order_id = null
remoteId captured = true
publicReference captured = true
manifest created state persisted = true
cleanup_pending persisted = true

pre-delete exact fetch = PASS
ownership verification = OWNERSHIP_VERIFIED
bounded DELETE attempted = true
bounded DELETE result = PASS
post-delete id absent = true
post-delete marker rows = 0

resource state = clean
run state = clean
cleanup = PASS
final clean manifests = 1
final pending manifests = 0
final invalid manifests = 0
```

La comprobación post-run independiente repitió sólo las lecturas permitidas por
ID y marker exactos con el mismo usuario QA/RLS, y confirmó ausencia en ambos
casos. No se ejecutó un DELETE adicional, SQL, service role, secret key, reset
de base ni edición manual del manifest.

### Impacto y logs

```text
solicitud created transiently = 1
solicitud remaining after cleanup = 0
clientes created = 0
pedidos created = 0
pedido_contadores mutation = 0
Storage uploads = 0
Storage objects = 0
Auth users created = 0
service configuration changes = 0
```

Se revisó sanitizadamente la ventana Production correspondiente, sin imprimir
mensajes, URLs, IDs, referencias, headers, cookies, tokens, request bodies o
PII.

```text
Production log events reviewed = 10
HTTP 5xx count = 0
error/fatal count = 0
unhandled runtime exceptions = 0
Auth errors = 0
Supabase/runtime configuration errors = 0
```

### Estado

```text
FIRST PRODUCTION MUTATION = PASS
PRODUCTION MUTATING QA = FIRST AUTHORIZED RUN PASS

PPO-04M.4B.3.1 = CLOSED / FIRST PRODUCTION MUTATION PASS
accepted evidence commit = 128488f9e22f02d6aae75e2019c18f113d88406a

PRODUCTION RUNTIME = 01552f8bee59b5f9982a2d722e39795461918f43 / UNCHANGED
PRODUCTION PILOT ROLLOUT = NOT EXECUTED
```

## 32. PPO-04M.4B.3.2 — Managed template mutating flow

### Implementación local

Sobre la autoridad Git aceptada
`128488f9e22f02d6aae75e2019c18f113d88406a` se implementó un runner separado,
un adapter Supabase autenticado, un flow de fixture/cleanup/recovery y un único
spec Playwright dedicado. Los archivos de M.4B.3.1 quedaron congelados y no se
modificaron.

El setup exige la confirmación independiente de plantilla, pasa el residue gate
y el bootstrap de Deployment Protection, autentica al admin QA y persiste el
resource `trabajo_plantilla` como `planned` antes del INSERT. La plantilla se
crea directamente con publishable key, RLS Production normal y
`is_active=false`; sólo después se persisten `remoteId` y estado `created` y se
habilita el browser.

El spec inicia sesión como admin, busca exclusivamente
`M4QA Template <runId>`, verifica el estado inactivo, cambia sólo la descripción
y crea dos tareas determinísticas, renombrando Task A. No visita pedidos, no
consulta el selector de plantillas para pedidos y no aplica la plantilla.

### Cleanup y recovery

El cleanup valida nombre e ID exactos, `is_active=false` y un conjunto cerrado
de títulos hijos antes del DELETE. Sólo después persiste `cleanup_pending` y
borra el padre con los filtros `id`, `name` e `is_active=false`. No borra tareas
directamente: verifica que el `ON DELETE CASCADE` existente deje cero hijos,
además de ausencia del padre por ID y del marcador por nombre.

El recovery sólo admite `trabajo_plantilla` en `planned`, `created` o
`cleanup_required`. Ambigüedad, ownership incorrecto, plantilla activa, hijo no
reconocible o residuo bloquean el run; un manifest `blocked` permanece terminal.
El child Playwright recibe las credenciales admin necesarias para el login real,
pero no recibe secret key, service role, bypass, confirmación ni credenciales
de supervisor o trabajador.

### Validación y límites del pase

El harness nuevo pasó localmente con 32 casos y fakes, sin HTTP real. La
validación cubrió gate de confirmación/residuos, orden `planned` antes de INSERT,
fixture inactivo, discovery 0/1/>1, ownership y estado, contrato de hijos,
DELETE acotado, residuos post-cascade, precedencia de fallos, recovery, scrub de
environment y argumentos Playwright fijos.

```text
manifest harness = PASS / 14 passed
solicitud runner harness = PASS / 23 passed
template runner harness = PASS / 32 passed
read-only harness = PASS / 19 passed
lint = PASS / 0 errors / 13 pre-existing warnings outside scope
build = PASS
git diff --check = PASS
npm run diff:check = PASS
npm run audit:security = PASS / 0 blocking violations
```

No se ejecutó el runner funcional ni el recovery contra Production. Tampoco se
abrió browser remoto ni se hicieron requests a Production, Preview o Supabase
remoto.

```text
PPO-04M.4B.3.1 = CLOSED / FIRST PRODUCTION MUTATION PASS
accepted evidence commit = 128488f9e22f02d6aae75e2019c18f113d88406a

PPO-04M.4B.3.2 = IMPLEMENTED / PENDING ARCHITECTURAL REVIEW
PRODUCTION TEMPLATE MUTATION = NOT AUTHORIZED
PRODUCTION MUTATING QA = SOLICITUD PASS / TEMPLATE NOT EXECUTED

Production requests = 0
Preview requests = 0
Supabase remote requests = 0
browser remote executions = 0
business mutations = 0
```

## 33. PPO-04M.4B.3.2 — First Production template mutation

### Autoridad y preflight

Dirección Técnica autorizó exactamente una ejecución del runner de plantilla.
El tooling QA no fue desplegado y el runtime Production permaneció sin cambios.

```text
branch = ops/managed-free-production-pilot
Git QA authority = 48e86f498b6d0b55b9f511cee6b3dbb7587e50d7
Production runtime authority = 01552f8bee59b5f9982a2d722e39795461918f43

Production target = production
Production status = READY
Production source SHA exact = true
stable Production origin current = true
Vercel Authentication = All Deployments
initial worktree clean = true

.env.managed.local = present
.env.managed.qa.local = present
GODEL_MANAGED_PRODUCTION_BASE_URL = present
VERCEL_AUTOMATION_BYPASS_SECRET = present
persisted template mutating confirmation = false

pre-run clean manifests = 1
pre-run pending manifests = 0
pre-run invalid manifests = 0
residue gate = PASS
```

Los cuatro harnesses locales pasaron antes de abrir la confirmación efímera:

```text
manifest harness = PASS / 14 passed / 0 failed / 0 skipped
solicitud runner harness = PASS / 23 passed / 0 failed / 0 skipped
template runner harness = PASS / 32 passed / 0 failed / 0 skipped
read-only harness = PASS / 19 passed / 0 failed / 0 skipped
```

### Única ejecución autorizada

La confirmación exacta existió sólo en el proceso del runner y fue retirada al
terminar. Se invocó exactamente una vez
`npm run test:e2e:managed:mutating:template`. No hubo rerun, retry, recovery,
Playwright manual ni DELETE manual.

```text
confirmation gate = PASS
residue gate = PASS
Deployment Protection bootstrap = PASS
admin adapter authentication = PASS

runId generated = true / value not reported
planned manifest persisted before INSERT = true
inactive template INSERT = PASS
template remoteId captured = true / value not reported
template is_active after setup = false
created manifest persisted before browser = true

Playwright started = true
browser = Chromium
tests = 1
passed = 0
failed = 1
skipped = 0
Playwright exit = 1
```

### Resultado browser

El login admin, la localización exacta de la plantilla y la comprobación visual
del estado inactivo pasaron. El botón de edición abrió el diálogo correcto, pero
el locator Playwright acotado al diálogo no encontró el campo accesible
`Nombre` dentro del timeout. La ejecución falló antes de editar la descripción o
crear tareas. La captura de fallo fue revisada localmente: el diálogo y sus
campos estaban visibles y el estado mostrado seguía siendo inactivo. No se
incluye la captura en este reporte porque contiene el marcador QA y un
identificador interno.

```text
admin login = PASS
exact QA template located = true
initial template status = inactive

description edit = NOT EXECUTED
template remained inactive = true
Task A created = false
Task B created = false
Task A edit = NOT EXECUTED

pedido visited = false
template applied to pedido = false
```

El servidor utilizado fue el origen Production externo protegido; no se inició
servidor local. El método fue Playwright Chromium con rol `admin` y viewport
Desktop Chrome por defecto. Las rutas cubiertas fueron login, listado filtrado
de plantillas y detalle de la plantilla QA. No hubo recorrido mobile en este
spec focal. Se generaron screenshot, video y trace locales de fallo; sólo la
captura fue inspeccionada. Las credenciales no se imprimieron ni persistieron.

### Cleanup y residuos

Aunque el browser falló, el runner continuó por su cleanup obligatorio. El
discovery encontró exactamente el padre esperado. El pre-delete revalidó ID,
nombre, estado inactivo y ownership. Como la prueba falló antes de crear tareas,
el conjunto hijo pre-delete estaba vacío: cumplía el conjunto cerrado QA, pero
no satisfacía el contrato funcional de dos tareas requerido para aceptar el
run.

El recurso pasó de `created` a `cleanup_pending` y fue persistido antes del
único DELETE del padre. El DELETE quedó acotado por ID, nombre exacto e
`is_active=false`. No se emitió DELETE directo de tareas. La verificación final
confirmó ausencia por ID, cero filas por nombre y cero tareas por `template_id`.

```text
exact template ownership rows = 1
template name exact = true
template id matches manifest = true
is_active before DELETE = false

child rows before DELETE = 0
child ownership = PASS / empty QA subset
expected final two children observed = false

pre-delete exact fetch = PASS
pre-delete ownership = OWNERSHIP_VERIFIED
bounded parent DELETE = PASS
post-delete template by ID = absent
post-delete template marker rows = 0
post-delete tasks by template ID = 0

resource state = clean
run state = clean
cleanup = PASS

final clean manifests = 2
final pending manifests = 0
final invalid manifests = 0
```

No se ejecutó recovery porque no quedó estado `active`, `cleanup_required` ni
`blocked`.

### Impacto y logs

```text
template created transiently = 1
template remaining = 0
template tasks created transiently = 0
template tasks remaining = 0
template ever active = false

pedidos created = 0
pedido_contadores mutation = 0
clientes created = 0
solicitudes created = 0
Storage uploads/objects = 0
Auth users created = 0
service configuration changes = 0
```

Se revisó sanitizadamente la ventana Production del run, sin registrar URLs,
IDs, runId, mensajes completos, PII, cookies, tokens, headers ni request bodies.

```text
Production log events reviewed = 27
HTTP 5xx count = 0
error/fatal count = 0
unhandled runtime exceptions = 0
Auth errors = 0
Supabase/runtime configuration errors = 0
```

### Estado

El contrato de aceptación exige Playwright PASS y dos hijos esperados. Ambos
faltaron, por lo que el resultado funcional no se acepta aunque el cleanup haya
quedado completamente demostrado. La autorización de ejecución única quedó
consumida y no se realizó un segundo intento.

```text
FIRST PRODUCTION TEMPLATE MUTATION = NOT ACCEPTED
PPO-04M.4B.3.2 = EXECUTED / NOT ACCEPTED / CLEANUP PASS / PENDING REVIEW

PRODUCTION MUTATING QA = SOLICITUD PASS / TEMPLATE NOT ACCEPTED
PRODUCTION TEMPLATE MUTATION AUTHORIZATION = CONSUMED
PRODUCTION RUNTIME = 01552f8bee59b5f9982a2d722e39795461918f43 / UNCHANGED

Git commit = NOT CREATED
Git push = NOT EXECUTED
Git amend/merge/rebase = NOT EXECUTED
```
