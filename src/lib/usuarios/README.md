# Usuarios y perfiles

`src/lib/usuarios` contiene la logica server-side del dominio interno de
usuarios/perfiles del dashboard. La app gestiona filas de `public.perfiles`;
Supabase Auth sigue siendo la autoridad de identidad y credenciales.

Este dominio no crea usuarios Auth, no consulta `auth.users`, no pide email ni
contrasena, no usa `service_role` y no agrega `SUPABASE_SERVICE_ROLE_KEY`.

## Mapa de archivos

- `index.ts`: barrel publico del dominio.
- `types.ts`: DTOs internos de listado, detalle y formulario.
- `roles.ts`: roles internos soportados, derivados de tipos generados.
- `user-validation.ts`: normalizacion y validacion de input editable.
- `list-internal-users.ts`: listado interno de perfiles.
- `get-internal-user-by-id.ts`: detalle interno por UUID de perfil.
- `create-internal-user-profile.ts`: creacion de fila en `public.perfiles`.
- `update-internal-user.ts`: actualizacion de perfil, rol y estado.

## Rutas internas

- `/dashboard/usuarios`: listado interno de perfiles.
- `/dashboard/usuarios/nuevo`: formulario para crear perfil interno de un
  usuario Auth existente.
- `/dashboard/usuarios/[id]`: detalle interno del perfil.
- `/dashboard/usuarios/[id]/editar`: edicion interna de perfil, rol y estado.

Las rutas viven en `src/app/dashboard/usuarios` y deben seguir delegando en
servicios de `src/lib/usuarios`. Las Server Actions son adaptadores finos:
leen `FormData`, llaman servicios y revalidan rutas.

## Componentes principales

- `InternalUsersList`: listado responsive de perfiles internos.
- `InternalUserDetail`: detalle interno de perfil.
- `UserCreateForm`: formulario de creacion de perfil.
- `UserEditForm`: formulario de edicion de perfil, rol y estado.

Los componentes son UI. No consultan Supabase, no consultan `auth.users`, no
deciden permisos criticos y no deben reutilizarse en rutas publicas.

## Servicios

- `listInternalUsers` requiere `usuarios.view` y devuelve perfiles internos
  para dashboard.
- `getInternalUserById` valida UUID, requiere `usuarios.view` y devuelve el
  detalle interno del perfil.
- `createInternalUserProfile` requiere `usuarios.manage`, valida input e
  inserta solo en `public.perfiles`.
- `updateInternalUser` requiere `usuarios.manage`, valida UUID e input, y
  actualiza solo campos permitidos de perfil.

La creacion de un perfil no crea credenciales Auth. El `id` recibido debe
corresponder a un usuario Auth existente por la foreign key de base de datos.
Los errores de FK o unique se devuelven como mensajes seguros.

## Tipos, roles y validacion

`types.ts` centraliza los DTOs internos del dominio. Los roles se obtienen desde
`roles.ts` para mantener alineacion con los tipos generados de base de datos.

`user-validation.ts` normaliza texto, valida UUID, valida rol y convierte el
estado activo/inactivo desde los valores de formulario esperados. Los cambios
de rol o de estado son sensibles y deben permanecer detras de
`usuarios.manage`.

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
- el sistema debe conservar al menos un administrador activo.

Estas guardas viven en servidor y se complementan con restricciones/triggers de
base de datos. No deben moverse a componentes ni relajarse como cambio menor de
UI.

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
- Mantener `usuarios.view` para lecturas internas.
- Mantener `usuarios.manage` para creacion/edicion.
- Usar RLS como defensa final.
- No usar `service_role`.
- No agregar `SUPABASE_SERVICE_ROLE_KEY`.
- No consultar `auth.users`.
- No consultar Supabase desde componentes cliente.
- No cambiar roles o permisos sin fase explicita con TypeScript, SQL/RLS,
  documentacion y QA por rol.

## QA e2e

`tests/e2e/usuarios.spec.ts` cubre rutas focales de usuarios para los roles
principales. Esa cobertura complementa `full-visual-qa.spec.ts` y debe
mantenerse pequena y centrada en permisos, visibilidad y errores seguros.

## Que no hacer

- No crear usuarios Auth desde la app.
- No pedir email/password en formularios de perfiles internos.
- No consultar `auth.users` desde app code.
- No usar `service_role` para saltar RLS.
- No exponer perfiles internos en rutas publicas.
- No mover permisos a componentes.
- No confiar en ocultar botones como seguridad.
- No cambiar la matriz de permisos sin fase explicita.
- No crear `src/services`.
- No mezclar refactors de usuarios con cambios de auth, RLS o permisos.
