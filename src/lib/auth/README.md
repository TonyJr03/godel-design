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

La consulta de perfil selecciona explicitamente `id`, `role` e `is_active`; no
usa `select("*")`. Si no hay sesion, no hay perfil o el perfil esta inactivo,
los helpers devuelven `null` sin filtrar detalles internos de Supabase.

## Relacion con Supabase Auth

Supabase Auth identifica al usuario autenticado y administra credenciales. Esta
capa solo lee el usuario actual mediante el cliente server-side normal y luego
resuelve su fila activa en `public.perfiles`.

La aplicacion no consulta `auth.users` desde app code. Cualquier flujo que
necesite crear credenciales Auth debe quedar fuera de este dominio y tener una
fase explicita de seguridad.

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
