# Permisos internos

`src/lib/permissions` centraliza la autorizacion interna por rol para el dashboard de Godel Diseno. En esta fase solo expone helpers puros: no consulta Supabase, no redirige, no cambia la navegacion y no protege rutas todavia.

## Matriz inicial

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

La autenticacion confirma la identidad del usuario mediante Supabase Auth. El perfil activo confirma que existe una fila interna en `public.profiles` para ese usuario y que `is_active = true`. La autorizacion por rol decide que puede ver o ejecutar ese perfil activo segun `profiles.role`.

Los helpers de permisos trabajan con roles validos del sistema y devuelven booleanos. Los helpers de rutas permiten evaluar si un rol puede acceder conceptualmente a una ruta del dashboard, pero no hacen redirecciones ni reemplazan los controles de servidor.

## Relacion con RLS

Estos helpers no reemplazan Row Level Security. RLS sigue siendo la ultima linea de defensa en Supabase y debe proteger los datos aunque exista una validacion previa en Next.js.

## Proximas subfases

La navegacion por rol se implementara en la siguiente subfase. La proteccion real de rutas por rol se implementara despues, reutilizando estas reglas sin mezclar UI, redirects y acceso a datos en esta capa.
