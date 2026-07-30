# Usuarios y perfiles

`src/lib/usuarios` contiene la logica server-side del dominio interno de
usuarios/perfiles del dashboard. Supabase Auth sigue siendo la autoridad de
identidad y credenciales; `public.perfiles` sigue siendo la autoridad de rol,
estado operativo y datos internos.

El dominio mantiene el flujo legacy de perfiles por UUID y suma
`createInternalUser` como servicio backend aislado para crear usuarios Auth con
contraseña temporal. El formulario actual todavia no consume ese servicio.

## Mapa de archivos

- `index.ts`: barrel publico del dominio.
- `types.ts`: DTOs internos de listado, detalle y formulario.
- `roles.ts`: roles internos soportados, derivados de tipos generados.
- `user-validation.ts`: normalizacion y validacion de input editable.
- `list-internal-users.ts`: listado interno de perfiles.
- `get-internal-user-by-id.ts`: detalle interno por UUID de perfil.
- `create-internal-user.ts`: alta administrativa Auth + perfil por trigger.
- `create-internal-user-profile.ts`: creacion de fila en `public.perfiles`.
- `update-internal-user.ts`: actualizacion de perfil, rol y estado.

## Rutas internas

- `/dashboard/configuracion/usuarios`: listado interno de perfiles.
- `/dashboard/configuracion/usuarios/nuevo`: formulario para crear perfil interno de un
  usuario Auth existente.
- `/dashboard/configuracion/usuarios/[id]/editar`: edicion interna de perfil, rol y estado.

Las rutas viven en `src/app/(interno)/dashboard/configuracion/usuarios` y deben
seguir delegando en servicios de `src/lib/usuarios`. Las Server Actions son
adaptadores finos: leen `FormData`, llaman servicios y revalidan rutas.

## Componentes principales

- `InternalUsersList`: listado responsive de perfiles internos.
- `UserCreateForm`: formulario de creacion de perfil.
- `UserEditForm`: formulario de edicion de perfil, rol y estado.

Los componentes son UI. No consultan Supabase, no consultan `auth.users`, no
deciden permisos criticos y no deben reutilizarse en rutas publicas.

## Servicios

- `listInternalUsers` requiere `usuarios.view` y devuelve perfiles internos
  para dashboard.
- `getInternalUserById` valida UUID, requiere `usuarios.view` y devuelve el
  detalle interno del perfil.
- `createInternalUser` autentica al admin actual, valida que su perfil exista,
  este activo, no tenga `must_change_password` pendiente y posea
  `usuarios.manage`; despues valida correo, contraseña temporal y perfil antes
  de llamar a Admin API.
- `createInternalUserProfile` requiere `usuarios.manage`, valida input e
  inserta solo en `public.perfiles`.
- `updateInternalUser` requiere `usuarios.manage`, valida UUID e input, y
  actualiza solo campos permitidos de perfil.

`createInternalUser` usa exclusivamente `app_metadata.godel_provisioning` con
`version = 1`, `source = "admin_dashboard"`, datos de perfil normalizados y
`created_by` del admin operativo. La llamada usa `email_confirm = true` para
confirmacion administrativa sin envio de email. No usa `user_metadata`, no
inserta manualmente en `perfiles`, no ejecuta RPC de cambio inicial, no devuelve
password ni objeto Auth completo y retorna solo `{ userId }`.

Supabase Auth local puede aplicar `app_metadata` despues del `INSERT` inicial
de `auth.users`. La base por eso mantiene dos triggers complementarios:
`AFTER INSERT` y `AFTER UPDATE OF raw_app_meta_data` cuando
`godel_provisioning` aparece por primera vez. Ambos llaman la misma funcion
privilegiada de provisionamiento y conservan `app_metadata` como metadata
administrativa.

`createInternalUser` no considera suficiente el objeto Auth retornado. Despues
de validar el UUID consulta `public.perfiles` con el cliente server-side normal
y verifica `id`, nombre, opcionales, rol, `is_active = true`,
`must_change_password = true` y `created_by`. Si falta el perfil o no coincide,
intenta eliminar compensatoriamente el Auth user y devuelve
`provisioning_error` con un mensaje generico. Una identidad sin perfil nunca es
resultado exitoso del servicio.

La creacion legacy de un perfil no crea credenciales Auth. El `id` recibido debe
corresponder a un usuario Auth existente por la foreign key de base de datos.
Los errores de FK o unique se devuelven como mensajes seguros.

## Tipos, roles y validacion

`types.ts` centraliza los DTOs internos del dominio. Los roles se obtienen desde
`roles.ts` para mantener alineacion con los tipos generados de base de datos.

`user-validation.ts` conserva los contratos legacy y agrega un contrato separado
para alta completa: normaliza correo con `trim` y minusculas, no altera la
contraseña temporal, exige confirmacion exacta y requiere confirmacion explicita
cuando el rol nuevo es `admin`.

## Revalidacion

Las rutas de usuarios se revalidan con helpers centralizados en
`src/lib/actions/revalidation.ts`:

- `revalidateUsuariosList()`
- `revalidateUsuarioDetail(userId)`
- `revalidateUsuarioEdit(userId)`

Las actions de usuarios deben usar esos helpers en lugar de repetir rutas a
mano.

## Guardas admin

La edicion de usuarios conserva guardas criticas:

- un administrador no puede desactivarse a si mismo;
- un administrador no puede quitarse su propio rol admin;
- el sistema debe conservar al menos un administrador operativo.

Estas guardas viven en servidor y se complementan con restricciones/triggers de
base de datos. No deben moverse a componentes ni relajarse como cambio menor de
UI.

Un administrador operativo es `role = admin`, `is_active = true` y
`must_change_password = false`. Un admin con contraseña temporal pendiente no
impide actualizar al ultimo administrador real.

## Datos visibles en dashboard

En rutas internas puede mostrarse:

- nombre para mostrar;
- rol;
- estado activo/inactivo;
- avatar sanitizado;
- fecha de creacion;
- UUID de perfil/Auth solo dentro del dashboard cuando el componente lo
  necesite.

La gestion interna de perfiles no muestra ni edita email, password u otros
datos de Supabase Auth.

## Seguridad

- Validar perfil activo y permisos en servidor.
- Rechazar operaciones administrativas si el admin actual conserva
  `must_change_password = true`.
- Mantener `usuarios.view` para lecturas internas.
- Mantener `usuarios.manage` para creacion/edicion.
- Usar RLS como defensa final.
- Usar `createAdminClient` solo en `create-internal-user.ts` y solo para Admin
  API de Auth: `createUser` y compensacion `deleteUser`.
- Consultar `perfiles` desde `createInternalUser` con el cliente server-side
  normal, no con el cliente Admin.
- No agregar `SUPABASE_SERVICE_ROLE_KEY`.
- No consultar `auth.users`.
- No consultar Supabase desde componentes cliente.
- No insertar manualmente en `perfiles` desde el alta completa; el trigger de
  Auth es la unica ruta de provisionamiento.
- Mantener errores y logs sanitizados: los logs pueden incluir solo contexto,
  nombre, codigo y estado; nunca correo, contraseña, metadata, tokens o payloads.
- No cambiar roles o permisos sin fase explicita con TypeScript, SQL/RLS,
  documentacion y QA por rol.

## QA e2e

`tests/e2e/usuarios.spec.ts` cubre rutas focales de usuarios para los roles
principales. Esa cobertura complementa `full-visual-qa.spec.ts` y debe
mantenerse pequena y centrada en permisos, visibilidad y errores seguros.

## Que no hacer

- No conectar todavia `createInternalUser` al formulario actual.
- No consultar `auth.users` desde app code.
- No usar el cliente Admin para consultas de tablas.
- No exponer perfiles internos en rutas publicas.
- No mover permisos a componentes.
- No confiar en ocultar botones como seguridad.
- No cambiar la matriz de permisos sin fase explicita.
- No crear `src/services`.
- No mezclar refactors de usuarios con cambios de auth, RLS o permisos.

## Pendiente antes de UI

Antes de conectar el formulario productivo faltan rate limiting funcional,
auditoria de operaciones de alta, Server Action fina, pantalla de cambio inicial
de contraseña y QA E2E del flujo completo.
