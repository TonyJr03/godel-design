# SH-03.1 — Provisioning QA, Auth, session, roles y Auth Admin

## Estado

```text
SH-03.0 = CLOSED / APPROVED
SH-03.1 = IMPLEMENTED / PENDING ARCHITECTURAL REVIEW
SH-03 = ACTIVE
NEXT AFTER APPROVAL = SH-03.2
```

La implementación no modifica migraciones, tipos generados, Compose, runtime ni
lógica de producto. La revisión arquitectónica debe decidir el hallazgo de Auth
Admin documentado abajo antes de avanzar a SH-03.2.

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

Se añadió una spec serial focal que, como admin, abre el diálogo real de reset
del trabajador QA, establece una contraseña temporal generada en la prueba y
exige después el inicio de sesión del trabajador con esa nueva contraseña. No
recibe la secret key. Durante la ejecución real, la contraseña del trabajador
sí cambió (el login con la credencial original falló), pero la acción quedó
visible en estado `Restableciendo...` y no finalizó en la UI dentro de 20
segundos, por lo que la comprobación posterior no pudo ejecutarse. El último log
del contenedor solo mostró un aviso de cache prerender de login en sistema de
archivos de solo lectura, sin diagnóstico del reset.

Es un bug funcional de finalización de la mutación Auth Admin. No se modificó
`src/**` para ocultarlo; la spec conserva la expectativa correcta de éxito para
que el fallo sea reproducible.

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
| Auth Admin reset por aplicación | BLOCKED: contraseña cambia, finalización UI pendiente |
| Restauración de fixture y login original worker | PASS |

## Pendientes

- Diagnosticar y corregir la finalización de la acción de reset Auth Admin sin
  relajar sus garantías de auditoría y compensación.
- Repetir la spec focal de Auth Admin hasta éxito completo y mantener la
  restauración del fixture.
- No iniciar SH-03.2 ni SH-03.3 antes de revisión arquitectónica.

## Handoff

La implementación de SH-03.1 queda detenida para revisión arquitectónica. El
bootstrap y runner self-hosted son utilizables; el gate Auth Admin no está
aprobado mientras la acción de reset permanezca pendiente en UI.
