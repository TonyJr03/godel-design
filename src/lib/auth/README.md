# Auth interno

`src/lib/auth` centraliza el acceso al usuario autenticado y al perfil interno
activo. Es una capa server-side: no crea usuarios Auth, no consulta
`auth.users`, no usa `service_role` y no expone credenciales.

## Contratos

- `getCurrentUser()` devuelve el usuario de Supabase Auth obtenido mediante el
  cliente server-side normal.
- `getCurrentProfile()` devuelve el perfil interno activo asociado al usuario
  autenticado, o `null` si no hay sesion, no hay perfil o el perfil esta
  inactivo.
- `getCurrentUserWithProfile()` devuelve ambos contratos juntos cuando se
  necesita identidad Auth y perfil interno activo en la misma operacion.

`CurrentProfile` es deliberadamente minimo:

- `id`
- `role`
- `is_active`

Estos campos cubren los usos actuales de autorizacion, auditoria interna basica
y asociaciones server-side. Los datos completos de perfiles internos pertenecen
al dominio `src/lib/usuarios`, no al helper transversal de sesion.

## Relacion con permisos

`getCurrentProfile()` solo confirma que existe un perfil interno activo. No
autoriza acciones por si mismo. Cada servicio o pagina server-side debe validar
el permiso requerido con `src/lib/permissions`.

## Relacion con RLS y proxy

El proxy de Next.js tambien valida sesion, perfil activo y acceso por ruta antes
de dejar entrar al dashboard. Esa proteccion mejora la experiencia y bloquea
acceso directo por URL, pero no reemplaza las validaciones server-side ni RLS.

RLS sigue siendo la defensa final en Supabase. Cualquier cambio que modifique
roles, permisos, rutas o visibilidad de perfiles debe hacerse en una fase
explicita que revise TypeScript, SQL/RLS, documentacion y QA juntos.
