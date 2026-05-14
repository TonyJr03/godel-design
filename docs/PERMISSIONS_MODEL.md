# Modelo de Roles y Permisos — Godel Design

## Proposito

Este documento define la matriz inicial de roles y permisos internos del sistema web de gestion operativa de Godel Diseno. Su objetivo es dejar una referencia clara para mantenimiento, futuras fases y revisiones de seguridad.

## Conceptos base

| Concepto | Descripcion |
| --- | --- |
| Autenticacion | Confirma la identidad del usuario mediante Supabase Auth. |
| Perfil interno activo | Confirma que el usuario autenticado tiene una fila en `public.profiles` con `is_active = true`. |
| Autorizacion por rol | Decide que puede ver o ejecutar un usuario interno segun `profiles.role`. |
| Navegacion visible | Oculta o muestra enlaces del dashboard segun rol. Es una mejora de UX, no una barrera de seguridad suficiente. |
| Proteccion de rutas | Bloquea acceso manual por URL a secciones no permitidas mediante el proxy. |
| Row Level Security | Politicas de Supabase que protegen los datos en la base de datos. Es la ultima linea de defensa. |

## Roles iniciales

| Rol | Responsabilidad general |
| --- | --- |
| `admin` | Administra el sistema interno, usuarios, configuracion y todos los modulos operativos. |
| `supervisor` | Gestiona la operacion diaria: solicitudes, pedidos y clientes. |
| `trabajador` | Ejecuta trabajo asignado sobre pedidos y actualiza estados cuando los modulos reales lo permitan. |

## Matriz de navegacion por seccion

| Seccion | Admin | Supervisor | Trabajador |
| --- | --- | --- | --- |
| Dashboard | Si | Si | Si |
| Solicitudes | Si | Si | No |
| Pedidos | Si | Si | Si |
| Clientes | Si | Si | No |
| Usuarios | Si | No | No |
| Configuracion | Si | No | No |

## Matriz de permisos internos

| Permiso | Admin | Supervisor | Trabajador |
| --- | --- | --- | --- |
| `dashboard.view` | Si | Si | Si |
| `solicitudes.view` | Si | Si | No |
| `solicitudes.manage` | Si | Si | No |
| `pedidos.view` | Si | Si | Si |
| `pedidos.manage` | Si | Si | No |
| `pedidos.change_status` | Si | Si | Si |
| `clientes.view` | Si | Si | No |
| `clientes.manage` | Si | Si | No |
| `usuarios.view` | Si | No | No |
| `usuarios.manage` | Si | No | No |
| `configuracion.view` | Si | No | No |
| `configuracion.manage` | Si | No | No |

## Reglas por rol

### Admin

- Tiene acceso completo.
- Puede gestionar usuarios.
- Puede acceder a configuracion.
- Puede gestionar solicitudes, pedidos y clientes.

### Supervisor

- Puede gestionar solicitudes.
- Puede gestionar pedidos.
- Puede gestionar clientes.
- No puede gestionar usuarios.
- No puede acceder a configuracion administrativa.

### Trabajador

- Puede ver dashboard.
- Puede ver pedidos.
- Puede cambiar estado de pedidos asignados cuando los modulos reales lo implementen.
- No puede ver solicitudes.
- No puede ver clientes.
- No puede gestionar usuarios.
- No puede acceder a configuracion.

## Proteccion de rutas

`canAccessDashboardRoute(role, pathname)` es la fuente central para decidir acceso a rutas internas del dashboard. La misma funcion se usa para navegacion visible y para proteccion por URL directa.

| Ruta | Roles permitidos |
| --- | --- |
| `/dashboard` | `admin`, `supervisor`, `trabajador` |
| `/dashboard/solicitudes` | `admin`, `supervisor` |
| `/dashboard/pedidos` | `admin`, `supervisor`, `trabajador` |
| `/dashboard/clientes` | `admin`, `supervisor` |
| `/dashboard/usuarios` | `admin` |
| `/dashboard/configuracion` | `admin` |

Las subrutas heredan la regla de la seccion padre. Por ejemplo, `/dashboard/pedidos/123` usa la regla de `/dashboard/pedidos`.

Las rutas desconocidas bajo `/dashboard` se bloquean por defecto. Si se agrega una nueva ruta interna, debe registrarse en `src/lib/permissions/routes.ts`.

## Paginas especiales de acceso

| Ruta | Uso |
| --- | --- |
| `/login` | Acceso para autenticacion. |
| `/acceso-denegado` | Usuario autenticado sin perfil interno activo. |
| `/sin-permisos` | Usuario interno activo sin permiso para una seccion. |

## Capas de seguridad

El sistema usa varias capas complementarias:

1. Supabase Auth.
2. `profiles.is_active`.
3. Helpers de permisos.
4. Navegacion filtrada.
5. Proxy de rutas.
6. RLS en base de datos.

Ocultar enlaces en el sidebar es solo UX. No debe considerarse seguridad suficiente ni reemplaza la proteccion por rutas, las validaciones server-side o RLS.

## Relacion con RLS

Los helpers de permisos y la proteccion de rutas no sustituyen Row Level Security.

- RLS sigue siendo la ultima linea de defensa.
- Las consultas futuras deben respetar permisos.
- Las acciones server-side deben validar permisos antes de modificar datos.
- No se debe confiar solo en el frontend.

## Uso esperado en futuros modulos

Cuando se implementen modulos reales:

- Las paginas server-side deben leer el perfil actual.
- Las acciones server-side deben validar permisos.
- Las consultas deben apoyarse en RLS.
- Los componentes cliente no deben decidir permisos criticos por si solos.

## Que no esta incluido todavia

- Gestion real de usuarios.
- Permisos granulares por pedido especifico en UI.
- Asignacion real de trabajadores desde interfaz.
- Filtrado real de pedidos asignados en listados.
- Auditoria avanzada.
- Permisos configurables desde base de datos.
- Panel para editar roles.

## Pendiente para fases posteriores

- Fase 8 y Fase 9 aplicaran estos permisos en pedidos y asignacion de trabajadores.
- Fase 12 implementara gestion de usuarios internos.
- Fases futuras podran refinar permisos si la operacion real lo exige.

## Cierre

La siguiente subfase sera la revision final de Fase 4 antes de pasar a solicitudes publicas.
