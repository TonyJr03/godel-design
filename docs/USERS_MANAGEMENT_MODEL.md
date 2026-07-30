# Modelo de Gestion de Usuarios Internos

## Proposito

La gestion de usuarios internos administra quien puede entrar al dashboard
operativo de Godel Diseno, que rol tiene y si puede operar. El modulo trabaja
sobre Supabase Auth como fuente de identidad y credenciales, y sobre
`public.perfiles` como fuente de rol, estado operativo y datos internos.

Los clientes externos no tienen cuenta de usuario en el MVP actual.

## Modelo Actual

La relacion vigente es:

| Capa | Responsabilidad |
| --- | --- |
| `auth.users` | Identidad, credenciales, sesion y datos propios de Auth. |
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
| `phone` | `text nullable` | Telefono opcional. |
| `avatar_url` | `text nullable` | URL o ruta opcional de avatar. |
| `is_active` | `boolean` | Control de acceso interno sin eliminar el usuario Auth. |
| `must_change_password` | `boolean` | Bloquea operacion interna mientras el usuario conserva una contrasena temporal. |
| `created_by` | `uuid nullable` | Admin interno que origino la creacion administrativa. |
| `created_at` | `timestamptz` | Fecha de creacion del perfil. |
| `updated_at` | `timestamptz` | Fecha de ultima actualizacion; se mantiene con trigger. |

Los perfiles existentes conservan `must_change_password = false`. Los usuarios
creados por el alta administrativa segura nacen activos, con
`must_change_password = true` y con `created_by` informado por el admin creador.

## Roles

| Rol | Alcance actual |
| --- | --- |
| `admin` | Acceso completo al dashboard y a gestion de usuarios. |
| `supervisor` | Gestion operativa de solicitudes, pedidos y clientes; no gestiona usuarios. |
| `trabajador` | Acceso a pedidos asignados y acciones permitidas sobre esos pedidos; no gestiona usuarios. |

## RLS Actual sobre `perfiles`

Las politicas actuales permiten:

| Operacion | Quien puede hacerlo |
| --- | --- |
| `select` | El propio usuario, `admin`, `supervisor` y usuarios internos que necesiten ver perfiles asignados a pedidos accesibles. |
| `insert` | No disponible para sesiones `authenticated`; el alta vigente se hace por Auth Admin + trigger. |
| `update` | Solo `admin`, usando una sesion autenticada, activa y sin cambio temporal pendiente. |
| `delete` | No hay policy de eliminacion; no se permite desde el cliente normal. |

La policy vigente de lectura es `perfiles_select_visible`. Conserva la lectura
de la fila propia mediante `id = auth.uid()`, incluso cuando
`must_change_password = true`, para que una etapa posterior pueda detectar
onboarding sin conceder operacion interna.

El rol SQL `authenticated` no conserva `UPDATE` completo de tabla sobre
`public.perfiles`. Para sesiones normales, la actualizacion directa por
PostgREST queda limitada por grant de columnas a:

- `full_name`;
- `phone`;
- `avatar_url`;
- `role`;
- `is_active`.

Los campos `id`, `must_change_password`, `created_by`, `created_at` y
`updated_at` son protegidos frente a sesiones normales. `must_change_password`
solo debe completarse mediante la RPC privilegiada futura, despues de que el
cambio real de contrasena haya finalizado correctamente.

El `INSERT` normal sobre `perfiles` para `authenticated` esta retirado. El
flujo legacy por UUID de usuario Auth existente queda historico y no es la ruta
productiva actual.

## Alta Administrativa Segura

La ruta productiva de creacion es:

1. Formulario de Usuarios en `/dashboard/configuracion/usuarios`.
2. Server Action `createUserAction`.
3. Servicio server-only `createInternalUser()`.
4. Admin API de Supabase Auth para crear el usuario con correo y contrasena temporal.
5. Trigger Auth -> `public.perfiles` para provisionar el perfil interno.

La Server Action es un adaptador fino. Lee unicamente:

- `email`;
- `password`;
- `password_confirmation`;
- `full_name`;
- `phone`;
- `avatar_url`;
- `role`;
- `confirm_admin`.

No lee ni acepta `id`, `is_active`, `must_change_password`, `created_by`,
`created_at`, `updated_at`, tokens ni campos tecnicos de Auth.

El formulario no envia emails ni invitaciones. La contrasena temporal se entrega
por un canal externo seguro; el sistema no la muestra de nuevo ni la almacena en
estado React.

Cuando el rol solicitado es `admin`, se exige confirmacion explicita en el
formulario y en el servicio. Para `supervisor` y `trabajador`, esa confirmacion
no se usa.

## Base de Provisionamiento Auth -> Perfil

- `auth.users` sigue siendo la fuente de identidad, correo y credenciales.
- `public.perfiles` sigue siendo la fuente de rol, estado operativo y datos internos.
- El trigger `AFTER INSERT` sobre `auth.users` crea el perfil si
  `raw_app_meta_data.godel_provisioning` trae el marcador administrativo esperado.
- El trigger complementario `AFTER UPDATE OF raw_app_meta_data` crea el perfil
  cuando el marcador aparece por primera vez en una actualizacion posterior de
  `app_metadata`.
- Ambos triggers ejecutan `private.provision_internal_profile_from_auth_user()`.
- Se conserva `app_metadata` porque el marcador es metadata administrativa.
- Usuarios Auth sin ese marcador no reciben perfil automatico ni acceso interno.
- `must_change_password = true` bloquea operacion interna por RLS.
- `created_by` identifica al admin creador y exige que sea `admin`, activo y sin
  cambio de contrasena pendiente.
- `public.complete_initial_password_change(uuid)` existe solo para una etapa
  futura posterior a `auth.updateUser({ password })`.
- `private.internal_user_creation_audit` registra intentos de alta sin almacenar
  email, contrasena, metadata, tokens ni payloads completos.
- `public.begin_internal_user_creation_attempt` reserva cada intento permitido y
  aplica rate limiting antes de construir el cliente Admin.
- `public.complete_internal_user_creation_attempt` finaliza el intento como
  `succeeded`, `failed` o `compensation_failed`.
- El rate limit vigente permite hasta 5 intentos reales por admin en 10 minutos
  y hasta 20 intentos reales globales en 1 hora.
- El signup publico local queda deshabilitado en `supabase/config.toml`.
- `createInternalUser()` es el unico consumidor productivo autorizado del
  cliente Admin.

El alta no esta lista para merge productivo hasta completar la pantalla de
cambio inicial real de contrasena y el onboarding protegido. La UI ya muestra el
estado pendiente cuando `must_change_password = true`.

## Permisos

La ruta `/dashboard/configuracion/usuarios` esta permitida solo para `admin`
mediante `canAccessDashboardRoute(role, pathname)`. El proxy usa esa misma
funcion para bloquear acceso directo por URL.

| Permiso | Admin | Supervisor | Trabajador |
| --- | --- | --- | --- |
| `usuarios.view` | Si | No | No |
| `usuarios.manage` | Si | No | No |

Las paginas y Server Actions validan permisos en servidor. La navegacion visible
no se considera una barrera de seguridad suficiente.

## Operaciones Implementadas

- listar usuarios internos desde `perfiles`;
- ver detalle de usuario;
- crear usuarios Auth internos desde el formulario administrativo;
- provisionar automaticamente el perfil por trigger Auth -> `public.perfiles`;
- editar `full_name`;
- editar `phone` y `avatar_url`;
- cambiar `role`;
- activar o desactivar `is_active`;
- impedir la autodesactivacion accidental del unico admin;
- impedir que el unico admin se quite su propio rol `admin`;
- bloquear eliminacion fisica de perfiles;
- validar todo en Server Actions con `usuarios.view` o `usuarios.manage`;
- mostrar en listado el estado de cambio inicial pendiente.

## Servicio `createInternalUser`

`createInternalUser(input)` es un servicio server-only exportado desde
`src/lib/usuarios`. Devuelve un `ServiceResult` con exito minimo `{ userId }` o
errores controlados. No devuelve contrasena, sesion, token, objeto completo de
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
13. valida la postcondicion completa del perfil;
14. intenta finalizar la auditoria;
15. retorna solo `{ userId }`.

La entrada permitida del alta completa es correo, contrasena temporal,
confirmacion de contrasena, nombre completo, telefono opcional, avatar opcional,
rol y confirmacion explicita para rol `admin`. No acepta `id`, `is_active`,
`must_change_password`, `created_by` ni otros campos tecnicos.

La contrasena temporal no se recorta ni se transforma. Debe medir entre 12 y 72
caracteres, incluir minuscula, mayuscula, numero y caracter no alfanumerico, no
ser identica al correo ignorando mayusculas, y coincidir exactamente con su
confirmacion. La contrasena no se registra, no se documenta con ejemplos reales,
no se devuelve y no se incorpora a metadata.

La llamada a Auth usa exclusivamente `auth.admin.createUser` con
`email_confirm = true` y `app_metadata.godel_provisioning`. `email_confirm =
true` significa confirmacion administrativa sin envio de email; no afirma que la
persona verifico manualmente el correo.

Despues de obtener el UUID de Auth, el servicio consulta `public.perfiles`
mediante el cliente server-side normal y valida `id`, datos normalizados, rol,
`is_active = true`, `must_change_password = true` y `created_by`. Si falla la
postcondicion, intenta eliminar compensatoriamente el usuario Auth y devuelve un
mensaje generico.

El cierre de auditoria como `succeeded` es de mejor esfuerzo: si falla, el
servicio conserva el usuario Auth y el perfil, devuelve exito y la fila queda
`pending` para reconciliacion operativa posterior.

Razones de error actuales: `unauthorized`, `forbidden`,
`onboarding_required`, `validation_error`, `already_exists`, `rate_limited`,
`configuration_error`, `provisioning_error`, `auth_error` y `error`.

Los errores desconocidos devuelven un mensaje generico. El log sanitizado puede
incluir unicamente `context`, `name`, `code` y `status`; no incluye correo,
contrasena, metadata, URL, headers, request, response body, tokens ni stack.

## Fuera de Alcance Actual

- enviar invitaciones desde la app;
- cambiar contrasenas desde la app, salvo la futura etapa protegida de cambio inicial;
- eliminar usuarios fisicamente;
- exponer emails de Auth si no forman parte de `perfiles`;
- agregar consumidores productivos adicionales de la clave administrativa;
- usar service role key desde componentes cliente o codigo no aislado;
- cambiar la matriz de permisos;
- convertir `perfiles` en un sistema avanzado de recursos humanos.

## Consideraciones de Seguridad

- validar usuario autenticado y perfil activo en servidor;
- validar `usuarios.view` para lectura y `usuarios.manage` para cambios;
- usar el cliente server-side normal de Supabase para tablas y RPCs;
- depender de RLS como defensa final;
- reservar y finalizar intentos de alta por RPC auditada;
- construir el cliente Admin solo despues de autorizacion, validacion y rate limit;
- no aceptar `id` desde el formulario de alta;
- no insertar manualmente en `perfiles` durante el alta completa;
- limitar las columnas actualizables;
- no permitir que el sistema quede sin ningun `admin` activo;
- no permitir eliminacion fisica;
- mantener errores y logs sanitizados.

## Historial de Implementacion de Fase 12

| Subfase | Alcance |
| --- | --- |
| 12.1 | Diagnostico y decision arquitectonica. |
| 12.2 | Listado read-only de usuarios internos para `admin`. Implementado sobre `public.perfiles`, con filtros GET por nombre/telefono, rol y estado activo. |
| 12.3 | Detalle read-only de usuario interno. Implementado sobre `public.perfiles`, con validacion de UUID y 404 para IDs invalidos o inexistentes. |
| 12.4 | Edicion de perfil operativo: nombre, telefono, avatar, rol y estado. Implementada con guardas para no dejar el sistema sin administrador activo. |
| 12.5 | Creacion legacy de perfil interno para usuario Auth existente. Retirada del flujo vigente tras conectar el alta segura. |
| 12.6 | Revision de seguridad, pruebas y documentacion final. |
| 12.7 | Conexion productiva de la creacion administrativa completa a Server Action/UI con correo y contrasena temporal. |
| Futura | Cambio inicial obligatorio de contrasena y onboarding protegido. |

## Estados Implementados por Subfase

### 12.2 Listado

El listado interno de usuarios esta implementado en
`/dashboard/configuracion/usuarios` para perfiles con rol `admin`.

La consulta se realiza server-side mediante el cliente normal de Supabase y
respeta RLS. Selecciona unicamente columnas de `public.perfiles`: `id`,
`full_name`, `role`, `phone`, `avatar_url`, `is_active`,
`must_change_password`, `created_at` y `updated_at`.

Filtros disponibles por GET:

- `q`: busca por nombre o telefono.
- `role`: acepta `admin`, `supervisor` o `trabajador`.
- `active`: acepta `true` o `false`.

El listado no consulta `auth.users`, no muestra email, no edita perfiles, no
cambia roles, no activa o desactiva perfiles y no usa service role key. Muestra
el estado de cambio inicial pendiente cuando `must_change_password = true`.

### 12.3 Detalle

La carga read-only de usuario por UUID alimenta la edicion de perfiles desde
`/dashboard/configuracion/usuarios/[id]/editar`.

El servicio valida formato UUID, valida `usuarios.view` y consulta unicamente
`public.perfiles` con `id`, `full_name`, `role`, `phone`, `avatar_url`,
`is_active`, `must_change_password`, `created_at` y `updated_at`.

No consulta `auth.users`, no muestra email, no crea usuarios y no usa service
role key.

### 12.4 Edicion

La edicion controlada de perfiles internos esta implementada para perfiles con
rol `admin`.

Campos editables:

- `full_name`;
- `phone`;
- `avatar_url`;
- `role`;
- `is_active`.

La edicion usa Server Actions y un servicio server-side que valida
`usuarios.manage`, valida UUID, carga el perfil objetivo desde
`public.perfiles`, valida input y actualiza unicamente los campos permitidos. No
acepta `id`, `created_at` ni `updated_at` desde el formulario.

Protecciones implementadas:

- un admin no puede desactivarse a si mismo;
- un admin no puede quitarse su propio rol `admin`;
- no se puede desactivar el ultimo admin activo;
- no se puede cambiar el rol del ultimo admin activo a `supervisor` o `trabajador`;
- cualquier edicion sobre admins activos verifica que siga existiendo al menos un admin activo.

### 12.5 Flujo Legacy Retirado

La creacion manual de perfiles por UUID de usuario Auth existente queda retirada
del flujo vigente. Ya no hay formulario productivo que pida el UUID Auth ni
Server Action que inserte directamente la fila de `public.perfiles`.

### 12.7 Alta Segura

El alta administrativa segura esta implementada desde el dialogo de Usuarios. El
formulario crea el acceso Auth y el perfil interno en un solo flujo server-side:
Server Action -> `createInternalUser()` -> Auth Admin -> trigger de perfil.

El usuario nuevo queda activo y con `must_change_password = true`. La pantalla
de cambio inicial de contrasena todavia no esta implementada, por lo que esta
rama no debe considerarse lista para merge productivo hasta completar ese
onboarding.
