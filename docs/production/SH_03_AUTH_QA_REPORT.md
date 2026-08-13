# SH-03.1 — Provisioning QA, Auth, session, roles y Auth Admin

## Estado

```text
SH-03.0 = CLOSED / APPROVED
SH-03.1 = CLOSED / APPROVED
SH-03 = ACTIVE
SH-03.2 = NEXT / NOT STARTED
```

La implementación no modifica migraciones, tipos generados, Compose ni la
lógica de producto. La corrección focal confirmó los hallazgos funcionales y el
cierre arquitectónico aprobó el fallback documentado antes de avanzar a SH-03.2.

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

SH-03.1 queda **BLOCKED** por la revisión de frescura de ruta actual. No
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

### Current-route freshness resolution

Se probó el mecanismo oficial de Next 16.2.11 `refresh()` de `next/cache`
únicamente en `createPedidoAction`: se llamó después de que
`createInternalPedido()` devolviera éxito y antes de devolver el `ActionState`.
Al mismo tiempo se retiró el `router.refresh()` del `onSuccess` del diálogo de
creación para evitar un doble refresco. No se introdujo `revalidatePath()`.

El gate focal se endureció temporalmente a cinco creaciones consecutivas en
`/dashboard/pedidos`, sin navegación, búsqueda, recarga ni parámetros nuevos:
debía cerrar el modal y mostrar cada título en la tabla actual. Falló en la
primera creación: el diálogo quedó visible en `Creando pedido...` tras 20
segundos. La captura Chromium muestra el pedido creado detrás del diálogo, pero
el `ActionState` no regresó al cliente y el modal no cerró. El runtime estaba
sano (`live = 200`, `ready = 200`).

Por tanto, `refresh()` server-side no estabiliza este patrón de acción que
retorna valor; reproduce el bloqueo de entrega observado con revalidación
server-side. Se revirtió por completo el experimento focal de Pedido, incluido
el `refresh()` de la action, la retirada del `router.refresh()` cliente y el
gate temporal de cinco repeticiones. No se inició la Fase B para Servicios,
Clientes o Plantillas, ni las verificaciones cross-route, Auth Admin o
edit/update. El fallback temporalmente separado permitido por el diseño queda
pendiente de decisión arquitectónica y no se implementa en esta pasada.

### Client refresh settlement diagnostic

Se auditó el orden real de creación de Pedido con instrumentación temporal
sanitizada y captura Playwright en memoria. La instrumentación no registró
formularios, identificadores, cookies, tokens, claves ni cuerpos completos. En
la baseline, `pending` transitó a `false` antes de que se observara
`state.ok`; después se ejecutaron `onSuccess`, el cierre del diálogo y la
llamada a `router.refresh()`. El POST de la action terminó antes de iniciar el
RSC de refresh, con estado HTTP exitoso.

La primera aserción de frescura usaba erróneamente un selector de `tr`. El
listado renderiza cada pedido como enlace semántico dentro del grupo de filas,
por lo que ese selector no podía validar la fila. Corregido al enlace real, el
título aún no fue detectable dentro de los 20 segundos que exige el gate. La
captura final de Playwright, producida después de ese umbral durante el cierre
del test, sí contenía el pedido nuevo. Por tanto, no se clasifica como un árbol
permanentemente previo, pero tampoco como read-your-writes inmediato aceptable.

La captura de red observó varias respuestas RSC iniciadas por el refresh. Una
respuesta RSC ya finalizada no contenía el título QA, mientras que la captura
final de DOM sí lo contenía posteriormente; los streams simultáneos impiden
atribuir de forma concluyente ese DOM tardío a una única respuesta. La lectura
PostgreSQL directa y de solo lectura confirmó tres pedidos QA recientes del
diagnóstico, sin exponer IDs ni datos sensibles. La mutación de base de datos
queda confirmada; la latencia/orden de frescura del render actual sigue sin
demostración dentro del contrato de 20 segundos.

Se probó `state.ok && !pending` en `PedidoForm`; la evidencia ya mostraba que
`pending` era `false` antes del éxito y el gate siguió sin frescura dentro del
umbral. También se probó separar cierre y refresh: el callback cerró el modal y
un efecto posterior invocó `router.refresh()` después del commit de cierre, sin
temporizadores. El resultado fue el mismo. Se revirtieron ambos experimentos,
la instrumentación temporal y el test diagnóstico. No se aplicó
`startTransition`, no se añadieron hacks de tiempo/navegación, ni se tocaron
Servicios, Clientes, Plantillas, Auth Admin, ediciones o updates.

### RSC streaming through Nginx

La guía oficial de self-hosting de Next.js requiere que el proxy no bufferice
las respuestas del App Router para preservar el streaming RSC. El bloque
`location /` de Nginx ya tenía `proxy_request_buffering off`, que controla el
cuerpo Browser → Next. En esta pasada se añadió, como única variable de
infraestructura, `proxy_buffering off`, que controla la respuesta Next/RSC →
Browser. No se alteraron los bloques Auth, REST o Storage, timeouts, headers,
upstreams, límites, Compose, Dockerfile ni se añadió `X-Accel-Buffering` desde
Next.

La imagen Nginx se reconstruyó y el contenedor Nginx se recreó aisladamente.
`nginx -t`, `live = 200` y `ready = 200` pasaron; app y Supabase no se
recrearon durante esa operación. El gate temporal de cinco altas consecutivas
de Pedido, sin navegación, búsqueda, recarga ni cambio de URL, falló en la
segunda alta: la primera mostró el título en la ruta actual y la segunda no lo
hizo dentro de 20 segundos. La medición temporal y sanitizada registró inicio
de RSC, finalización cuando estuvo disponible y el umbral de visibilidad DOM;
no registró cuerpos, cookies, credenciales, tokens ni títulos QA.
En la primera alta, las respuestas RSC comenzaron aproximadamente a los 1.2 s,
una de ellas finalizó aproximadamente a los 1.6 s y el DOM fue visible a los
1.65 s; esa observación puntual no se repitió en la segunda alta.

Por tanto, `proxy_buffering off` queda como configuración de streaming RSC
necesaria y válida en Nginx, pero no demuestra por sí sola read-your-writes
repetible para este flujo. La evidencia histórica de que el buffering no
resolvió un bloqueo queda limitada a Server Actions que devolvían un valor y
ejecutaban revalidación server-side; no implica que response buffering sea
irrelevante para App Router o `router.refresh()`.

### POST/Redirect/Get differential

Como el gate de streaming no alcanzó 5/5, se probó únicamente en
`createPedidoAction` el contrato oficial: los errores de validación devuelven
el `ActionState` existente; tras una mutación exitosa, `revalidatePath` seguido
de `redirect("/dashboard/pedidos", RedirectType.replace)` no devuelve un
`ActionState`. `redirect` permaneció fuera de `try/catch`. No se modificó el
cliente de Pedido ni se extendió este experimento a Servicios, Clientes o
Plantillas.

El error de validación siguió visible dentro del modal, por lo que el camino de
fallo conservó correctamente `ActionState`. La primera alta exitosa, sin
embargo, quedó en `Creando pedido...` durante más de 20 segundos: no cerró el
modal, no completó la navegación y no mostró el pedido en la ruta actual. Se
revirtió completamente el experimento de PRG y su gate temporal. El payload de
éxito de Pedido (`pedidoId`, `numeroPedido`, `publicReference`) no se eliminó:
en el patrón vigente se renderiza en el estado de éxito del formulario, aunque
el callback actual cierra el diálogo inmediatamente.

Resultado arquitectónico actual: el servidor conserva `mutate → return
ActionState` para los creates existentes; el cliente conserva `state.ok →
cerrar diálogo → router.refresh()`; Nginx mantiene `proxy_buffering off` en el
proxy de app. No es un contrato de frescura aprobado, porque ni el gate
same-route 5/5 ni el fallback PRG demostraron completitud fiable. No se
introdujeron temporizadores, navegación manual, cache-busting, CSR, mirrors
optimistas ni reintentos Auth Admin.

### Next runtime filesystem differential

Se ejecutó un diferencial A/B limitado a `app.read_only`. La baseline final
mantiene `read_only: true`, con tmpfs exclusivamente en `/tmp` y
`/app/.next/cache`. El override temporal no versionado cambió sólo
`app.read_only` a `false`; conservó usuario `1000:1000`, `cap_drop=ALL`,
`no-new-privileges`, límites de procesos/CPU/memoria, redes, app sin puerto host
y Nginx como frontend. La configuración efectiva e inspección del contenedor
confirmaron esas propiedades, y Supabase no se recreó en ningún tramo.

Con filesystem writable, el patrón actual de Pedido (`mutate → ActionState →
cerrar diálogo → router.refresh()`) completó la primera mutación, pero no
mostró su título en la ruta actual dentro de 20 segundos. Con la única variante
adicional `revalidatePath("/dashboard/pedidos")` antes de devolver el mismo
`ActionState`, la primera acción volvió a quedar pendiente más de 20 segundos.
La hipótesis de que el root filesystem read-only era cofactor del hang de Server
Actions queda rechazada: el comportamiento se reprodujo con `read_only=false`.

No fue necesario continuar a mutaciones de detalle ni inspeccionar escrituras
de `.next`: C no pasó y no hubo evidencia nueva que justificara ampliar el
filesystem writable. Los logs del runtime final no mostraron `EROFS`, fallos de
escritura ni advertencias de cache/prerender. El override temporal se eliminó y
el runtime final volvió a `read_only: true`; no se modificó `compose.yaml`.

### Document-navigation compatibility fallback

Como la incompatibilidad se reproduce independientemente de Supabase, la
mutación de dominio, el buffering de Nginx, el settlement de `pending` y el
filesystem read-only, se adoptó un workaround explícito para éxito de create en
Next 16.2.11 self-hosted. El servidor conserva `mutate → return ActionState`,
sin `revalidatePath`, `refresh()` server-side ni redirect. Tras `state.ok`, el
cliente cierra el diálogo y ejecuta navegación documental a la ruta canónica:
`/dashboard/pedidos`, `/dashboard/configuracion/servicios`,
`/dashboard/clientes` o `/dashboard/configuracion/plantillas`.

No se usan query params, temporizadores, cache-busting, doble refresh, SWR,
React Query ni mirrors optimistas. Los errores siguen retornando y renderizando
`ActionState` dentro de los formularios. El gate externo final, ya con
`read_only: true`, pasó: Pedidos 5/5 y Servicios, Clientes y Plantillas 3/3;
cada alta cerró el diálogo, recuperó la fila fresca en su URL canónica y
conservó la sesión/permiso de creación. Es un workaround de compatibilidad, no
una afirmación de frescura SPA ideal.

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

### User-management compatibility closure

Se cerró exclusivamente la superficie de administración de usuarios. Las
acciones de crear y editar ya no invalidan rutas tras una mutación exitosa;
conservan el servicio, validación, errores y `ActionState` existentes. Crear,
editar y restablecer contraseña cierran su diálogo solamente tras `state.ok` y
ejecutan `window.location.assign("/dashboard/configuracion/usuarios")`.
Esta navegación documental es intencional: no utiliza `router.refresh()`,
`revalidatePath()`, PRG, temporizadores, cache-busting ni estado optimista.

El gate externo self-hosted comprobó que una validación inválida permanece en
el diálogo y que las tres mutaciones realizan navegación documental real a la
ruta canónica. La alta recuperó la fila creada con rol Trabajador y el estado
visible `Cambio inicial pendiente`; la edición recuperó el teléfono actualizado.
La edición usó una entidad QA creada por el propio gate, por lo que no alteró
una fixture preexistente que requiriera restauración.
El reset recuperó el estado visible, permitió al trabajador entrar con la
contraseña temporal y lo condujo a cambio inicial de contraseña. El audit
privado seguro del último reset devolvió `status = succeeded`,
`error_code = null` y `completed_at = true`. El bootstrap posterior restauró
las credenciales de fixture y verificó los tres roles.

| Acción o grupo | Patrón actual | Riesgo residual | Clasificación |
| --- | --- | --- | --- |
| Crear, editar y reset de Usuarios | `ActionState` sin revalidación exitosa + navegación documental | Acotado a la ruta canónica de Usuarios y cubierto por gate self-hosted | SAFE para este cierre |
| Crear Servicios, Clientes, Pedidos y Plantillas | Fallback documental previamente validado para create | No cubierto de nuevo en este gate de Usuarios | Fuera de alcance; conservar evidencia previa |
| Edición, activar/desactivar y operaciones de Servicios, Clientes y Plantillas | Revalidación existente | Puede combinar la ruta actual con respuesta de Server Action | NEEDS SH-03.x TEST |
| Pedidos y Solicitudes: estado, comentarios, tareas, archivos, pagos, conversión y asignaciones | Revalidaciones de detalle/lista existentes | No auditado ni modificado en esta pasada | NEEDS SH-03.2 TEST |

No se cambiaron runtime, Compose, Dockerfile, Nginx, Supabase upstream,
migraciones ni `database.types`. Se preservan `proxy_buffering off`,
`read_only: true` y Next 16.2.11. Esta corrección no autoriza ni inicia
SH-03.2 o SH-03.3.

| Gate final de Usuarios | Resultado |
| --- | --- |
| Alta: validación inválida dentro del diálogo | PASS |
| Alta: navegación documental y fila fresca | PASS: 3/3 |
| Edición: navegación documental y valor fresco | PASS |
| Reset Auth Admin: navegación, flag y login temporal | PASS |
| Audit seguro de último reset | PASS: `succeeded`, `null`, completado |
| Bootstrap y login de tres roles posterior | PASS |
| Playwright externo focal | PASS: 2/2; alta repetida PASS: 3/3 |

## Handoff a SH-03.2

SH-03.1 queda **CLOSED / APPROVED**. El bootstrap y runner self-hosted son
utilizables; `refresh()` server-side y PRG quedan descartados para este patrón.
El fallback de navegación documental queda acotado a los creates previamente
verificados y a crear, editar y resetear Usuarios mediante este gate final.

Las acciones que aún combinan mutación, revalidación y `ActionState`/
`useActionState` son **TEST IN SH-03.2**. No se asume que estén rotas ni se les
aplica el fallback preventivamente. Si un flujo lo reproduce en SH-03.2, se
retira su revalidación del success path según el caso, se aplica el fallback
documental aprobado, se añade al alcance de TD-NEXT-001 y se cubre con un gate
production-like. SH-03.2 es el siguiente bloque y no ha empezado; SH-03.3
permanece pendiente.
