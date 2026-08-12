# SH-03.1 — Provisioning QA, Auth, session, roles y Auth Admin

## Estado

```text
SH-03.0 = CLOSED / APPROVED
SH-03.1 = IMPLEMENTED / BLOCKED BY FUNCTIONAL FINDINGS
SH-03 = ACTIVE
SH-03.2 = NOT STARTED
```

La implementación no modifica migraciones, tipos generados, Compose ni la
lógica de producto. La corrección focal confirmó dos hallazgos funcionales que
deben resolverse antes de revisión arquitectónica y antes de avanzar a SH-03.2.

## Correction pass — Auth Admin y datos UTF-8

Se ejecutó primero el bootstrap self-hosted y después únicamente la spec focal
de Auth Admin. La mutación alcanzó Auth y el último audit seguro —sin IDs,
emails ni contraseñas— devolvió `status = succeeded`, `error_code = null`,
`completed_at = true`; tanto el estado previo como el actual conservaron
`is_active = true` y `must_change_password` pasó de `false` a `true`.

La instrumentación temporal y sanitizada mostró que el servicio de reset
retornó correctamente, entró y retornó de
`revalidateConfiguracionUsuariosList()`, y alcanzó `actionSuccess`. Sin embargo,
el cliente mantuvo la Server Action en `Restableciendo...`. El mismo patrón se
reprodujo en la creación de un servicio de configuración: la creación llega a
completarse y la UI no recibe la finalización tras su revalidación. Desactivar
temporalmente el buffering de respuesta de Nginx no lo resolvió y fue retirado.

Por tanto, el problema no es una mutación parcial de Auth Admin, ni un contrato
de auditoría, ni el buffering de Nginx. La causa demostrada es un bloqueo
transversal de finalización de la respuesta Flight de Server Actions después de
la revalidación; la causa de plataforma subyacente aún requiere diagnóstico.
Se había observado antes un `EROFS` de cache prerender para `/login`, pero no se
reprodujo en la ejecución controlada y no se declara causa raíz. No se cambió
`read_only`, no se añadieron montajes amplios, ni se alteraron límites de tiempo.

Una advertencia de catálogo UTF-8 se investigó por separado. Los bytes Git de
las migraciones baseline 01 y 06 contienen `Impresión` como UTF-8
`496d7072657369c3b36e`; PostgreSQL informa `server_encoding = UTF8` y
`client_encoding = UTF8`. La fila canónica de `tipos_servicio`, en cambio,
contenía literalmente `Impresi??n` (`496d70726573693f3f6e`) también en la
descripción. La corrupción ya estaba en la base de datos antes de PostgREST y
Nginx; el mecanismo histórico de ingestión no pudo demostrarse.

Se reparó exclusivamente esa fila canónica mediante una transacción con
literales `U&` ASCII, verificación de exactamente una fila afectada y sin crear
migración. La lectura REST por Nginx y el gate Chromium de solo lectura
confirmaron los bytes UTF-8 correctos. Para prevenir recurrencia, cualquier
aplicación de datos con caracteres no ASCII debe ejecutar el archivo UTF-8
directamente con `psql -f` o una vía equivalente byte-safe —nunca mediante un
pipe de texto Windows— y verificar bytes fuente/DB antes de declarar aplicada
una baseline.

## Server Action completion correction

### Hipótesis y estado inicial

Se probó como hipótesis que una Server Action que devuelve un `ActionState` a
`useActionState` queda pendiente en este runtime cuando invalida con
`revalidatePath()` la misma ruta desde la que fue invocada. Antes del
experimento, el reset de Usuarios invalidaba
`/dashboard/configuracion/usuarios` y su diálogo ya ejecutaba
`router.refresh()` tras `state.ok`. Los formularios de Servicios invalidaban
`/dashboard/configuracion`, `/dashboard/configuracion/servicios` y
`/solicitud`; sus diálogos de creación y edición también ejecutan
`router.refresh()` tras éxito.

### Diferencial Usuarios

Se retiró únicamente la llamada a
`revalidateConfiguracionUsuariosList()` del camino exitoso de
`resetUserPasswordAction`. No se cambiaron la mutación, auditoría,
`actionSuccess`, `onSuccess` ni el `router.refresh()` del cliente. Con la
imagen production-like reconstruida, el primer reset devolvió el `ActionState`
y cerró el diálogo, a diferencia del estado pendiente anterior. El segundo
intento recibió el error funcional visible `target_rate_limit`, confirmando que
la respuesta de una acción fallida también llega al navegador.

El rate-limit impidió repetir inmediatamente el caso exitoso para completar el
login temporal del trabajador. La restauración idempotente posterior devolvió
la fixture a sus credenciales originales y verificó los tres roles. Por tanto,
la omisión de revalidación de la ruta actual queda demostrada como cofactor para
la finalización de Usuarios, pero el gate Auth Admin completo permanece
pendiente de una nueva ventana de rate-limit.

### Diferencial Servicios

Se retiró temporalmente sólo
`revalidatePath("/dashboard/configuracion/servicios")` de
`revalidateServiceTypesAdmin`, conservando las invalidaciones cross-route de
`/dashboard/configuracion` y `/solicitud` y los `router.refresh()` de cliente.
La creación de servicio siguió con `Creando servicio...` y el diálogo no cerró
en 15 segundos; la captura mostró la fila creada detrás del diálogo. El cambio
experimental fue revertido: no hay modificación definitiva de la estrategia de
revalidación de Servicios.

La hipótesis no se generaliza: el patrón de invalidación de ruta actual es un
cofactor demostrado para el reset de Usuarios, pero no explica por sí solo el
hang de Servicios. No se cambió Nginx, `read_only`, tmpfs, Dockerfile, Compose
ni dependencias Next/React. El `EROFS` histórico no reapareció durante este
experimento.

### Auditoría transversal estática

| Acción o grupo | Ruta actual | Rutas revalidadas | Ruta actual invalidada | Refresh cliente | Riesgo |
| --- | --- | --- | --- | --- | --- |
| Reset Usuarios | `/dashboard/configuracion/usuarios` | Ninguna tras esta corrección | No | Sí | SAFE para este reset; gate completo pendiente de rate-limit |
| Alta/edición Usuarios | `/dashboard/configuracion/usuarios` | Lista de Usuarios | Sí | Sí | SUSPECT |
| Crear/editar Servicios | `/dashboard/configuracion/servicios` | Configuración, Servicios, Solicitud | Sí | Sí | NEEDS SH-03.x TEST |
| Alta/edición Clientes | lista o detalle de Clientes | lista y/o detalle de Clientes | Posible | Sí | NEEDS SH-03.x TEST |
| Plantillas y tareas de plantilla | Configuración/Plantillas | configuración, lista y detalle | Posible | Sí | NEEDS SH-03.x TEST |
| Solicitudes y Pedidos de detalle | detalle invocador | dashboard, lista y detalle | Sí | no uniforme | NEEDS SH-03.x TEST |
| Login y cambio inicial | Login o cambio inicial | Dashboard y cambio inicial | Puede coincidir | no aplica; redirige | SAFE fuera de este patrón de valor retornado |

No se modificaron los candidatos `SUSPECT` o `NEEDS SH-03.x TEST`.

### Evidencia y estado

El reset exitoso conservó una auditoría `succeeded`, sin error y completada; el
intento posterior fue `rate_limited` con `target_rate_limit`, también
completado, sin exponer identificadores ni credenciales. La reparación UTF-8
permanece íntegra. SH-03.1 no cambia de estado: el gate de Servicios continúa
bloqueado y no se inicia SH-03.2 ni SH-03.3.

## Bootstrap local preservado

`npm run qa:bootstrap` sigue llamando al mismo script sin argumentos, por lo
que conserva `target = local`, fallback a `.env.local`, Supabase CLI local y la
resolución histórica `supabase_db_<project_id>`. El runtime local no se ejecutó
porque el stack self-hosted era el entorno activo; se validaron parsing y
sintaxis del entrypoint sin alterar ese flujo.

## Bootstrap self-hosted

El target explícito es:

```text
npm run qa:bootstrap:selfhosted
```

Exige runtime env, QA env y Supabase env explícitos. Antes de cualquier mutación
invoca el validador del contrato runtime. Las identidades usan la URL pública y
la publishable key para comprobación de login; la secret key solo vive en la
memoria del tooling Auth Admin y no se registra.

Los perfiles QA se aplican con el Compose efectivo (`docker-compose.yml` más el
override Godel) y `docker compose ... exec -T db psql`; no se deriva un nombre
de contenedor, no se usa container ID ni PostgreSQL por host. Se preservan
`ON_ERROR_STOP`, los tres IDs, la sanitización y el marcador `QA_PROFILES_OK`.

## Environment QA

`.env.qa.local` es local, ignorado por Git y contiene exclusivamente las seis
variables `GODEL_TEST_*` de los tres roles. No contiene URL runtime, keys,
secrets, JWT ni contraseña de base de datos. Fue creado solo al no existir, con
contraseñas distintas criptográficamente aleatorias; sus valores no forman parte
de esta evidencia.

## Idempotencia

El contrato runtime real pasó. Dos ejecuciones consecutivas del bootstrap
self-hosted pasaron: cada una convergió exactamente las tres identidades QA,
validó login de los tres roles y recibió `QA_PROFILES_OK` del SQL de perfiles.
No se crearon identidades fuera del conjunto configurado.

## Runner Playwright

`test:e2e:selfhosted` carga explícitamente `compose.env.local` y
`.env.qa.local`, pasa al proceso hijo únicamente las dos variables públicas
Supabase, las seis QA y el modo externo `http://localhost:8080`. Elimina
explícitamente secretos runtime y de base de datos del child. Con
`PLAYWRIGHT_EXTERNAL_SERVER=1`, `playwright.config.ts` no define `webServer`;
la ejecución no inició `npm run dev`.

## Login/session

El gate Chromium serial por Nginx pasó con 13 pruebas y tres skips legítimos de
fixtures no requeridas. Se verificaron login admin, supervisor y trabajador,
shell por rol, rutas públicas y estados internos sin autenticar.

## Roles

Admin accedió a Usuarios. Supervisor y trabajador recibieron la página de acceso
limitado para Usuarios; no se modificaron permisos para obtener ese resultado.

## Auth Admin

La spec serial focal abre el diálogo real de reset del trabajador QA, establece
una contraseña temporal generada durante la prueba, exige el cierre del diálogo,
comprueba el estado visible `Cambio inicial pendiente` y después valida el login
del trabajador con esa nueva contraseña. No recibe la secret key. El primer
reset alcanzó Auth y dejó la contraseña temporal, pero la respuesta UI quedó
pendiente; por ello no pudo ejecutar el login temporal dentro de la misma spec.
La spec conserva ese contrato de éxito para mantener el fallo reproducible.

## Restauración de fixtures

Se ejecutó nuevamente el bootstrap self-hosted inmediatamente después del
hallazgo. Restauró la contraseña configurada del trabajador, los tres perfiles
y la verificación de login de los tres roles. Una nueva ejecución Playwright de
smoke, shell y Usuarios confirmó de nuevo el login del trabajador y las
restricciones de rol.

## Seguridad

No se creó ni usó `SUPABASE_SERVICE_ROLE_KEY`. La secret key no se pasó a
Playwright ni se imprimió. Los archivos locales de environment permanecen
ignorados y fuera del diff. No hubo cambios upstream Supabase, de migraciones,
tipos de base de datos ni lógica de negocio.

## Validación

| Gate | Resultado |
| --- | --- |
| Runtime env validator | PASS |
| Bootstrap self-hosted, ejecución 1 | PASS |
| Bootstrap self-hosted, ejecución 2 | PASS |
| QA profiles marker y login de tres roles | PASS |
| Playwright externo smoke/shell/Usuarios | PASS: 13 passed, 3 skipped legítimos |
| Audit Auth Admin seguro | PASS: `succeeded`, sin error, completado, flags esperados |
| Auth Admin reset por aplicación | BLOCKED: mutación y revalidación retornan, respuesta UI pendiente |
| Servicio de configuración por aplicación | BLOCKED: mismo patrón post-revalidación |
| REST `tipos_servicio` por Nginx | PASS: bytes UTF-8 correctos |
| Chromium catálogo `Impresión` por Nginx | PASS: 1 passed |
| Restauración de fixture y login original worker | PASS antes del gate final; debe repetirse tras corregir el bloqueo |

## Pendientes

- Diagnosticar y corregir la finalización transversal de Server Actions sin
  relajar garantías de auditoría, compensación ni el filesystem read-only.
- Repetir el gate completo: reset, estado visible, login temporal, bootstrap de
  restauración y login original del trabajador.
- No iniciar SH-03.2 ni SH-03.3 antes de revisión arquitectónica.

## Transversal Server Action stabilization

### Estado y alcance

SH-03.1 queda **IMPLEMENTED / BLOCKED BY CURRENT-ROUTE FRESHNESS REVIEW**. No
se iniciaron SH-03.2 ni SH-03.3. El alcance de esta pasada se limitó a las
acciones de creación que devuelven estado a un modal: Servicios, Clientes,
Pedidos manuales y Plantillas de tareas. No se modificaron los caminos de
edición, activar/desactivar, Auth Admin, runtime, Compose, Nginx, Dockerfile,
Supabase upstream, migraciones ni tipos de base de datos.

### Diferencial base 16.2.6

Se eliminaron solamente las invalidaciones server-side del camino exitoso de
creación. Se conservaron los `router.refresh()` de los modales y todas las
revalidaciones de edición/activar-desactivar.

| Flujo | Revalidación retirada de create | Resultado repetido |
| --- | --- | --- |
| Servicios | `revalidateServiceTypesAdmin()` | PASS 3/3: modal cierra y la búsqueda por navegación encuentra el servicio |
| Clientes | `revalidateClientesList()` | PASS 3/3: modal cierra y la búsqueda por navegación encuentra el cliente |
| Pedidos manuales | `revalidatePath("/dashboard/pedidos")` | PASS 3/3: modal cierra y la búsqueda por navegación encuentra el pedido |
| Plantillas | `revalidateTaskTemplatesList()` | PASS 3/3: modal cierra y la búsqueda por navegación encuentra la plantilla |

Antes de convertir el gate de Pedidos en búsqueda por navegación, se verificó
un caso focal de refresco inmediato: tras cerrar el modal, el nuevo pedido no
apareció en el listado actual después de `router.refresh()`, aunque la
mutación estaba persistida. No se aceptó esa condición como éxito. Una nueva
navegación filtrada sí recuperó la fila. Esto clasifica la causa demostrada
como una interacción entre la entrega de `ActionState`, la invalidación
server-side y la frescura del árbol de ruta actual; no como fallo de la
mutación ni como caché persistente global.

### Auditoría de caché y frescura

No hay uso local de `cacheComponents`, `"use cache"`, `unstable_cache` ni
`force-cache`. `next.config.ts` no activa caché de componentes. Los clientes
Supabase server-side dependen de `cookies()`, por lo que las páginas protegidas
son dinámicas en el runtime actual.

| Comprobación | Resultado |
| --- | --- |
| Frescura por nueva navegación: servicios, clientes y plantillas | PASS para las altas 3/3 |
| Frescura por nueva navegación: pedidos | PASS para las altas 3/3 |
| Frescura de ruta actual de Pedidos tras `router.refresh()` | FAIL: la fila no apareció hasta nueva navegación; mutación persistida |
| Editar/ocultar Servicios y Plantillas | No ejecutado: sus revalidaciones se retienen y el objetivo fue aislar create |
| Dashboard y pedidos cross-route | No establecido por el fallo anterior |

Por ello no se aprueba todavía una regla arquitectónica general de "sin
revalidación server-side" para modales. La regla candidata queda limitada a
este diferencial: los creates verificados no deben volver a introducir las
revalidaciones retiradas hasta que Arquitectura decida el contrato de frescura
de ruta actual. Las revalidaciones de edición, activar/desactivar, detalle y
cross-route permanecen sin cambios porque no han pasado la matriz de frescura.

### Parche de seguridad Next

Se actualizaron exactamente `next` y `eslint-config-next` de 16.2.6 a
16.2.11, con su lockfile. `react` y `react-dom` siguen en 19.2.4: no hubo
conflicto de peer dependencies que justificara cambiarlos. La imagen
production-like se reconstruyó con Next 16.2.11; compilación y TypeScript
pasaron. El gate E2E repetido de las cuatro creaciones también pasó con esa
imagen.

### Validación de esta pasada

| Gate | Resultado |
| --- | --- |
| Bootstrap self-hosted y login de tres roles | PASS |
| Gate Playwright externo de creaciones repetidas, base 16.2.6 | PASS: 3/3 por cada flujo |
| Build production-like Next 16.2.11 | PASS, incluyendo TypeScript |
| Gate Playwright externo de creaciones repetidas, Next 16.2.11 | PASS: 3/3 por cada flujo |
| `npm run lint` | PASS |
| `git diff --check` | PASS |

El bootstrap de restauración se ejecutó durante la validación post-parche y
verificó nuevamente los tres roles. No se imprimieron credenciales, secretos ni
identificadores de fixtures. Las entidades QA creadas por el gate se preservan:
no se ejecutó limpieza destructiva fuera de un mecanismo de dominio aprobado.

## Handoff

SH-03.1 se detiene para revisión arquitectónica. El bootstrap y runner
self-hosted son utilizables; la decisión pendiente es el contrato de frescura
de ruta actual que debe acompañar los creates sin revalidación server-side.
No se inicia SH-03.2 ni SH-03.3 en esta pasada.
