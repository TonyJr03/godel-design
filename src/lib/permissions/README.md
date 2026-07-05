# Permisos internos

`src/lib/permissions` centraliza la autorizacion interna por rol para el
dashboard de Godel Diseno. Expone helpers puros: no consulta Supabase, no
redirige y no protege rutas por si solo.

## Matriz actual

| Rol | Permisos |
| --- | --- |
| `admin` | Todos los permisos |
| `supervisor` | `dashboard.view`, `solicitudes.view`, `solicitudes.manage`, `pedidos.view`, `pedidos.manage`, `pedidos.change_status`, `clientes.view`, `clientes.manage` |
| `trabajador` | `dashboard.view`, `pedidos.view`, `pedidos.change_status` |

Permisos definidos:

- `dashboard.view`
- `solicitudes.view`
- `solicitudes.manage`
- `pedidos.view`
- `pedidos.manage`
- `pedidos.change_status`
- `clientes.view`
- `clientes.manage`
- `usuarios.view`
- `usuarios.manage`
- `configuracion.view`
- `configuracion.manage`

## Autenticacion, perfil y autorizacion

La autenticacion confirma la identidad del usuario mediante Supabase Auth. El
perfil activo confirma que existe una fila interna en `public.perfiles` para
ese usuario y que `is_active = true`. La autorizacion por rol decide que puede
ver o ejecutar ese perfil activo segun `perfiles.role`.

Los helpers de permisos trabajan con roles validos del sistema y devuelven
booleanos. Los helpers de rutas permiten evaluar si un rol puede acceder
conceptualmente a una ruta del dashboard, pero no hacen redirecciones ni
reemplazan los controles de servidor.

La navegacion del dashboard usa `canAccessDashboardRoute` para ocultar enlaces
no permitidos segun el rol. Esto es una mejora de UX, no la unica proteccion.

La proteccion real por URL directa se realiza en el proxy de Next.js. El proxy
tambien usa `canAccessDashboardRoute`, de modo que la navegacion y el bloqueo
de rutas comparten la misma fuente de reglas.

## Rutas del dashboard

La matriz de rutas actual queda asi:

| Ruta | Roles permitidos |
| --- | --- |
| `/dashboard` | `admin`, `supervisor`, `trabajador` |
| `/dashboard/solicitudes` | `admin`, `supervisor` |
| `/dashboard/pedidos` | `admin`, `supervisor`, `trabajador` |
| `/dashboard/clientes` | `admin`, `supervisor` |
| `/dashboard/usuarios` | `admin` |
| `/dashboard/configuracion` | `admin` |

Las subrutas heredan la regla del prefijo. En Beta 2.5.4 se mantiene
explicitamente el comportamiento de `/dashboard/pedidos/nuevo`: el rol
`trabajador` puede alcanzar la ruta por la regla general de
`/dashboard/pedidos`, y la pagina/action bloquean la operacion porque no tiene
`pedidos.manage`. Esta decision queda documentada como deuda posterior; no se
resuelve cambiando permisos ni rutas en esta subfase.

## Usuarios internos

`usuarios.view` y `usuarios.manage` pertenecen solo a `admin`. La ruta
`/dashboard/usuarios` tambien esta limitada a `admin`.

La gestion de usuarios internos opera sobre `public.perfiles`, sin crear
usuarios Auth desde la app y sin usar service role key. Las Server Actions del
modulo validan permisos en servidor antes de leer o modificar perfiles.

La subfase 12.2 usa `usuarios.view` para el listado read-only de perfiles
internos. La pagina carga datos server-side, consulta solo `public.perfiles`,
no consulta `auth.users` y no expone correos electronicos.

La subfase 12.3 usa el mismo permiso para el detalle read-only de
`/dashboard/usuarios/[id]`. El servicio valida UUID, respeta RLS y no habilita
acciones de edicion, cambio de rol ni activacion.

La subfase 12.4 usa `usuarios.manage` para editar perfiles internos en
`/dashboard/usuarios/[id]/editar`. El servicio actualiza solo campos permitidos
de `public.perfiles` y aplica guardas para conservar al menos un administrador
activo.

La subfase 12.5 usa `usuarios.manage` para crear perfiles internos en
`/dashboard/usuarios/nuevo`. La app inserta solo en `public.perfiles`, no crea
usuarios Auth, no consulta `auth.users`, no pide email ni contrasena y no usa
service role key.

## Relacion con RLS

Estos helpers no reemplazan Row Level Security. RLS sigue siendo la ultima
linea de defensa en Supabase y debe proteger los datos aunque exista una
validacion previa en Next.js.

## Cambios futuros de permisos

No se debe cambiar `PERMISSIONS_BY_ROLE`, `canAccessDashboardRoute`, el enum
`app_role`, RLS o el proxy como refactor aislado. Cualquier cambio funcional de
permisos debe tener fase explicita con TypeScript, SQL/RLS, documentacion y QA
por rol en la misma entrega.
