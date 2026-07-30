# Modelo de Gestión de Usuarios Internos

## Propósito

La gestión de usuarios internos administra quién puede entrar al dashboard
operativo de Godel Diseño, qué rol tiene y si puede operar. El módulo trabaja
sobre Supabase Auth como fuente de identidad y credenciales, y sobre
`public.perfiles` como fuente de rol, estado operativo y datos internos.

Los clientes externos no tienen cuenta de usuario en el MVP actual.

## Modelo Actual

La relación vigente es:

| Capa | Responsabilidad |
| --- | --- |
| `auth.users` | Identidad, credenciales, sesión y datos propios de Auth. |
| `public.perfiles` | Perfil operativo interno, rol, estado activo y onboarding. |

`perfiles.id` es una clave primaria `uuid` que referencia `auth.users.id` con
`on delete cascade`. El UUID lo genera Supabase Auth durante el alta
administrativa; la UI no lo captura manualmente.

## Campos Reales de `perfiles`

| Campo | Tipo | Uso |
| --- | --- | --- |
| `id` | `uuid` | Identificador del perfil; referencia `auth.users.id`. |
| `full_name` | `text` | Nombre completo visible del usuario interno. |
| `role` | `app_role` | Rol operativo: `admin`, `supervisor` o `trabajador`. |
| `phone` | `text nullable` | Teléfono opcional. |
| `avatar_url` | `text nullable` | URL o ruta opcional de avatar. |
| `is_active` | `boolean` | Control de acceso interno sin eliminar el usuario Auth. |
| `must_change_password` | `boolean` | Bloquea operación interna mientras el usuario conserva una contraseña temporal. |
| `created_by` | `uuid nullable` | Admin interno que originó la creación administrativa. |
| `created_at` | `timestamptz` | Fecha de creación del perfil. |
| `updated_at` | `timestamptz` | Fecha de última actualización; se mantiene con trigger. |

Los perfiles existentes conservan `must_change_password = false`. Los usuarios
creados por el alta administrativa segura nacen activos, con
`must_change_password = true` y con `created_by` informado por el admin creador.

## Roles

| Rol | Alcance actual |
| --- | --- |
| `admin` | Acceso completo al dashboard y a gestión de usuarios. |
| `supervisor` | Gestión operativa de solicitudes, pedidos y clientes; no gestiona usuarios. |
| `trabajador` | Acceso a pedidos asignados y acciones permitidas sobre esos pedidos; no gestiona usuarios. |

## RLS Actual sobre `perfiles`

Las políticas actuales permiten:

| Operación | Quién puede hacerlo |
| --- | --- |
| `select` | El propio usuario, `admin`, `supervisor` y usuarios internos que necesiten ver perfiles asignados a pedidos accesibles. |
| `insert` | No disponible para sesiones `authenticated`; el alta vigente se hace por Auth Admin + trigger. |
| `update` | Solo `admin`, usando una sesión autenticada, activa y sin cambio temporal pendiente. |
| `delete` | No hay policy de eliminación; no se permite desde el cliente normal. |

La policy vigente de lectura es `perfiles_select_visible`. Conserva la lectura
de la fila propia mediante `id = auth.uid()`, incluso cuando
`must_change_password = true`, para que una etapa posterior pueda detectar
onboarding sin conceder operación interna.

El rol SQL `authenticated` no conserva `UPDATE` completo de tabla sobre
`public.perfiles`. Para sesiones normales, la actualización directa por
PostgREST queda limitada por grant de columnas a:

- `full_name`;
- `phone`;
- `avatar_url`;
- `role`;
- `is_active`.

Los campos `id`, `must_change_password`, `created_by`, `created_at` y
`updated_at` son protegidos frente a sesiones normales. `must_change_password`
solo se completa mediante la RPC privilegiada
`public.complete_initial_password_change(uuid)`, después de que
`auth.updateUser` haya cambiado correctamente la contraseña.

El `INSERT` normal sobre `perfiles` para `authenticated` está retirado. El flujo
legacy por UUID de usuario Auth existente queda histórico y no es la ruta
productiva actual.

## Alta Administrativa Segura

La ruta productiva de creación es:

1. Formulario de Usuarios en `/dashboard/configuracion/usuarios`.
2. Server Action `createUserAction`.
3. Servicio server-only `createInternalUser()`.
4. Admin API de Supabase Auth para crear el usuario con correo y contraseña temporal.
5. Trigger Auth -> `public.perfiles` para provisionar el perfil interno.

La Server Action es un adaptador fino. Lee únicamente:

- `email`;
- `password`;
- `password_confirmation`;
- `full_name`;
- `phone`;
- `avatar_url`;
- `role`;
- `confirm_admin`.

No lee ni acepta `id`, `is_active`, `must_change_password`, `created_by`,
`created_at`, `updated_at`, tokens ni campos técnicos de Auth.

El formulario no envía emails ni invitaciones. La contraseña temporal se entrega
por un canal externo seguro; el sistema no la muestra de nuevo ni la almacena en
estado React.

Cuando el rol solicitado es `admin`, se exige confirmación explícita en el
formulario y en el servicio. Para `supervisor` y `trabajador`, esa confirmación
no se usa.

## Base de Provisionamiento Auth -> Perfil

- `auth.users` sigue siendo la fuente de identidad, correo y credenciales.
- `public.perfiles` sigue siendo la fuente de rol, estado operativo y datos internos.
- El trigger `AFTER INSERT` sobre `auth.users` crea el perfil si
  `raw_app_meta_data.godel_provisioning` trae el marcador administrativo esperado.
- El trigger complementario `AFTER UPDATE OF raw_app_meta_data` crea el perfil
  cuando el marcador aparece por primera vez en una actualización posterior de
  `app_metadata`.
- Ambos triggers ejecutan `private.provision_internal_profile_from_auth_user()`.
- Se conserva `app_metadata` porque el marcador es metadata administrativa.
- Usuarios Auth sin ese marcador no reciben perfil automático ni acceso interno.
- `must_change_password = true` bloquea operación interna por RLS.
- `created_by` identifica al admin creador y exige que sea `admin`, activo y sin
  cambio de contraseña pendiente.
- `public.complete_initial_password_change(uuid)` completa el onboarding después
  de `auth.updateUser({ password })` exitoso para la sesión autenticada.
- `private.internal_user_creation_audit` registra intentos de alta sin almacenar
  email, contraseña, metadata, tokens ni payloads completos.
- `public.begin_internal_user_creation_attempt` reserva cada intento permitido y
  aplica rate limiting antes de construir el cliente Admin.
- `public.complete_internal_user_creation_attempt` finaliza el intento como
  `succeeded`, `failed` o `compensation_failed`.
- El rate limit vigente permite hasta 5 intentos reales por admin en 10 minutos
  y hasta 20 intentos reales globales en 1 hora.
- El signup público local queda deshabilitado en `supabase/config.toml`.
- `createInternalUser()` es el único consumidor productivo autorizado del
  cliente Admin.

El primer acceso obligatorio vive en `/cambiar-contrasena-inicial`. Un usuario
activo con `must_change_password = true` puede iniciar sesión, pero el proxy y
el layout del dashboard lo redirigen a esa ruta hasta cambiar la contraseña
temporal.

## Permisos

La ruta `/dashboard/configuracion/usuarios` está permitida solo para `admin`
mediante `canAccessDashboardRoute(role, pathname)`. El proxy usa esa misma
función para bloquear acceso directo por URL.

| Permiso | Admin | Supervisor | Trabajador |
| --- | --- | --- | --- |
| `usuarios.view` | Sí | No | No |
| `usuarios.manage` | Sí | No | No |

Las páginas y Server Actions validan permisos en servidor. La navegación visible
no se considera una barrera de seguridad suficiente.

## Operaciones Implementadas

- listar usuarios internos desde `perfiles`;
- ver detalle de usuario;
- crear usuarios Auth internos desde el formulario administrativo;
- provisionar automáticamente el perfil por trigger Auth -> `public.perfiles`;
- editar `full_name`;
- editar `phone` y `avatar_url`;
- cambiar `role`;
- activar o desactivar `is_active`;
- impedir la autodesactivación accidental del único admin;
- impedir que el único admin se quite su propio rol `admin`;
- bloquear eliminación física de perfiles;
- validar todo en Server Actions con `usuarios.view` o `usuarios.manage`;
- mostrar en listado el estado de cambio inicial pendiente;
- completar el cambio inicial obligatorio desde `/cambiar-contrasena-inicial`;
- restablecer administrativamente una nueva contraseña temporal sin enviar correo.

## Servicio `createInternalUser`

`createInternalUser(input)` es un servicio server-only exportado desde
`src/lib/usuarios`. Devuelve un `ServiceResult` con éxito mínimo `{ userId }` o
errores controlados. No devuelve contraseña, sesión, token, objeto completo de
Auth, headers, metadata ni email confirmado.

Orden de defensa:

1. carga el perfil actual con `getCurrentProfile()`;
2. rechaza ausencia de perfil como `unauthorized`;
3. rechaza `must_change_password = true` como `onboarding_required`;
4. exige `usuarios.manage`;
5. valida entrada;
6. crea el cliente server-side normal de Supabase;
7. llama a `public.begin_internal_user_creation_attempt`;
8. devuelve `rate_limited` si la RPC bloquea por ventana temporal;
9. construye `createAdminClient()`;
10. llama a `auth.admin.createUser`;
11. valida que Auth devuelva un UUID;
12. consulta `public.perfiles` con el cliente server-side normal;
13. valida la postcondición completa del perfil;
14. intenta finalizar la auditoría;
15. retorna solo `{ userId }`.

La entrada permitida del alta completa es correo, contraseña temporal,
confirmación de contraseña, nombre completo, teléfono opcional, avatar opcional,
rol y confirmación explícita para rol `admin`. No acepta `id`, `is_active`,
`must_change_password`, `created_by` ni otros campos técnicos.

La contraseña temporal no se recorta ni se transforma. Debe medir entre 8 y 72
caracteres, incluir minúscula, mayúscula, número y carácter no alfanumérico, no
ser idéntica al correo ignorando mayúsculas, y coincidir exactamente con su
confirmación. La contraseña no se registra, no se documenta con ejemplos reales,
no se devuelve y no se incorpora a metadata.

La llamada a Auth usa exclusivamente `auth.admin.createUser` con
`email_confirm = true` y `app_metadata.godel_provisioning`. `email_confirm =
true` significa confirmación administrativa sin envío de email; no afirma que la
persona verificó manualmente el correo.

Después de obtener el UUID de Auth, el servicio consulta `public.perfiles`
mediante el cliente server-side normal y valida `id`, datos normalizados, rol,
`is_active = true`, `must_change_password = true` y `created_by`. Si falla la
postcondición, intenta eliminar compensatoriamente el usuario Auth y devuelve un
mensaje genérico.

El cierre de auditoría como `succeeded` es de mejor esfuerzo: si falla, el
servicio conserva el usuario Auth y el perfil, devuelve éxito y la fila queda
`pending` para reconciliación operativa posterior.

Razones de error actuales: `unauthorized`, `forbidden`,
`onboarding_required`, `validation_error`, `already_exists`, `rate_limited`,
`configuration_error`, `provisioning_error`, `auth_error` y `error`.

Los errores desconocidos devuelven un mensaje genérico. El log sanitizado puede
incluir únicamente `context`, `name`, `code` y `status`; no incluye correo,
contraseña, metadata, URL, headers, request, response body, tokens ni stack.

## Servicio `completeInitialPasswordChange`

`completeInitialPasswordChange(input)` es un servicio server-only exportado desde
`src/lib/auth`. Usa el cliente server-side normal para leer la sesión, validar la
fila propia de `public.perfiles` y ejecutar `auth.updateUser({ password })`.
El formulario no solicita la contraseña temporal actual; Supabase Auth exige
reautenticación cuando `secure_password_change` aplica. Solo después de que Auth
confirme el cambio construye `createAdminClient()` para llamar exclusivamente al
RPC `public.complete_initial_password_change`.

La entrada permitida es `password` y `password_confirmation`. Las contraseñas no
se recortan ni se transforman. La nueva contraseña debe medir entre 8 y 72
caracteres, incluir minúscula, mayúscula, número y carácter no alfanumérico, y no
ser igual al correo del usuario ignorando mayúsculas. La confirmación debe
coincidir exactamente.

Si Auth cambia la contraseña pero el RPC no consigue completar
`must_change_password = false`, el servicio devuelve `completion_error` con
`passwordChanged = true` y un mensaje que indica cerrar sesión y contactar al
administrador. No vuelve a usar la contraseña temporal ni intenta recrear
credenciales.

El servicio mantiene una frontera de excepciones alrededor de cliente SSR,
`getUser`, lectura de perfil, validación asociada al usuario, `auth.updateUser`
y finalización del perfil. Antes de confirmar `auth.updateUser` devuelve un
mensaje controlado sin `passwordChanged`. Después de confirmar que Auth cambió
la contraseña del mismo usuario, cualquier excepción pasa a `completion_error`
con `passwordChanged = true`.

`passwordChanged` solo pasa a `true` cuando `auth.updateUser` no devuelve error
y `updateResult.data.user?.id` coincide con el usuario autenticado.

La RPC `public.complete_initial_password_change` bloquea la fila de
`public.perfiles` con `FOR UPDATE`, lee solo `id`, `is_active` y
`must_change_password`, y confirma el cambio con `UPDATE ... RETURNING id`.

La auditoría estática permite en este servicio únicamente el uso del cliente
privilegiado para `rpc("complete_initial_password_change", ...)`; bloquea otras
RPCs, `from`, Storage y operaciones `auth.admin`.

El código Auth `same_password` se trata como reutilización de contraseña y
devuelve `validation_error` con error de campo `password`, no `weak_password`.

Razones de error actuales: `unauthorized`, `inactive`, `not_required`,
`validation_error`, `reauthentication_required`, `weak_password`,
`rate_limited`, `auth_error`, `completion_error` y `error`.

## Servicio `resetInternalUserPassword`

`resetInternalUserPassword(input)` es un servicio server-only exportado desde
`src/lib/usuarios`. Implementa una operación administrativa separada para
reemplazar la contraseña de otro usuario por una nueva contraseña temporal. No
forma parte de `updateInternalUser()` ni de `UserEditForm`.

Entrada permitida: `id`, `password`, `password_confirmation` y `confirm_reset`.
La Server Action liga `id` con `.bind(null, userId)` y no lo extrae desde
`FormData`.

Orden de defensa:

1. carga `getCurrentProfile()`;
2. exige actor autenticado, activo, `admin`, sin onboarding pendiente y con
   `usuarios.manage`;
3. valida UUID objetivo;
4. rechaza autorrestablecimiento;
5. valida contraseña temporal fuerte, confirmación exacta y `confirm_reset`;
6. crea el cliente server-side normal;
7. genera `attemptId` con `randomUUID()` y llama
   `public.begin_internal_user_password_reset` con `p_target_profile_id` y
   `p_attempt_id`;
8. rechaza `already_in_progress` y rate limits;
9. crea `createAdminClient()`;
10. llama `auth.admin.getUserById(targetId)`;
11. rechaza contraseña igual al correo ignorando mayúsculas;
12. llama `auth.admin.updateUserById(targetId, { password })`;
13. finaliza con `public.complete_internal_user_password_reset`;
14. confirma el cierre por UUID exacto o mediante
    `public.get_internal_user_password_reset_state`;
15. devuelve solo `{ userId, wasActive }`.

El cliente Admin se usa exclusivamente para `getUserById` y `updateUserById`.
No se usa para tablas, Storage, Functions, RPCs, `createUser`, `deleteUser`,
`listUsers`, invitaciones ni enlaces. El payload de actualización contiene solo
`{ password }`: no envía email, rol, metadata, `email_confirm`, sesión ni token.

La respuesta de `updateUserById` solo se considera confirmada cuando no devuelve
error, devuelve `user` y `user.id` coincide con el objetivo. Rechazos definitivos
de Auth, como `user_not_found`, `weak_password`, rate limit u otros 4xx estables
permiten cerrar la auditoría como `failed` y restaurar el perfil. Resultados
inciertos, como errores de red, `AuthRetryableFetchError`, `AuthUnknownError`,
`status = 0`, `408`, `5xx`, excepciones durante `updateUserById`, usuario nulo
o UUID diferente, no ejecutan rollback ordinario.

La RPC de inicio recibe el UUID del intento desde el servicio. Si la respuesta se
pierde, el servicio reintenta con el mismo `attemptId` y la RPC recupera el
intento idempotentemente sin insertar otra auditoría ni volver a modificar el
perfil. La tabla privada tiene un índice único parcial que impide más de un
`pending` por objetivo.

La RPC de inicio guarda una auditoría privada sin datos personales, bloquea la
fila objetivo con `FOR UPDATE`, conserva `previous_is_active` y
`previous_must_change_password`, y deja temporalmente el perfil con
`is_active = false` y `must_change_password = true` antes de modificar Auth. Si
Auth falla, la finalización `failed` restaura ambos valores previos.

Si Auth cambia la contraseña y la finalización se confirma, el usuario queda con
`must_change_password = true`; `is_active` vuelve al valor original. Un usuario
inactivo permanece inactivo. Un usuario ya pendiente puede recibir otra
contraseña temporal, reemplazando la anterior.

El servicio no acepta el estado del perfil como prueba aislada: éxito exige
auditoría `succeeded` y rollback ordinario exige auditoría `failed`, con el
estado actual del perfil coherente con cada terminal. Una respuesta nula, vacía
o con UUID distinto desde `complete_internal_user_password_reset` se trata como
fallo de confirmación.

Si Auth cambió la contraseña o el resultado de la mutación no puede confirmarse,
el servicio no intenta restaurar la contraseña anterior. Intenta marcar
`attention_required`, devuelve `completion_error`, `passwordChanged = true` y el
mensaje crítico que indica no repetir la operación. En resultados inciertos,
`passwordChanged = true` no afirma cambio confirmado: bloquea el reenvío porque
la contraseña pudo haber cambiado. Si Auth no cambió pero no se
pudo restaurar el perfil, intenta `attention_required` con `rollback_failed` y
devuelve `rollback_error`.

La consulta de estado de auditoría distingue explícitamente entre intento no
encontrado y error de consulta o respuesta inválida. Si un inicio queda incierto
y la consulta de estado falla, el servicio devuelve `rollback_error` preventivo
y no llama Auth Admin.

Estados de auditoría: `pending`, `succeeded`, `failed`, `rate_limited` y
`attention_required`. Rate limits: 3 intentos reales por actor en 10 minutos, 3
intentos reales por objetivo en 1 hora y 20 intentos reales globales en 1 hora.
Las filas `rate_limited` no extienden ventanas futuras.

Razones de error actuales: `unauthorized`, `forbidden`,
`onboarding_required`, `self_reset_forbidden`, `validation_error`, `not_found`,
`already_in_progress`, `rate_limited`, `configuration_error`,
`auth_user_not_found`, `auth_error`, `rollback_error`, `completion_error` y
`error`.

No se envía correo de recuperación, invitación, confirmación ni magic link. La
contraseña temporal nunca se registra, almacena, devuelve ni se muestra después
del submit; el formulario la limpia tras cada respuesta y no la guarda en estado
React.

## Fuera de Alcance Actual

- enviar invitaciones desde la app;
- cambiar contraseñas desde la app fuera de la etapa protegida de cambio inicial;
- recuperar contraseñas por correo;
- eliminar usuarios físicamente;
- exponer emails de Auth si no forman parte de `perfiles`;
- agregar consumidores productivos adicionales de la clave administrativa;
- usar service role key desde componentes cliente o código no aislado;
- cambiar la matriz de permisos;
- convertir `perfiles` en un sistema avanzado de recursos humanos.

## Consideraciones de Seguridad

- validar usuario autenticado y perfil activo en servidor;
- validar `usuarios.view` para lectura y `usuarios.manage` para cambios;
- usar el cliente server-side normal de Supabase para tablas y RPCs;
- depender de RLS como defensa final;
- reservar y finalizar intentos de alta por RPC auditada;
- construir el cliente Admin solo después de autorización, validación y rate
  limit en el alta, o después de `auth.updateUser` exitoso en el cambio inicial;
- no aceptar `id` desde el formulario de alta;
- no insertar manualmente en `perfiles` durante el alta completa;
- limitar las columnas actualizables;
- no permitir que el sistema quede sin ningún `admin` activo;
- no permitir eliminación física;
- mantener errores y logs sanitizados.

## Historial de Implementación de Fase 12

| Subfase | Alcance |
| --- | --- |
| 12.1 | Diagnóstico y decisión arquitectónica. |
| 12.2 | Listado read-only de usuarios internos para `admin`. Implementado sobre `public.perfiles`, con filtros GET por nombre/teléfono, rol y estado activo. |
| 12.3 | Detalle read-only de usuario interno. Implementado sobre `public.perfiles`, con validación de UUID y 404 para IDs inválidos o inexistentes. |
| 12.4 | Edición de perfil operativo: nombre, teléfono, avatar, rol y estado. Implementada con guardas para no dejar el sistema sin administrador activo. |
| 12.5 | Creación legacy de perfil interno para usuario Auth existente. Retirada del flujo vigente tras conectar el alta segura. |
| 12.6 | Revisión de seguridad, pruebas y documentación final. |
| 12.7 | Conexión productiva de la creación administrativa completa a Server Action/UI con correo y contraseña temporal. |
| 12.8 | Cambio inicial obligatorio de contraseña y onboarding protegido. |

## Estados Implementados por Subfase

### 12.2 Listado

El listado interno de usuarios está implementado en
`/dashboard/configuracion/usuarios` para perfiles con rol `admin`.

La consulta se realiza server-side mediante el cliente normal de Supabase y
respeta RLS. Selecciona únicamente columnas de `public.perfiles`: `id`,
`full_name`, `role`, `phone`, `avatar_url`, `is_active`,
`must_change_password`, `created_at` y `updated_at`.

Filtros disponibles por GET:

- `q`: busca por nombre o teléfono.
- `role`: acepta `admin`, `supervisor` o `trabajador`.
- `active`: acepta `true` o `false`.

El listado no consulta `auth.users`, no muestra email, no edita perfiles, no
cambia roles, no activa o desactiva perfiles y no usa service role key. Muestra
el estado de cambio inicial pendiente cuando `must_change_password = true`.

### 12.3 Detalle

La carga read-only de usuario por UUID alimenta la edición de perfiles desde
`/dashboard/configuracion/usuarios/[id]/editar`.

El servicio valida formato UUID, valida `usuarios.view` y consulta únicamente
`public.perfiles` con `id`, `full_name`, `role`, `phone`, `avatar_url`,
`is_active`, `must_change_password`, `created_at` y `updated_at`.

No consulta `auth.users`, no muestra email, no crea usuarios y no usa service
role key.

### 12.4 Edición

La edición controlada de perfiles internos está implementada para perfiles con
rol `admin`.

Campos editables:

- `full_name`;
- `phone`;
- `avatar_url`;
- `role`;
- `is_active`.

La edición usa Server Actions y un servicio server-side que valida
`usuarios.manage`, valida UUID, carga el perfil objetivo desde
`public.perfiles`, valida input y actualiza únicamente los campos permitidos. No
acepta `id`, `created_at` ni `updated_at` desde el formulario.

Protecciones implementadas:

- un admin no puede desactivarse a sí mismo;
- un admin no puede quitarse su propio rol `admin`;
- no se puede desactivar el último admin activo;
- no se puede cambiar el rol del último admin activo a `supervisor` o `trabajador`;
- cualquier edición sobre admins activos verifica que siga existiendo al menos un admin activo.

### 12.5 Flujo Legacy Retirado

La creación manual de perfiles por UUID de usuario Auth existente queda retirada
del flujo vigente. Ya no hay formulario productivo que pida el UUID Auth ni
Server Action que inserte directamente la fila de `public.perfiles`.

### 12.7 Alta Segura

El alta administrativa segura está implementada desde el diálogo de Usuarios. El
formulario crea el acceso Auth y el perfil interno en un solo flujo server-side:
Server Action -> `createInternalUser()` -> Auth Admin -> trigger de perfil.

El usuario nuevo queda activo y con `must_change_password = true`. La pantalla
de cambio inicial de contraseña está implementada en
`/cambiar-contrasena-inicial` y completa `must_change_password = false` solo
después de cambiar realmente la contraseña desde una sesión válida.

### 12.8 Cambio Inicial Obligatorio

La ruta `/cambiar-contrasena-inicial` permite a usuarios autenticados, activos y
pendientes reemplazar la contraseña temporal. Usuarios sin sesión van a
`/login`, usuarios sin perfil activo van a `/acceso-denegado` y usuarios que ya
completaron el cambio vuelven a `/dashboard`.

El proxy redirige a esta ruta cuando una sesión activa conserva
`must_change_password = true`. El layout de `/dashboard` repite la defensa
server-side antes de renderizar navegación o contenido operativo.
