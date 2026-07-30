# Modelo de Gestión de Usuarios Internos

## Propósito

La gestión de usuarios internos permite administrar quién puede entrar al dashboard operativo de Godel Diseño y qué rol tiene dentro del sistema. Esta fase se limita al personal interno; los clientes externos no tienen cuenta de usuario en el MVP actual.

El módulo implementa una gestión segura sobre Supabase Auth y
`public.perfiles`, sin abrir capacidades administrativas más amplias de las
necesarias.

## Modelo Actual

Supabase Auth confirma la identidad del usuario. La tabla `public.perfiles` define si ese usuario pertenece al sistema interno, qué rol tiene y si está activo.

La relación actual es:

| Capa | Responsabilidad |
| --- | --- |
| `auth.users` | Identidad, credenciales, sesión y datos propios de Auth. |
| `public.perfiles` | Perfil operativo interno, rol y estado activo. |

`perfiles.id` es una clave primaria `uuid` que referencia `auth.users.id` con `on delete cascade`. Esto implica que un perfil interno solo puede existir para un usuario Auth existente.

## Campos Reales de `perfiles`

La tabla actual contiene:

| Campo | Tipo | Uso |
| --- | --- | --- |
| `id` | `uuid` | Identificador del perfil; referencia `auth.users.id`. |
| `full_name` | `text` | Nombre completo visible del usuario interno. |
| `role` | `app_role` | Rol operativo: `admin`, `supervisor` o `trabajador`. |
| `phone` | `text nullable` | Teléfono opcional. |
| `avatar_url` | `text nullable` | URL o ruta opcional de avatar. |
| `is_active` | `boolean` | Control de acceso interno sin eliminar el usuario Auth. |
| `must_change_password` | `boolean` | Bloquea operación interna mientras el usuario conserva una contraseña temporal. |
| `created_by` | `uuid nullable` | Admin interno que originó la creación administrativa; referencia `perfiles.id` con `on delete set null`. |
| `created_at` | `timestamptz` | Fecha de creación del perfil. |
| `updated_at` | `timestamptz` | Fecha de última actualización; se mantiene con trigger. |

Los perfiles existentes quedan con `must_change_password = false`. Los usuarios creados en el futuro por el flujo administrativo directo empezarán con `must_change_password = true` y `created_by` informado.

## Roles

El enum `public.app_role` define tres roles:

| Rol | Alcance actual |
| --- | --- |
| `admin` | Acceso completo al dashboard y a gestión de usuarios. |
| `supervisor` | Gestión operativa de solicitudes, pedidos y clientes; no gestiona usuarios. |
| `trabajador` | Acceso a pedidos asignados y acciones permitidas sobre esos pedidos; no gestiona usuarios. |

## RLS Actual sobre `perfiles`

Las políticas actuales permiten:

| Operación | Quién puede hacerlo |
| --- | --- |
| `select` | El propio usuario, `admin`, `supervisor` y usuarios internos que necesiten ver perfiles asignados a pedidos accesibles. |
| `insert` | Solo `admin`, usando una sesión autenticada y activa. |
| `update` | Solo `admin`, usando una sesión autenticada y activa. |
| `delete` | No hay policy de eliminación; no se permite desde el cliente normal. |

La policy vigente de lectura es `perfiles_select_visible`. Sustituyó a la policy inicial para permitir que trabajadores vean datos básicos del personal asignado a pedidos que pueden acceder, sin habilitar navegación general por todos los perfiles.

Aunque existen grants de tabla para `authenticated`, RLS es la defensa real que limita filas y operaciones.

`perfiles_select_visible` conserva la lectura de la fila propia mediante `id = auth.uid()`. Esto permite detectar el estado de onboarding aunque `must_change_password = true`, sin convertir al usuario temporal en admin, supervisor o trabajador operativo.

El rol SQL `authenticated` no conserva `UPDATE` completo de tabla sobre `public.perfiles`. Para sesiones normales, la actualización directa por PostgREST queda limitada por grant de columnas a:

- `full_name`;
- `phone`;
- `avatar_url`;
- `role`;
- `is_active`.

Los campos `must_change_password` y `created_by` son protegidos. No son actualizables por una sesión normal, aunque el usuario sea admin y RLS permita operar sobre la fila. `must_change_password` solo debe completarse mediante la RPC privilegiada futura, después de que el cambio real de contraseña haya finalizado correctamente.

El `INSERT` normal sobre `perfiles` para `authenticated` se conserva de forma transitoria mientras siga existiendo el alta legacy por UUID de un usuario Auth ya creado. Ese permiso debe revisarse y retirarse cuando el nuevo flujo administrativo con Auth Admin API reemplace completamente al anterior.

## Base para Creación Administrativa Segura

La decisión arquitectónica evoluciona hacia un alta directa desde el dashboard administrativo: un admin autorizado crea el usuario Auth con correo y contraseña temporal mediante Admin API en código estrictamente server-side. El servicio backend ya existe, pero todavía no está conectado a una Server Action ni a la interfaz.

La base vigente queda preparada así:

- `auth.users` seguirá siendo la fuente de identidad, correo y credenciales.
- `public.perfiles` seguirá siendo la fuente de rol, estado operativo y datos internos.
- Un trigger `AFTER INSERT` sobre `auth.users` crea el perfil cuando `raw_app_meta_data.godel_provisioning` trae el marcador administrativo esperado desde el inicio.
- Un trigger complementario `AFTER UPDATE OF raw_app_meta_data` crea el perfil cuando el marcador aparece por primera vez en una actualización posterior de `app_metadata`.
- Ambos triggers ejecutan la misma función validada `private.provision_internal_profile_from_auth_user()`.
- Se conserva `app_metadata` porque el marcador es metadata administrativa; no se cambia a `user_metadata`.
- Usuarios Auth sin ese marcador no reciben perfil automático ni acceso interno.
- `must_change_password = true` bloquea operación interna por RLS: `private.current_user_role()` no devuelve rol y `private.current_user_is_active()` devuelve falso operativo.
- `created_by` identifica al admin creador y exige que sea `admin`, activo y sin cambio de contraseña pendiente.
- `public.complete_initial_password_change(uuid)` existe solo para uso futuro desde una Server Action protegida posterior a `auth.updateUser({ password })`.
- La RPC no se concede a `authenticated`; solo `service_role` puede ejecutarla.
- `private.internal_user_creation_audit` registra intentos de alta administrativa sin almacenar email, contraseña, metadata, tokens ni payloads completos.
- `public.begin_internal_user_creation_attempt` reserva cada intento permitido y aplica rate limiting antes de construir el cliente Admin.
- `public.complete_internal_user_creation_attempt` finaliza el intento como `succeeded`, `failed` o `compensation_failed`.
- El rate limit vigente permite hasta 5 intentos reales por admin en 10 minutos y hasta 20 intentos reales globales en 1 hora.
- El signup público local queda deshabilitado en `supabase/config.toml`.
- La clave administrativa aislada forma parte del contrato técnico mediante `SUPABASE_SECRET_KEY` y `createAdminClient()`.
- `createInternalUser()` es el único consumidor productivo autorizado del cliente Admin. Todavía no está conectado a una Server Action ni a la interfaz.
- El servicio valida autorización antes de construir el cliente Admin y usa la Admin API solo para `auth.admin.createUser` y la compensación `auth.admin.deleteUser` si falla la postcondición.

La funcionalidad sigue incompleta hasta implementar las etapas posteriores: Server Action protegida, formulario con correo y contraseña temporal, cambio inicial real de contraseña y pruebas E2E del flujo productivo.

## Permisos de Ruta y Dominio

La ruta `/dashboard/configuracion/usuarios` está permitida solo para `admin` mediante `canAccessDashboardRoute(role, pathname)`. El proxy usa esa misma función para bloquear acceso directo por URL.

Los permisos de dominio ya existen:

| Permiso | Admin | Supervisor | Trabajador |
| --- | --- | --- | --- |
| `usuarios.view` | Sí | No | No |
| `usuarios.manage` | Sí | No | No |

Las páginas y Server Actions del módulo validan estos permisos en servidor. La
navegación visible no se considera una barrera de seguridad suficiente.

## Qué Puede Hacerse Sin Service Role

Con el cliente server-side normal de Supabase y la sesión del admin autenticado se puede:

- listar perfiles internos permitidos por RLS;
- leer el detalle de un perfil;
- crear una fila en `public.perfiles` para un usuario Auth que ya exista;
- editar `full_name`, `phone`, `avatar_url`, `role` e `is_active` en `perfiles`;
- activar o desactivar perfiles internos;
- aplicar validaciones server-side para evitar dejar el sistema sin administradores.

Estas operaciones actúan sobre `public.perfiles`, no sobre `auth.users`.

## Qué Requiere Service Role

La creación completa de usuarios Auth desde la app requiere usar la Admin API de Supabase Auth. Esa API necesita service role key en un contexto server-side muy protegido.

También requerirían service role u otro flujo administrativo equivalente:

- crear usuarios en `auth.users` desde la app;
- invitar usuarios mediante flujos administrativos de Auth;
- listar o consultar datos administrativos completos de Auth;
- cambiar contraseñas de otros usuarios desde la app;
- confirmar correos o manipular atributos administrativos de Auth.

La clave administrativa ignora RLS. El proyecto la adopta para primera producción únicamente de forma aislada y server-side mediante `src/lib/supabase/admin.ts`; no debe usarse en frontend ni para consultas normales de tablas.

## Comparación de Opciones

### Opción A: Gestión de Perfiles Únicamente

Los usuarios Auth se crean manualmente desde Supabase Studio o CLI. La app permite al admin gestionar solo `public.perfiles`.

Ventajas:

- No requiere service role key.
- Mantiene RLS como defensa final.
- Encaja con el modelo actual y con la política del proyecto de evitar service role.
- Reduce el riesgo de exposición de credenciales administrativas.
- Permite avanzar con listado, detalle, edición de rol y activación sin tocar Auth.

Riesgos y límites:

- Requiere un paso manual previo para crear el usuario Auth.
- La app no podrá mostrar emails de Auth si no se duplican o sincronizan en `perfiles`.
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

## Decisión Vigente para el MVP

Godel Diseño mantiene operativa la gestión de perfiles existente, pero adopta como objetivo de primera producción la creación administrativa directa con contraseña temporal. La etapa foundation actual implementa solo la base de datos y el contrato de seguridad.

El alta completa desde UI todavía no está disponible en esta etapa. La clave administrativa aislada ya existe como contrato técnico y el servicio backend `createInternalUser()` ya la usa para Admin API, pero el formulario y las Server Actions productivas siguen sin consumirlo.

## Operaciones Implementadas

- listar usuarios internos desde `perfiles`;
- ver detalle de usuario;
- crear usuarios Auth internos desde servicio backend aislado, sin consumidor UI todavía;
- crear perfil interno para un usuario Auth existente;
- editar `full_name`;
- editar campos opcionales existentes como `phone` y `avatar_url` si se decide exponerlos;
- cambiar `role`;
- activar o desactivar `is_active`;
- impedir la autodesactivación accidental del único admin;
- impedir que el único admin se quite su propio rol `admin`;
- bloquear eliminación física de perfiles;
- validar todo en Server Actions con `usuarios.view` o `usuarios.manage`.

## Servicio `createInternalUser`

`createInternalUser(input)` es un servicio server-only exportado desde
`src/lib/usuarios`. Su firma devuelve un `ServiceResult` con éxito mínimo
`{ userId }` o errores controlados. No devuelve contraseña, sesión, token,
objeto completo de Auth, headers, metadata ni email confirmado.

Orden de defensa:

1. carga el perfil actual con `getCurrentProfile()`;
2. rechaza ausencia de perfil como `unauthorized`;
3. rechaza `must_change_password = true` como `onboarding_required`;
4. exige `usuarios.manage`;
5. valida entrada;
6. crea el cliente server-side normal de Supabase;
7. llama a `public.begin_internal_user_creation_attempt`;
8. devuelve `rate_limited` si la RPC bloquea por ventana temporal;
9. construye `createAdminClient()`;
10. llama a `auth.admin.createUser`;
11. valida que Auth devuelva un UUID;
12. consulta `public.perfiles` con el cliente server-side normal;
13. valida la postcondición completa del perfil;
14. intenta finalizar la auditoría con `public.complete_internal_user_creation_attempt`;
15. retorna solo `{ userId }`.

La entrada permitida del alta completa es correo, contraseña temporal,
confirmación de contraseña, nombre completo, teléfono opcional, avatar opcional,
rol y confirmación explícita para rol `admin`. No acepta `id`, `is_active`,
`must_change_password`, `created_by` ni otros campos técnicos.

El correo se normaliza con `trim` y minúsculas. Debe ser obligatorio, de una
sola línea, máximo 254 caracteres, sin espacios, con una sola `@`, dominio no
vacío y estructura básica razonable.

La contraseña temporal no se recorta ni se transforma. Debe medir entre 12 y 72
caracteres, incluir minúscula, mayúscula, número y carácter no alfanumérico, no
ser idéntica al correo ignorando mayúsculas, y coincidir exactamente con su
confirmación. La contraseña no se registra, documenta con ejemplos reales,
devuelve ni incorpora a metadata.

Cuando el rol solicitado es `admin`, el servicio exige
`confirm_admin = "true"` con un mensaje seguro de confirmación de acceso
administrativo completo. Para `supervisor` y `trabajador`, ese campo se ignora.

La llamada a Auth usa exclusivamente:

```ts
admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: {
    godel_provisioning: {
      version: 1,
      source: "admin_dashboard",
      full_name,
      phone,
      avatar_url,
      role,
      created_by: currentProfile.id,
    },
  },
});
```

`email_confirm = true` significa confirmación administrativa sin envío de email;
no afirma que la persona verificó manualmente el correo. El servicio no usa
`user_metadata`, `signUp`, invitaciones, enlaces, inserción manual en
`perfiles` ni la RPC de cambio inicial. El trigger Auth -> perfil crea la fila
con `is_active = true`, `must_change_password = true` y `created_by` del admin
operativo.

El entorno local de Supabase Auth puede persistir `app_metadata` después del
primer `INSERT` de `auth.users`; por eso existen dos triggers complementarios:
uno de inserción y otro de transición de `raw_app_meta_data`. Ninguna identidad
se considera creada correctamente hasta que `createInternalUser()` confirme que
existe exactamente el perfil esperado.

Después de obtener el UUID de Auth, `createInternalUser()` consulta
`public.perfiles` mediante el cliente server-side normal, no con el cliente
Admin. Selecciona solo `id`, `full_name`, `phone`, `avatar_url`, `role`,
`is_active`, `must_change_password` y `created_by`, y comprueba que esos campos
coincidan con la entrada normalizada y el admin creador. Si la postcondición
falla, intenta eliminar compensatoriamente el usuario Auth con Admin API y
devuelve `provisioning_error` con un mensaje genérico.

Antes de construir el cliente Admin, `createInternalUser()` reserva un intento
en `private.internal_user_creation_audit` mediante el cliente server-side normal
y la sesión del admin. La RPC permite como máximo 5 intentos reales por actor en
10 minutos y 20 intentos reales globales en 1 hora. Los bloqueos quedan
registrados como `rate_limited` con `actor_rate_limit` o `global_rate_limit`,
pero no cuentan como intentos reales para las ventanas futuras.

El éxito funcional depende de Auth user creado y perfil interno correctamente
provisionado. El cierre de auditoría como `succeeded` es de mejor esfuerzo:
si falla, el servicio conserva el usuario Auth y el perfil, devuelve éxito y la
fila queda `pending` como señal para reconciliación operativa posterior. La
compensación se reserva para fallos de provisión: perfil ausente, perfil que no
coincide con la postcondición o excepción después de obtener un UUID Auth pero
antes de confirmar correctamente el perfil. Los estados terminales son:

- `succeeded`, con `target_auth_user_id` y sin `error_code`;
- `failed`, con códigos internos como `already_exists`, `weak_password`,
  `auth_rate_limited`, `configuration_error`, `auth_error`,
  `invalid_auth_response`, `provisioning_error` o `unexpected_error`;
- `compensation_failed`, cuando existe usuario Auth creado pero falló la
  eliminación compensatoria tras una postcondición inválida.

Razones de error actuales: `unauthorized`, `forbidden`,
`onboarding_required`, `validation_error`, `already_exists`, `rate_limited`,
`configuration_error`, `provisioning_error`, `auth_error` y `error`. Los códigos Auth `email_exists`,
`user_already_exists`, `identity_already_exists` y `conflict` se tratan como
duplicado con error de campo `email`; `weak_password` vuelve como
`validation_error`; estatus `429` y códigos `over_*_rate_limit` vuelven como
`rate_limited`.

Los errores desconocidos devuelven un mensaje genérico. El log sanitizado puede
incluir únicamente `context`, `name`, `code` y `status`; no incluye correo,
contraseña, metadata, URL, headers, request, response body, tokens ni stack.

## Fuera de Alcance Inicial

Queda explícitamente fuera de esta etapa foundation:

- conectar la creación de usuarios Auth a UI o Server Actions productivas;
- enviar invitaciones desde la app;
- cambiar contraseñas desde la app, salvo la futura etapa protegida de cambio inicial;
- eliminar usuarios físicamente;
- exponer emails de Auth si no forman parte de `perfiles`;
- agregar consumidores productivos adicionales de la clave administrativa;
- usar service role key desde componentes cliente o código no aislado;
- cambiar la matriz de permisos;
- convertir `perfiles` en un sistema avanzado de recursos humanos.

## Consideraciones de Seguridad

Las operaciones cumplen estas reglas:

- validar usuario autenticado y perfil activo en servidor;
- validar `usuarios.view` para lectura y `usuarios.manage` para cambios;
- usar el cliente server-side normal de Supabase;
- depender de RLS como defensa final;
- reservar y finalizar los intentos de alta completa por RPC auditada antes y
  después de usar Auth Admin;
- no aceptar `id` del usuario actual desde formularios cuando pueda obtenerse de la sesión;
- validar UUIDs y payloads antes de consultar o actualizar;
- limitar las columnas actualizables;
- no permitir que el sistema quede sin ningún `admin` activo;
- no permitir eliminación física en esta etapa;
- registrar decisiones sensibles en documentación antes de ampliar Auth.

## Historial de Implementación de Fase 12

| Subfase | Alcance |
| --- | --- |
| 12.1 | Diagnóstico y decisión arquitectónica. |
| 12.2 | Listado read-only de usuarios internos para `admin`. Implementado sobre `public.perfiles`, con filtros GET por nombre/teléfono, rol y estado activo. |
| 12.3 | Detalle read-only de usuario interno. Implementado sobre `public.perfiles`, con validación de UUID y 404 para IDs inválidos o inexistentes. |
| 12.4 | Edición de perfil operativo: nombre, teléfono, avatar, rol y estado. Implementada con guardas para no dejar el sistema sin administrador activo. |
| 12.5 | Creación de perfil interno para usuario Auth existente. Implementada sin crear credenciales, sin consultar `auth.users` y sin service role key. |
| 12.6 | Revisión de seguridad, pruebas y documentación final. |
| Futura | Conexión productiva de la creación administrativa completa a Server Action/UI y cambio inicial obligatorio. |

## Criterio para Adoptar Service Role en el Futuro

Solo debería considerarse service role si el proyecto necesita alta completa de usuarios desde la app o invitaciones integradas. Antes de incorporarla debe existir una decisión explícita que incluya:

- variable de entorno solo server-side;
- ningún uso en componentes cliente;
- módulo aislado para Admin API;
- validación server-side estricta de `admin`;
- auditoría de operaciones sensibles;
- rate limiting por actor y global antes de invocar Auth Admin;
- pruebas de acceso negativo;
- revisión de logs y errores para no exponer datos sensibles.

## Estado de Implementación de 12.2

El listado interno de usuarios está implementado en `/dashboard/configuracion/usuarios` para perfiles con rol `admin`.

La consulta se realiza server-side mediante el cliente normal de Supabase y respeta RLS. Selecciona únicamente columnas de `public.perfiles`: `id`, `full_name`, `role`, `phone`, `avatar_url`, `is_active`, `created_at` y `updated_at`.

Filtros disponibles por GET:

- `q`: busca por nombre o teléfono.
- `role`: acepta `admin`, `supervisor` o `trabajador`.
- `active`: acepta `true` o `false`.

La página usa la misma barra de filtros que los demás listados internos. La
búsqueda actualiza `q` con `router.replace` tras 200 ms sin escritura; los
selectores de rol y estado se aplican inmediatamente y el botón de limpieza
elimina los tres parámetros. El componente cliente solo modifica la URL y la
consulta permanece server-side. Durante la espera muestra `Buscando...`.

El listado no consulta `auth.users`, no muestra email, no crea usuarios, no edita perfiles, no cambia roles, no activa o desactiva perfiles y no usa service role key.

## Estado de Implementación de 12.3

La carga read-only de usuario por UUID se mantiene para alimentar la edición de perfiles desde `/dashboard/configuracion/usuarios/[id]/editar`.

La carga se realiza server-side mediante el cliente normal de Supabase y respeta RLS. El servicio valida formato UUID, valida `usuarios.view` y consulta únicamente `public.perfiles` con las columnas `id`, `full_name`, `role`, `phone`, `avatar_url`, `is_active`, `created_at` y `updated_at`.

La carga valida formato UUID, valida `usuarios.view`, consulta únicamente `public.perfiles` y no consulta `auth.users`, no muestra email, no crea usuarios y no usa service role key.

## Estado de Implementación de 12.4

La edición controlada de perfiles internos está implementada en `/dashboard/configuracion/usuarios/[id]/editar` para perfiles con rol `admin`.

Campos editables:

- `full_name`;
- `phone`;
- `avatar_url`;
- `role`;
- `is_active`.

La edición usa Server Actions y un servicio server-side que valida `usuarios.manage`, valida UUID, carga el perfil objetivo desde `public.perfiles`, valida input y actualiza únicamente los campos permitidos. No acepta `id`, `created_at` ni `updated_at` desde el formulario como fuente confiable.

Protecciones implementadas:

- un admin no puede desactivarse a sí mismo;
- un admin no puede quitarse su propio rol `admin`;
- no se puede desactivar el último admin activo;
- no se puede cambiar el rol del último admin activo a `supervisor` o `trabajador`;
- cualquier edición sobre admins activos verifica que siga existiendo al menos un admin activo.

La edición no consulta `auth.users`, no muestra email, no cambia contraseñas, no elimina usuarios, no crea usuarios y no usa service role key. RLS sigue siendo defensa final.

## Estado de Implementación de 12.5

La creación de perfiles internos está implementada en `/dashboard/configuracion/usuarios/nuevo` para perfiles con rol `admin`.

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
- usuario Auth inexistente, detectado por la clave foránea de `perfiles.id` hacia `auth.users.id`;
- perfil interno ya existente para ese UUID;
- error general seguro.

RLS sigue siendo defensa final: la inserción usa el cliente server-side normal de Supabase con la sesión del admin autenticado.
