# Reglas de seguridad

## Reglas criticas

- No uses `service_role` en la aplicacion.
- No agregues `SUPABASE_SERVICE_ROLE_KEY`.
- No consultes `auth.users` desde codigo de app.
- No expongas `file_path`.
- No expongas metadata sensible.
- No abras acceso anonimo directo a tablas internas.
- No confies solo en UI para permisos.
- RLS debe ser defensa final.
- Las rutas publicas deben devolver DTOs controlados.

## Rutas publicas

Rutas publicas actuales:

- `/solicitud`
- `/estado`

Reglas:

- No exponer UUIDs internos innecesarios.
- No exponer rutas privadas de Storage.
- No mostrar informacion interna.
- No mostrar informacion de pagos en tracking publico salvo decision futura explicita.
- Manejar errores de forma segura.

## Archivos

- Los archivos son privados por defecto.
- Las descargas internas deben ser controladas.
- Las signed URLs deben generarse solo desde servidor.
- `file_path` debe permanecer solo server-side.
- La UI no debe recibir rutas internas sensibles.

## Permisos

- `admin` tiene control total.
- `supervisor` gestiona operacion.
- `trabajador` solo accede a lo asignado segun reglas vigentes.
- Las acciones sensibles deben validar perfil activo y permisos server-side.
- La base de datos debe reforzar reglas con RLS/RPC cuando aplique.

## Documentos relacionados

- `docs/PERMISSIONS_MODEL.md`
- `docs/STORAGE_MODEL.md`
- `docs/PUBLIC_REQUEST_FLOW.md`
