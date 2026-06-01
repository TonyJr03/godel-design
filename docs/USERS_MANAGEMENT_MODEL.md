# Modelo de Gestión de Usuarios Internos

## Propósito

La gestión de usuarios internos permite administrar quién puede entrar al dashboard operativo de Godel Diseño y qué rol tiene dentro del sistema. Esta fase se limita al personal interno; los clientes externos no tienen cuenta de usuario en el MVP actual.

El objetivo de la Fase 12 es construir una gestión segura sobre el modelo existente de Supabase Auth y `public.profiles`, sin abrir capacidades administrativas más amplias de las necesarias.

## Modelo Actual

Supabase Auth confirma la identidad del usuario. La tabla `public.profiles` define si ese usuario pertenece al sistema interno, qué rol tiene y si está activo.

La relación actual es:

| Capa | Responsabilidad |
| --- | --- |
| `auth.users` | Identidad, credenciales, sesión y datos propios de Auth. |
| `public.profiles` | Perfil operativo interno, rol y estado activo. |

`profiles.id` es una clave primaria `uuid` que referencia `auth.users.id` con `on delete cascade`. Esto implica que un perfil interno solo puede existir para un usuario Auth existente.

## Campos Reales de `profiles`

La tabla actual contiene:

| Campo | Tipo | Uso |
| --- | --- | --- |
| `id` | `uuid` | Identificador del perfil; referencia `auth.users.id`. |
| `full_name` | `text` | Nombre completo visible del usuario interno. |
| `role` | `app_role` | Rol operativo: `admin`, `supervisor` o `trabajador`. |
| `phone` | `text nullable` | Teléfono opcional. |
| `avatar_url` | `text nullable` | URL o ruta opcional de avatar. |
| `is_active` | `boolean` | Control de acceso interno sin eliminar el usuario Auth. |
| `created_at` | `timestamptz` | Fecha de creación del perfil. |
| `updated_at` | `timestamptz` | Fecha de última actualización; se mantiene con trigger. |

El MVP de gestión de perfiles no necesita campos adicionales. Para fases futuras podrían evaluarse `position`, `notes`, `last_seen_at` y `created_by`, pero no son necesarios para listar y mantener usuarios internos en la primera versión.

## Roles

El enum `public.app_role` define tres roles:

| Rol | Alcance actual |
| --- | --- |
| `admin` | Acceso completo al dashboard y a gestión de usuarios. |
| `supervisor` | Gestión operativa de solicitudes, pedidos y clientes; no gestiona usuarios. |
| `trabajador` | Acceso a pedidos asignados y acciones permitidas sobre esos pedidos; no gestiona usuarios. |

## RLS Actual sobre `profiles`

Las políticas actuales permiten:

| Operación | Quién puede hacerlo |
| --- | --- |
| `select` | El propio usuario, `admin`, `supervisor` y usuarios internos que necesiten ver perfiles asignados a pedidos accesibles. |
| `insert` | Solo `admin`, usando una sesión autenticada y activa. |
| `update` | Solo `admin`, usando una sesión autenticada y activa. |
| `delete` | No hay policy de eliminación; no se permite desde el cliente normal. |

La policy vigente de lectura es `profiles_select_visible`. Sustituyó a la policy inicial para permitir que trabajadores vean datos básicos del personal asignado a pedidos que pueden acceder, sin habilitar navegación general por todos los perfiles.

Aunque existen grants de tabla para `authenticated`, RLS es la defensa real que limita filas y operaciones.

## Permisos de Ruta y Dominio

La ruta `/dashboard/usuarios` está permitida solo para `admin` mediante `canAccessDashboardRoute(role, pathname)`. El proxy usa esa misma función para bloquear acceso directo por URL.

Los permisos de dominio ya existen:

| Permiso | Admin | Supervisor | Trabajador |
| --- | --- | --- | --- |
| `usuarios.view` | Sí | No | No |
| `usuarios.manage` | Sí | No | No |

Las futuras páginas y Server Actions del módulo deben validar estos permisos en servidor. La navegación visible no debe considerarse una barrera de seguridad suficiente.

## Qué Puede Hacerse Sin Service Role

Con el cliente server-side normal de Supabase y la sesión del admin autenticado se puede:

- listar perfiles internos permitidos por RLS;
- leer el detalle de un perfil;
- crear una fila en `public.profiles` para un usuario Auth que ya exista;
- editar `full_name`, `phone`, `avatar_url`, `role` e `is_active` en `profiles`;
- activar o desactivar perfiles internos;
- aplicar validaciones server-side para evitar dejar el sistema sin administradores.

Estas operaciones actúan sobre `public.profiles`, no sobre `auth.users`.

## Qué Requiere Service Role

La creación completa de usuarios Auth desde la app requiere usar la Admin API de Supabase Auth. Esa API necesita service role key en un contexto server-side muy protegido.

También requerirían service role u otro flujo administrativo equivalente:

- crear usuarios en `auth.users` desde la app;
- invitar usuarios mediante flujos administrativos de Auth;
- listar o consultar datos administrativos completos de Auth;
- cambiar contraseñas de otros usuarios desde la app;
- confirmar correos o manipular atributos administrativos de Auth.

La service role key ignora RLS. Por eso no debe agregarse durante el MVP de perfiles.

## Comparación de Opciones

### Opción A: Gestión de Perfiles Únicamente

Los usuarios Auth se crean manualmente desde Supabase Studio o CLI. La app permite al admin gestionar solo `public.profiles`.

Ventajas:

- No requiere service role key.
- Mantiene RLS como defensa final.
- Encaja con el modelo actual y con la política del proyecto de evitar service role.
- Reduce el riesgo de exposición de credenciales administrativas.
- Permite avanzar con listado, detalle, edición de rol y activación sin tocar Auth.

Riesgos y límites:

- Requiere un paso manual previo para crear el usuario Auth.
- La app no podrá mostrar emails de Auth si no se duplican o sincronizan en `profiles`.
- La experiencia de alta de usuario es menos cómoda.

Complejidad: baja.

### Opción B: Gestión Completa desde la App

El admin crea usuarios Auth directamente desde el sistema.

Ventajas:

- Mejor experiencia operativa para el admin.
- Centraliza el alta de usuarios en el dashboard.
- Permite automatizar creación de perfil y credenciales iniciales.

Riesgos y límites:

- Requiere service role key en servidor.
- La service role key ignora RLS, por lo que cualquier error en Server Actions o Route Handlers tendría mayor impacto.
- Exige controles adicionales: validación estricta de admin, rate limiting, auditoría, manejo seguro de errores y separación clara de cliente/servidor.
- Aumenta la superficie sensible del proyecto.

Complejidad: media-alta.

### Opción C: Sistema de Invitaciones

El admin invita usuarios y el usuario completa su alta.

Ventajas:

- Experiencia más profesional para producción.
- Evita manejar contraseñas iniciales manualmente.
- Puede integrarse con email y flujos de confirmación.

Riesgos y límites:

- Puede requerir service role o configuración de Auth/email.
- Necesita diseñar expiración, reenvío, estados de invitación y manejo de errores.
- Es más trabajo de producto, seguridad y soporte.

Complejidad: alta.

## Decisión Recomendada para el MVP

La recomendación para Godel Diseño es implementar primero la Opción A: gestión de perfiles únicamente.

Esta decisión es consistente con el estado actual del proyecto:

- ya existe Supabase Auth;
- ya existe `public.profiles`;
- ya existe RLS suficiente para que `admin` gestione perfiles;
- ya existen permisos `usuarios.view` y `usuarios.manage`;
- la ruta `/dashboard/usuarios` ya está limitada a `admin`;
- el proyecto evita service role key hasta ahora.

El MVP debe asumir que el usuario Auth se crea manualmente fuera de la app. Después, un admin podrá mantener el perfil interno desde el dashboard.

## Operaciones Permitidas para Fase 12

Subfases futuras deberían implementar:

- listar usuarios internos desde `profiles`;
- ver detalle de usuario;
- crear perfil interno para un usuario Auth existente;
- editar `full_name`;
- editar campos opcionales existentes como `phone` y `avatar_url` si se decide exponerlos;
- cambiar `role`;
- activar o desactivar `is_active`;
- impedir la autodesactivación accidental del único admin;
- impedir que el único admin se quite su propio rol `admin`;
- bloquear eliminación física de perfiles;
- validar todo en Server Actions con `usuarios.view` o `usuarios.manage`.

## Fuera de Alcance Inicial

Queda explícitamente fuera del MVP:

- crear usuarios Auth desde la app;
- enviar invitaciones desde la app;
- cambiar contraseñas desde la app;
- eliminar usuarios físicamente;
- exponer emails de Auth si no forman parte de `profiles`;
- agregar `SUPABASE_SERVICE_ROLE_KEY`;
- usar service role key;
- cambiar la matriz de permisos;
- convertir `profiles` en un sistema avanzado de recursos humanos.

## Consideraciones de Seguridad

Las futuras operaciones deben cumplir estas reglas:

- validar usuario autenticado y perfil activo en servidor;
- validar `usuarios.view` para lectura y `usuarios.manage` para cambios;
- usar el cliente server-side normal de Supabase;
- depender de RLS como defensa final;
- no aceptar `id` del usuario actual desde formularios cuando pueda obtenerse de la sesión;
- validar UUIDs y payloads antes de consultar o actualizar;
- limitar las columnas actualizables;
- no permitir que el sistema quede sin ningún `admin` activo;
- no permitir eliminación física en esta etapa;
- registrar decisiones sensibles en documentación antes de ampliar Auth.

## Subfases Propuestas de Fase 12

| Subfase | Alcance |
| --- | --- |
| 12.1 | Diagnóstico y decisión arquitectónica. |
| 12.2 | Listado read-only de usuarios internos para `admin`. Implementado sobre `public.profiles`, con filtros GET por nombre/teléfono, rol y estado activo. |
| 12.3 | Detalle read-only de usuario interno. Implementado sobre `public.profiles`, con validación de UUID y 404 para IDs inválidos o inexistentes. |
| 12.4 | Edición de perfil operativo: nombre, teléfono, avatar, rol y estado. Implementada con guardas para no dejar el sistema sin administrador activo. |
| 12.5 | Creación de perfil interno para usuario Auth existente. Implementada sin crear credenciales, sin consultar `auth.users` y sin service role key. |
| 12.6 | Revisión de seguridad, pruebas y documentación final. |
| Futura | Creación completa o invitaciones, solo si se acepta introducir service role server-side. |

## Criterio para Adoptar Service Role en el Futuro

Solo debería considerarse service role si el proyecto necesita alta completa de usuarios desde la app o invitaciones integradas. Antes de incorporarla debe existir una decisión explícita que incluya:

- variable de entorno solo server-side;
- ningún uso en componentes cliente;
- módulo aislado para Admin API;
- validación server-side estricta de `admin`;
- auditoría de operaciones sensibles;
- pruebas de acceso negativo;
- revisión de logs y errores para no exponer datos sensibles.

## Estado de Implementación de 12.2

El listado interno de usuarios está implementado en `/dashboard/usuarios` para perfiles con rol `admin`.

La consulta se realiza server-side mediante el cliente normal de Supabase y respeta RLS. Selecciona únicamente columnas de `public.profiles`: `id`, `full_name`, `role`, `phone`, `avatar_url`, `is_active`, `created_at` y `updated_at`.

Filtros disponibles por GET:

- `q`: busca por nombre o teléfono.
- `role`: acepta `admin`, `supervisor` o `trabajador`.
- `active`: acepta `true` o `false`.

El listado no consulta `auth.users`, no muestra email, no crea usuarios, no edita perfiles, no cambia roles, no activa o desactiva perfiles y no usa service role key.

## Estado de Implementación de 12.3

El detalle read-only de usuario está implementado en `/dashboard/usuarios/[id]` para perfiles con rol `admin`.

La carga se realiza server-side mediante el cliente normal de Supabase y respeta RLS. El servicio valida formato UUID, valida `usuarios.view` y consulta únicamente `public.profiles` con las columnas `id`, `full_name`, `role`, `phone`, `avatar_url`, `is_active`, `created_at` y `updated_at`.

El detalle muestra nombre, rol, teléfono, estado, avatar si existe como enlace seguro, fechas de creación y actualización, e identificador completo. No consulta `auth.users`, no muestra email, no crea usuarios, no edita perfiles, no cambia roles, no activa o desactiva perfiles y no usa service role key.

## Estado de Implementación de 12.4

La edición controlada de perfiles internos está implementada en `/dashboard/usuarios/[id]/editar` para perfiles con rol `admin`.

Campos editables:

- `full_name`;
- `phone`;
- `avatar_url`;
- `role`;
- `is_active`.

La edición usa Server Actions y un servicio server-side que valida `usuarios.manage`, valida UUID, carga el perfil objetivo desde `public.profiles`, valida input y actualiza únicamente los campos permitidos. No acepta `id`, `created_at` ni `updated_at` desde el formulario como fuente confiable.

Protecciones implementadas:

- un admin no puede desactivarse a sí mismo;
- un admin no puede quitarse su propio rol `admin`;
- no se puede desactivar el último admin activo;
- no se puede cambiar el rol del último admin activo a `supervisor` o `trabajador`;
- cualquier edición sobre admins activos verifica que siga existiendo al menos un admin activo.

La edición no consulta `auth.users`, no muestra email, no cambia contraseñas, no elimina usuarios, no crea usuarios y no usa service role key. RLS sigue siendo defensa final.

## Estado de Implementación de 12.5

La creación de perfiles internos está implementada en `/dashboard/usuarios/nuevo` para perfiles con rol `admin`.

Esta pantalla no crea usuarios Auth, no consulta `auth.users`, no pide email, no pide contraseña, no envía invitaciones y no usa service role key. El admin debe crear primero el usuario en Supabase Auth desde Supabase Studio o CLI, copiar su UUID y pegarlo en la app.

Campos permitidos:

- `id`, usando el UUID del usuario Auth existente;
- `full_name`;
- `phone`;
- `avatar_url`;
- `role`;
- `is_active`.

No se insertan `created_at`, `updated_at`, email, contraseña, tokens ni campos técnicos de Auth.

Errores controlados:

- UUID inválido;
- usuario Auth inexistente, detectado por la clave foránea de `profiles.id` hacia `auth.users.id`;
- perfil interno ya existente para ese UUID;
- error general seguro.

RLS sigue siendo defensa final: la inserción usa el cliente server-side normal de Supabase con la sesión del admin autenticado.
