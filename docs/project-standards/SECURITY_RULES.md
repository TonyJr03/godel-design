# Reglas de seguridad

## Cliente normal

- El código normal de aplicación usa clientes Supabase públicos o ligados a la
  sesión del usuario.
- No se consulta Supabase desde Client Components.
- No se consulta `auth.users` desde código normal de aplicación.
- No se usa cliente administrativo como ruta general hacia tablas de negocio,
  RPCs de negocio ni Storage.
- Las acciones sensibles validan perfil activo y permisos server-side.
- RLS, grants, RPCs y policies de Storage quedan como defensa final.

## Adaptador Auth Admin

El único uso administrativo permitido es el adaptador Auth Admin server-only ya
existente para ciclo de identidad:

- alta administrativa de usuarios internos;
- compensación cuando falla el provisioning;
- reset administrativo de contraseña;
- finalización del cambio inicial obligatorio cuando aplique.

Este adaptador no autoriza consultas generales a tablas de negocio, no reemplaza
RLS y no debe convertirse en dependencia de componentes, Server Actions pesadas
o servicios de dominio generales.

## Secretos

- No agregar ni usar `SUPABASE_SERVICE_ROLE_KEY` como variable de aplicación.
- `SUPABASE_SECRET_KEY` solo puede vivir en entorno server-only y ser consumida
  por el adaptador Auth Admin existente.
- Nunca exponer, serializar, enviar al navegador, registrar ni devolver
  credenciales administrativas.
- No crear nuevos clientes admin sin decisión explícita de arquitectura.

## Rutas públicas

Rutas públicas actuales:

- `/solicitud`
- `/estado`

Reglas:

- No exponer UUIDs internos innecesarios.
- No exponer rutas privadas de Storage.
- No mostrar información interna.
- No mostrar información de pagos en tracking público salvo decisión futura explícita.
- Manejar errores de forma segura.
- Usar DTOs controlados.
- Resolver antiabuso antes de producción pública.

## Archivos

- Los archivos son privados por defecto.
- Las descargas internas deben ser controladas.
- Las signed URLs deben generarse solo desde servidor.
- `file_path` debe permanecer server-side.
- La UI no debe recibir rutas internas sensibles, buckets privados ni metadata cruda.
- No usar cliente admin para Storage desde flujos normales de aplicación.

## Permisos

- `admin` tiene control total operativo.
- `supervisor` gestiona operación.
- `trabajador` solo accede a lo asignado según reglas vigentes.
- Las acciones sensibles deben validar perfil activo y permisos server-side.
- La base de datos debe reforzar reglas con RLS/RPC cuando aplique.

## Documentos relacionados

- `../PERMISSIONS_MODEL.md`
- `../STORAGE_MODEL.md`
- `../PUBLIC_REQUEST_FLOW.md`
