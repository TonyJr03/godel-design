# Usuarios y perfiles

`src/lib/usuarios` contiene la lógica server-side del dominio interno de
usuarios/perfiles del dashboard. Supabase Auth es la autoridad de identidad y
credenciales; `public.perfiles` es la autoridad de rol, estado operativo y datos
internos.

El alta productiva vigente crea el usuario Auth y el perfil interno desde un
flujo server-side único: Server Action -> `createInternalUser()` -> Auth Admin
-> trigger de provisionamiento.

## Mapa de archivos

- `index.ts`: barrel público del dominio.
- `types.ts`: DTOs internos de listado, detalle y formulario.
- `roles.ts`: roles internos soportados, derivados de tipos generados.
- `user-validation.ts`: normalización y validación de input editable y de alta.
- `list-internal-users.ts`: listado interno de usuarios desde `public.perfiles`.
- `get-internal-user-by-id.ts`: detalle interno por UUID de perfil/Auth.
- `create-internal-user.ts`: alta administrativa Auth + perfil por trigger.
- `update-internal-user.ts`: actualización de perfil, rol y estado.

## Rutas internas

- `/dashboard/configuracion/usuarios`: listado interno y diálogo de alta segura.
- `/dashboard/configuracion/usuarios/[id]/editar`: edición interna de perfil, rol y estado.

Las rutas viven en `src/app/(interno)/dashboard/configuracion/usuarios` y deben
seguir delegando en servicios de `src/lib/usuarios`. Las Server Actions son
adaptadores finos: leen `FormData`, llaman servicios y revalidan rutas.

## Componentes principales

- `InternalUsersList`: listado responsive de usuarios internos, incluyendo el
  estado de cambio inicial pendiente.
- `UserCreateForm`: formulario de alta segura con correo y contraseña temporal.
- `UserEditForm`: formulario de edición de perfil, rol y estado.

Los componentes son UI. No consultan Supabase, no consultan `auth.users`, no
deciden permisos críticos y no deben reutilizarse en rutas públicas.

## Servicios

- `listInternalUsers` requiere `usuarios.view` y devuelve perfiles internos para dashboard.
- `getInternalUserById` valida UUID, requiere `usuarios.view` y devuelve el detalle interno del perfil.
- `createInternalUser` autentica al admin actual, valida que su perfil exista,
  esté activo, no tenga `must_change_password` pendiente y posea
  `usuarios.manage`; después valida correo, contraseña temporal y perfil,
  reserva auditoría/rate limit con el cliente server-side normal y recién
  entonces llama a Admin API.
- `updateInternalUser` requiere `usuarios.manage`, valida UUID e input, y
  actualiza solo campos permitidos de perfil.

`createInternalUser` usa exclusivamente `app_metadata.godel_provisioning` con
`version = 1`, `source = "admin_dashboard"`, datos de perfil normalizados y
`created_by` del admin operativo. La llamada usa `email_confirm = true` para
confirmación administrativa sin envío de email. No usa `user_metadata`, no
inserta manualmente en `perfiles`, no ejecuta RPC de cambio inicial, no devuelve
password ni objeto Auth completo y retorna solo `{ userId }`.

Supabase Auth local puede aplicar `app_metadata` después del `INSERT` inicial
de `auth.users`. La base por eso mantiene dos triggers complementarios:
`AFTER INSERT` y `AFTER UPDATE OF raw_app_meta_data` cuando
`godel_provisioning` aparece por primera vez. Ambos llaman la misma función
privilegiada de provisionamiento y conservan `app_metadata` como metadata
administrativa.

`createInternalUser` no considera suficiente el objeto Auth retornado. Después
de validar el UUID consulta `public.perfiles` con el cliente server-side normal
y verifica `id`, nombre, opcionales, rol, `is_active = true`,
`must_change_password = true` y `created_by`. Si falta el perfil o no coincide,
intenta eliminar compensatoriamente el Auth user y devuelve
`provisioning_error` con un mensaje genérico.

Antes de construir `createAdminClient`, `createInternalUser` llama
`public.begin_internal_user_creation_attempt` con el cliente server-side normal.
La RPC registra el intento en `private.internal_user_creation_audit` y aplica
rate limiting de 5 intentos reales por admin en 10 minutos y 20 intentos reales
globales en 1 hora. Si se excede una ventana, el servicio devuelve
`rate_limited` sin invocar Auth Admin.

Después de Auth Admin y de la verificación de perfil, el servicio llama
`public.complete_internal_user_creation_attempt` para cerrar la auditoría como
`succeeded`, `failed` o `compensation_failed`. La auditoría no guarda correo,
contraseña, metadata, tokens, payloads completos ni mensajes externos. El éxito
funcional depende de Auth user creado y perfil correcto; el cierre `succeeded`
es de mejor esfuerzo. Si ese cierre falla, el usuario Auth y el perfil se
conservan, el servicio devuelve éxito y la fila `pending` queda como señal para
reconciliación operativa posterior.

El flujo legacy de crear una fila de `public.perfiles` por UUID Auth ya fue
retirado del dominio productivo. No debe reintroducirse como formulario,
servicio ni Server Action.

## Tipos, roles y validación

`types.ts` centraliza los DTOs internos del dominio. Los roles se obtienen desde
`roles.ts` para mantener alineación con los tipos generados de base de datos.

`user-validation.ts` mantiene el contrato de edición y el contrato de alta
completa: normaliza correo con `trim` y minúsculas, no altera la contraseña
temporal, exige confirmación exacta y requiere confirmación explícita cuando el
rol nuevo es `admin`.

## Revalidación

Las rutas de usuarios se revalidan con helpers centralizados en
`src/lib/actions/revalidation.ts`:

- `revalidateUsuariosList()`
- `revalidateUsuarioDetail(userId)`
- `revalidateUsuarioEdit(userId)`

Las actions de usuarios deben usar esos helpers en lugar de repetir rutas a
mano.

## Guardas admin

La edición de usuarios conserva guardas críticas:

- un administrador no puede desactivarse a sí mismo;
- un administrador no puede quitarse su propio rol admin;
- el sistema debe conservar al menos un administrador operativo.

Estas guardas viven en servidor y se complementan con restricciones/triggers de
base de datos. No deben moverse a componentes ni relajarse como cambio menor de
UI.

Un administrador operativo es `role = admin`, `is_active = true` y
`must_change_password = false`. Un admin con contraseña temporal pendiente no
impide actualizar al último administrador real.

## Restablecimiento administrativo de contrasena temporal

El restablecimiento de contrasena es una operacion separada de la edicion normal
de perfil. No forma parte de `updateInternalUser`, no reutiliza
`UserEditForm` y no modifica `full_name`, `phone`, `avatar_url`, `role` ni el
estado activo original como dato de negocio.

La ruta productiva es:

1. dialogo `UserPasswordResetDialogButton`;
2. formulario `UserPasswordResetForm`;
3. Server Action `resetUserPasswordAction(userId, state, formData)`;
4. servicio server-only `resetInternalUserPassword()`;
5. RPC `public.begin_internal_user_password_reset`;
6. Auth Admin `getUserById` y `updateUserById`;
7. RPC `public.complete_internal_user_password_reset`.

El UUID objetivo se liga desde la pagina con `.bind(null, userId)` y no se lee
desde `FormData`. El formulario solo envia `password`,
`password_confirmation` y `confirm_reset`.

Solo un admin operativo con `usuarios.manage` puede ejecutar la operacion. El
servicio rechaza autorrestablecimiento, usuarios inexistentes, actores con
onboarding pendiente y usuarios sin permiso. Puede aplicarse sobre usuarios
activos o inactivos; si el usuario estaba inactivo, permanece inactivo despues
del exito. Si ya tenia `must_change_password = true`, la operacion reemplaza la
contrasena temporal pendiente y conserva el flag en `true`.

La RPC de inicio registra una auditoria privada, guarda `is_active` y
`must_change_password` previos, bloquea el perfil objetivo con `FOR UPDATE` y
lo deja temporalmente con `is_active = false` y `must_change_password = true`
antes de tocar Auth. Si Auth falla, la RPC de finalizacion restaura ambos
valores previos. Si Auth cambia la contrasena, la finalizacion exitosa restaura
solo `is_active` al valor anterior y mantiene `must_change_password = true`.

No se envia correo, invitacion, recuperacion ni magic link. El administrador
entrega la contrasena temporal por un canal externo seguro. La contrasena no se
almacena, no se registra, no se devuelve, no queda en estado React y se limpia
del DOM tras cada respuesta del formulario.

`resetInternalUserPassword` usa `createAdminClient()` exclusivamente para:

- `auth.admin.getUserById(targetId)`;
- `auth.admin.updateUserById(targetId, { password })`.

No usa el cliente Admin para tablas, Storage, Functions, RPCs, creacion,
eliminacion, invitaciones, enlaces ni listados. Las RPCs y las consultas de
postcondicion usan el cliente server-side normal con RLS.

La auditoria privada `private.internal_user_password_reset_audit` no guarda
email, contrasena, hash, nombre, telefono, avatar, metadata, token, sesion,
mensaje completo de proveedor ni stack. Sus estados son `pending`, `succeeded`,
`failed`, `rate_limited` y `attention_required`. Los rate limits son 3 intentos
reales por actor en 10 minutos, 3 intentos reales por objetivo en 1 hora y 20
intentos reales globales en 1 hora; `rate_limited` no extiende ventanas futuras.

`attention_required` representa un caso critico: la contrasena pudo cambiar en
Auth o no se pudo restaurar el perfil, y el usuario queda bloqueado
preventivamente con `is_active = false` y `must_change_password = true` para
reconciliacion manual. La recuperacion por correo queda fuera de alcance.

## Datos visibles en dashboard

En rutas internas puede mostrarse:

- nombre para mostrar;
- rol;
- estado activo/inactivo;
- estado de cambio inicial pendiente;
- avatar sanitizado;
- fecha de creación;
- UUID de perfil/Auth solo dentro del dashboard cuando el componente lo necesite.

La gestión interna de perfiles no muestra ni edita email, password u otros datos
de Supabase Auth.

## Seguridad

- Validar perfil activo y permisos en servidor.
- Rechazar operaciones administrativas si el admin actual conserva
  `must_change_password = true`.
- Mantener `usuarios.view` para lecturas internas.
- Mantener `usuarios.manage` para creación/edición.
- Usar RLS como defensa final.
- Usar `createAdminClient` solo en `create-internal-user.ts` y solo para Admin
  API de Auth: `createUser` y compensación `deleteUser`.
- Consultar `perfiles` desde `createInternalUser` con el cliente server-side
  normal, no con el cliente Admin.
- Usar el cliente server-side normal para las RPCs de auditoría/rate limiting de
  alta completa; nunca el cliente Admin.
- No agregar `SUPABASE_SERVICE_ROLE_KEY`.
- No consultar `auth.users`.
- No consultar Supabase desde componentes cliente.
- No insertar manualmente en `perfiles` desde el alta completa; el trigger de
  Auth es la única ruta de provisionamiento.
- Mantener errores y logs sanitizados: los logs pueden incluir solo contexto,
  nombre, código y estado; nunca correo, contraseña, metadata, tokens o payloads.
- No cambiar roles o permisos sin fase explícita con TypeScript, SQL/RLS,
  documentación y QA por rol.

## QA e2e

`tests/e2e/usuarios.spec.ts` cubre rutas focales de usuarios para los roles
principales. Esa cobertura complementa `full-visual-qa.spec.ts` y debe
mantenerse pequeña y centrada en permisos, visibilidad y errores seguros.

## Qué no hacer

- No reintroducir el alta legacy por UUID Auth manual.
- No consultar `auth.users` desde app code.
- No usar el cliente Admin para consultas de tablas.
- No exponer perfiles internos en rutas públicas.
- No mover permisos a componentes.
- No confiar en ocultar botones como seguridad.
- No cambiar la matriz de permisos sin fase explícita.
- No crear `src/services`.
- No mezclar refactors de usuarios con cambios de auth, RLS o permisos.
