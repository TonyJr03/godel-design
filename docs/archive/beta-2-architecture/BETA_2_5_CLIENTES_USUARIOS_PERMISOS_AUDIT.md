# Beta 2.5.1 - Auditoria focal de Clientes, Usuarios y Permisos

## 1. Objetivo

Auditar los dominios Clientes, Usuarios/Perfiles y Permisos antes de iniciar
refactors de Beta 2.5. El alcance cubre rutas internas del dashboard,
componentes, Server Actions, servicios de `src/lib`, helpers de autorización,
relación con Supabase Auth, RLS, solicitudes, pedidos y cobertura e2e vigente.

Esta auditoría no modifica código funcional. Su objetivo es decidir que conviene
consolidar, que riesgos proteger y que no tocar durante Beta 2.5.

## 2. Resumen ejecutivo

El estado general es bueno. Clientes y Usuarios/Perfiles están contenidos en
dominios claros de `src/lib`, las rutas App Router delegan en servicios
server-side, los Client Components no consultan Supabase, y las mutaciones
validan perfil activo y permisos antes de escribir.

Puntos fuertes:

- `src/lib/permissions` centraliza la matriz de permisos TypeScript.
- `src/lib/auth/current-user.ts` centraliza usuario y perfil activo.
- `src/lib/supabase/proxy.ts` valida sesión, perfil activo y acceso por ruta.
- Clientes usa DTOs explícitos y no tiene eliminación prematura.
- Usuarios opera sobre `public.perfiles`, no crea credenciales Auth y no
  consulta `auth.users` desde app code.
- La edición de perfiles tiene guardas contra desactivar o degradar el propio
  admin y contra dejar el sistema sin admin activo.
- RLS refuerza perfiles, clientes y relaciones de pedidos como defensa final.

Riesgos principales:

- La matriz de permisos vive en TypeScript y en funciones/policies SQL; cualquier
  cambio de roles debe actualizar app, RLS, docs y QA juntos.
- `getCurrentProfile()` y `getCurrentUserWithProfile()` hacen `select("*")` de
  `perfiles`; no es una brecha actual, pero conviene crear DTOs mínimos si el
  patrón sigue creciendo.
- CRUD simple de clientes y usuarios repite action states, lectura de `FormData`,
  validaciones, errores y revalidaciones.
- `/dashboard/pedidos/nuevo` queda permitido por prefijo a `trabajador`, aunque
  la página y la action bloquean `pedidos.manage`; no es fuga de datos, pero es
  una decisión UX/arquitectura que conviene formalizar.
- Falta e2e focal para Clientes/Usuarios; hoy la cobertura de permisos vive
  sobre todo en `full-visual-qa.spec.ts`.

Recomendación general: consolidar primero Clientes por ser CRUD simple y de
menor riesgo, luego Usuarios/Perfiles con cuidado especial en guardas de admin,
después formalizar permisos/current-profile y cerrar con QA focal.

## 3. Mapa del dominio Clientes

### Rutas

- `src/app/dashboard/clientes/page.tsx`: listado interno con búsqueda `q`.
- `src/app/dashboard/clientes/nuevo/page.tsx`: formulario de creación manual.
- `src/app/dashboard/clientes/nuevo/actions.ts`: `createClienteAction`.
- `src/app/dashboard/clientes/[id]/page.tsx`: detalle interno.
- `src/app/dashboard/clientes/[id]/editar/page.tsx`: edición interna.
- `src/app/dashboard/clientes/[id]/editar/actions.ts`: `updateClienteAction`.

Las rutas dependen de `listInternalClientes`, `getInternalClienteById`,
`createInternalCliente` y `updateInternalCliente`. El acceso por URL se filtra en
proxy para `admin` y `supervisor`; los servicios repiten permisos como defensa
server-side.

### Componentes

- `InternalClientesList`: muestra nombre, telefono, correo, fechas y enlace al
  detalle.
- `InternalClienteDetail`: muestra nombre, telefono, correo, notas, fechas e
  identificador interno dentro del dashboard.
- `ClienteForm`: crea `name`, `phone`, `email` y `notes`.
- `ClienteEditForm`: actualiza los mismos campos, enviando `cliente_id` oculto.

Los componentes son UI/interacción. No consultan Supabase y no deciden permisos
críticos.

### Servicios

- `list-internal-clientes.ts`: valida perfil activo y `clientes.view`; busca por
  `name`, `phone`, `email` y `notes`; devuelve DTO de listado sin `notes`.
- `get-internal-cliente-by-id.ts`: valida UUID, perfil activo y
  `clientes.view`; devuelve detalle con `notes`.
- `create-internal-cliente.ts`: valida perfil activo y `clientes.manage`;
  normaliza input y crea cliente.
- `update-internal-cliente.ts`: valida UUID, perfil activo y `clientes.manage`;
  actualiza solo campos editables.
- `client-validation.ts`: normaliza `name`, `phone`, `email`, `notes`, aplica
  límites y valida email básico.

### Actions y validaciones

Las actions leen solo campos editables desde `FormData`, invocan servicios,
devuelven `ok`, `message` y `fieldErrors`, y revalidan rutas del dominio. La
validación real vive en `client-validation.ts` y en constraints/RLS de base de
datos.

### Datos visibles

En dashboard se muestran:

- nombre;
- telefono;
- correo;
- notas solo en detalle;
- fechas de creación/actualización;
- identificador interno solo en detalle interno.

Estos datos no deben llegar a rutas públicas. En `/estado` no deben aparecer
cliente, contacto, correo, notas ni UUIDs internos.

### Relación con solicitudes

- `associateSolicitudWithCliente` asocia una solicitud a un cliente existente.
- `createClienteFromSolicitudAndAssociate` crea cliente desde datos ya guardados
  en la solicitud y delega la operación crítica en
  `public.crear_cliente_desde_solicitud`.
- La creación desde solicitud no toma nombre, telefono ni correo desde un
  formulario editable de cliente; usa datos persistidos de la solicitud.

### Relación con pedidos

- `createInternalPedido` permite `cliente_id` opcional.
- `clienteExists` comprueba disponibilidad del cliente antes de llamar la RPC de
  creación manual de pedido.
- El detalle de pedido carga `clientes(id, name, phone, email)`.
- El dashboard de pedidos muestra cliente si existe; puede haber pedidos sin
  cliente asociado.

### Riesgos

- `listInternalClientes` tiene búsqueda directa con `or(...ilike...)`; esta
  acotada y normalizada, pero podría extraerse si crecen filtros.
- Actions y validaciones se parecen mucho a Usuarios y Task Templates.
- No hay deduplicación avanzada de clientes; es decisión aceptada.
- Los datos personales son internos; cualquier reuse en rutas públicas debe
  revisarse como riesgo de exposición.

## 4. Mapa del dominio Usuarios/Perfiles

### Rutas

- `src/app/dashboard/usuarios/page.tsx`: listado interno con filtros por `q`,
  `role` y `active`.
- `src/app/dashboard/usuarios/nuevo/page.tsx`: crear perfil para usuario Auth ya
  existente.
- `src/app/dashboard/usuarios/nuevo/actions.ts`: `createUserProfileAction`.
- `src/app/dashboard/usuarios/[id]/page.tsx`: detalle interno.
- `src/app/dashboard/usuarios/[id]/editar/page.tsx`: edición de perfil.
- `src/app/dashboard/usuarios/[id]/editar/actions.ts`: `updateUserAction`.

La ruta `/dashboard/usuarios` está restringida a `admin` por
`canAccessDashboardRoute` y proxy. Los servicios repiten `usuarios.view` o
`usuarios.manage`.

### Componentes

- `InternalUsersList`: muestra nombre, rol, teléfono, estado, fechas e ID corto.
- `InternalUserDetail`: muestra nombre, rol, estado, teléfono, avatar seguro,
  fechas y Auth ID dentro del dashboard.
- `UserCreateForm`: recibe UUID de usuario Auth existente, perfil, rol y estado.
- `UserEditForm`: edita perfil interno, rol y estado.

Los formularios muestran que credenciales, email y password se gestionan fuera
de la aplicación.

### Servicios

- `list-internal-users.ts`: valida perfil activo y `usuarios.view`; filtra por
  nombre, teléfono, rol y estado; no consulta email.
- `get-internal-user-by-id.ts`: valida UUID, perfil activo y `usuarios.view`;
  carga detalle mínimo desde `public.perfiles`.
- `create-internal-user-profile.ts`: valida `usuarios.manage`, UUID de usuario
  Auth, datos de perfil, unique/FK errors, e inserta en `public.perfiles`.
- `update-internal-user.ts`: valida `usuarios.manage`, carga usuario actual,
  valida input y aplica guardas de admin antes de actualizar.
- `user-validation.ts`: normaliza nombre, teléfono, avatar, rol y estado.
- `roles.ts`: expone roles reales desde `Constants.public.Enums.app_role`.

### Datos visibles

En dashboard se muestran:

- `full_name`;
- `role`;
- `phone`;
- `avatar_url` como enlace validado en componente;
- `is_active`;
- fechas;
- Auth ID dentro de rutas internas de usuarios.

No se muestran emails internos porque la app no consulta `auth.users` ni guarda
email en `perfiles`.

### Roles y estado activo/inactivo

Roles vigentes:

- `admin`;
- `supervisor`;
- `trabajador`.

`is_active = false` bloquea uso como perfil activo mediante
`getCurrentProfile`, proxy y funciones SQL privadas. Un perfil inactivo no debe
entrar al dashboard.

### Relación con Auth

Supabase Auth sigue siendo autoridad de identidad y credenciales. La app solo
gestiona `public.perfiles`:

- no crea usuarios Auth;
- no pide email ni password;
- no consulta `auth.users`;
- crea perfil solo para UUID Auth existente, confirmado por FK;
- usa el usuario autenticado mediante `supabase.auth.getUser()` o claims en el
  proxy.

### Riesgos

- Crear o editar perfiles permite asignar rol, pero solo `admin` puede llegar a
  la action y al servicio. RLS también restringe insert/update de `perfiles` a
  admin activo.
- Las guardas de último admin existen en TypeScript y en trigger de base de
  datos; deben mantenerse alineadas.
- `avatar_url` admite URL externa `http`/`https`; el detalle valida el link antes
  de renderizarlo, pero conviene mantenerlo como dato no sensible.
- `getCurrentProfile()` usa `select("*")`, aunque `perfiles` hoy no tiene email
  ni secretos.

## 5. Mapa de permisos y autorización

### Helpers

- `src/lib/permissions/permissions.ts` define `PERMISSIONS`,
  `PERMISSIONS_BY_ROLE`, `hasPermission`, `hasAnyPermission`,
  `hasAllPermissions`, `isAdmin`, `isSupervisor` e `isTrabajador`.
- `src/lib/permissions/routes.ts` define `canAccessDashboardRoute`.
- `src/lib/permissions/labels.ts` expone labels visibles de roles/permisos.
- `src/lib/auth/current-user.ts` obtiene usuario Auth y perfil activo.
- `src/lib/supabase/proxy.ts` bloquea rutas sin sesión, perfil activo o rol
  permitido.

### Permisos por rol

| Rol | Permisos clave |
|---|---|
| `admin` | Todos los permisos. |
| `supervisor` | Dashboard, solicitudes, pedidos y clientes; sin usuarios ni configuración. |
| `trabajador` | Dashboard y pedidos asignados/permitidos; sin clientes generales, solicitudes ni usuarios. |

### Donde se usa `hasPermission`

Se usa en servicios de dominio y algunas páginas server-side para validar
acciones reales:

- Clientes: listar, detalle, crear y editar.
- Usuarios: listar, detalle, crear perfil y editar perfil.
- Solicitudes: asociar cliente, crear cliente desde solicitud, estado,
  comentarios e historial.
- Pedidos: crear, listar, detalle, asignaciones, comentarios, tareas, estado y
  archivos.
- Dashboard/configuración/storage según dominio.

### Donde se usan `isAdmin`, `isSupervisor`, `isTrabajador`

- `isAdmin` y `isSupervisor` aparecen en pagos, dashboard y detalle de pedido
  para permisos específicos o render de capacidades.
- `isTrabajador` aparece en dashboard y detalle de pedido para limitar acceso a
  pedidos no asignados.
- La ruta general usa `canAccessDashboardRoute`, no helpers de rol sueltos.

### Perfil activo

`getCurrentProfile()`:

1. obtiene usuario con Supabase Auth;
2. consulta `public.perfiles`;
3. exige `is_active = true`;
4. devuelve `null` si no hay sesión, perfil o perfil activo.

El proxy repite esta idea usando claims y `perfiles(id, role, is_active)`.

### Relación con RLS

RLS queda como defensa final:

- `perfiles_select_visible` permite ver el perfil propio, perfiles visibles para
  admin/supervisor y perfiles relacionados con pedidos accesibles.
- `perfiles_insert_admin` y `perfiles_update_admin` exigen usuario activo y
  admin.
- `clientes_select_accessible` permite admin/supervisor o acceso por pedido
  accesible.
- `clientes_insert_manager` y `clientes_update_manager` exigen
  admin/supervisor activo.
- funciones privadas como `private.current_user_role`,
  `private.current_user_is_active`, `private.is_admin_or_supervisor` y
  `private.can_access_pedido` refuerzan el modelo.

## 6. Relación Clientes - Solicitudes - Pedidos

### Creación de cliente desde solicitud

`createClienteFromSolicitudAndAssociate` vive en `src/lib/solicitudes` porque
la solicitud es el origen del flujo. Valida:

- UUID de solicitud;
- perfil activo;
- `solicitudes.manage`;
- `clientes.manage`;
- que la solicitud exista;
- que no tenga cliente asociado;
- datos de contacto persistidos.

Luego llama `public.crear_cliente_desde_solicitud`, que bloquea la solicitud y
crea cliente, historial y asociación en una transacción.

### Asociación a cliente existente

`associateSolicitudWithCliente` valida `solicitudes.manage` y `clientes.view`,
verifica que solicitud y cliente existan, y actualiza `solicitudes.cliente_id`.
Es un flujo separado de la creación desde solicitud.

### Pedidos manuales con cliente

`createInternalPedido` permite `cliente_id`; si viene informado, comprueba que el
cliente exista/accesible antes de llamar la RPC de pedido manual. El detalle de
pedido muestra nombre, telefono y correo del cliente.

### Pedidos manuales sin cliente

`cliente_id` puede ser `null`. La UI y el detalle soportan "Sin cliente
asociado". Este caso no debe forzar creación automática de cliente.

### Datos visibles en dashboard

Clientes aparecen en:

- listado/detalle/edición de clientes;
- asociación de solicitud;
- conversión indirecta a pedido;
- pedido manual;
- detalle/listado/dashboard de pedidos;
- actividad/historial cuando corresponde.

Usuarios/perfiles aparecen en:

- listado/detalle/edición de usuarios;
- sidebar y permisos por rol;
- asignación de trabajadores a pedidos;
- autores de comentarios/historial;
- creador/asignados de pedidos.

### Que no debe llegar a rutas públicas

Nunca debe llegar a `/solicitud` o `/estado`:

- UUIDs internos de cliente o perfil;
- nombres, telefonos, emails o notas de clientes;
- emails internos;
- `full_name`, telefono, avatar o rol de perfiles internos;
- metadata cruda de perfiles;
- historial/comentarios internos;
- datos de asignación de trabajadores;
- errores SQL/Postgres/Supabase;
- `auth.users`, `service_role` o `SUPABASE_SERVICE_ROLE_KEY`.

## 7. Evaluación de archivos principales

| Archivo | Responsabilidad | Riesgo | Recomendación |
|---|---|---|---|
| `src/app/dashboard/clientes/page.tsx` | Componer listado interno y filtros. | Bajo. Delegación correcta. | Mantener como Server Component simple. |
| `src/app/dashboard/clientes/nuevo/actions.ts` | Adaptar FormData para crear cliente. | Bajo. Action fina. | Puede compartir patrón futuro de action state/revalidación. |
| `src/app/dashboard/clientes/[id]/editar/actions.ts` | Adaptar FormData para editar cliente. | Bajo. Usa `cliente_id` desde formulario oculto y servicio valida UUID/permisos. | Considerar binding server-side de ID si se endurece patrón, sin urgencia. |
| `src/components/clientes/InternalClientesList.tsx` | Render listado responsive de clientes. | Bajo-medio por datos personales internos. | No reutilizar en rutas públicas. |
| `src/components/clientes/InternalClienteDetail.tsx` | Render detalle con notas e ID interno. | Medio por PII interna. | Mantener solo dashboard protegido. |
| `src/components/clientes/ClienteForm.tsx` | UI de creación con `useActionState`. | Bajo. | Candidato a patrones comunes de formularios. |
| `src/components/clientes/ClienteEditForm.tsx` | UI de edición con `useActionState`. | Bajo. | Candidato a patrones comunes de formularios. |
| `src/lib/clientes/list-internal-clientes.ts` | Listado, búsqueda y permisos. | Bajo-medio si crecen filtros. | Extraer helpers solo si se agregan filtros o relaciones. |
| `src/lib/clientes/get-internal-cliente-by-id.ts` | Detalle interno por UUID. | Bajo. | Mantener DTO explícito. |
| `src/lib/clientes/create-internal-cliente.ts` | Crear cliente manual. | Bajo. | Mantener validación server-side. |
| `src/lib/clientes/update-internal-cliente.ts` | Editar cliente manual. | Bajo. | Mantener sin campos técnicos. |
| `src/lib/clientes/client-validation.ts` | Validación y normalización de cliente. | Bajo. | Reutilizar desde flujos que creen clientes. |
| `src/app/dashboard/usuarios/page.tsx` | Componer listado y filtros de usuarios. | Medio por sensibilidad de perfiles. | Mantener admin-only por proxy y servicio. |
| `src/app/dashboard/usuarios/nuevo/actions.ts` | Crear perfil interno. | Medio-alto por asignación de rol. | No permitir acceso fuera de `usuarios.manage`; mantener FK Auth. |
| `src/app/dashboard/usuarios/[id]/editar/actions.ts` | Editar perfil, rol y estado. | Alto por escalada/último admin. | Mantener guardas TS + DB; agregar QA focal. |
| `src/components/usuarios/InternalUsersList.tsx` | Render perfiles internos. | Medio. | No exponer en rutas públicas; no agregar email Auth. |
| `src/components/usuarios/InternalUserDetail.tsx` | Render perfil, rol, estado, avatar y Auth ID. | Medio. | Mantener sanitizado de avatar y solo dashboard. |
| `src/components/usuarios/UserCreateForm.tsx` | UI para crear perfil de usuario Auth existente. | Medio. | Mantener texto claro: no crea credenciales. |
| `src/components/usuarios/UserEditForm.tsx` | UI de edición de rol/estado. | Alto por campos sensibles. | Servicios y RLS deben seguir siendo autoridad. |
| `src/lib/usuarios/list-internal-users.ts` | Listado filtrado de perfiles. | Medio por datos internos. | Mantener DTO sin email; extraer query si crece. |
| `src/lib/usuarios/get-internal-user-by-id.ts` | Detalle interno por UUID. | Medio. | Mantener `usuarios.view`. |
| `src/lib/usuarios/create-internal-user-profile.ts` | Inserta en `public.perfiles`. | Alto por rol inicial. | Conservar admin-only y errores FK/unique seguros. |
| `src/lib/usuarios/update-internal-user.ts` | Actualiza perfil, rol y estado. | Alto. | Mantener último admin/self guard y trigger DB. |
| `src/lib/usuarios/user-validation.ts` | Valida perfil, rol y estado. | Medio. | Mantener roles desde enum generado. |
| `src/lib/usuarios/roles.ts` | Roles internos desde tipos generados. | Bajo. | Mantener alineado con migraciones/tipos. |
| `src/lib/auth/current-user.ts` | Usuario Auth y perfil activo. | Bajo-medio por `select("*")`. | Evaluar DTOs mínimos por contexto en Beta 2.5.4. |
| `src/lib/permissions/permissions.ts` | Matriz de permisos por rol. | Alto si cambia sin SQL/RLS. | Cambios de permisos deben ser fase explícita. |
| `src/lib/permissions/routes.ts` | Acceso conceptual por ruta. | Medio. | Formalizar caso `/dashboard/pedidos/nuevo` y trabajador. |
| `src/lib/supabase/proxy.ts` | Sesion, perfil activo y bloqueo por ruta. | Alto por seguridad de dashboard. | Mantener fuente compartida con navegación; no relajar sin QA. |

## 8. Patrones repetidos o deuda técnica

- `FormData`: actions de clientes y usuarios repiten `getFormValue` campo a
  campo.
- Action states: `{ ok, message, fieldErrors }` se repite con pequenas variantes.
- Validaciones: normalización de string, UUID, boolean select y enums aparece en
  varios dominios.
- Errores: servicios mapean `unauthorized`, `forbidden`, `validation`,
  `not_found`, `error` con textos similares.
- Revalidaciones: cada action repite rutas de listado/detalle/edición.
- Mappers/DTOs: DTOs son explícitos, pero cada servicio define picks locales.
- Labels: roles viven en `permissions/labels.ts`; usuarios y permisos dependen
  bien de esa fuente.
- Permisos: `hasPermission` está bien centralizado, pero RLS/SQL y TS deben
  mantenerse sincronizados.
- Tests e2e: `full-visual-qa.spec.ts` valida roles básicos, supervisor sin
  usuarios y trabajador sin pedidos no asignados; no hay specs focales de CRUD
  clientes/usuarios.
- Duplicación con Solicitudes: creación/asociación de cliente reutiliza
  validación de clientes, pero el flujo vive correctamente en solicitudes.
- Duplicación con Pedidos: pedidos carga cliente y perfiles asignables; mantener
  DTOs acotados para no filtrar PII o metadata.

## 9. Hallazgos clasificados

| Severidad | Área | Hallazgo | Riesgo | Recomendación |
| --------- | ---- | -------- | ------ | ------------- |
| Alto | Permisos | La matriz de permisos existe en TypeScript y en SQL/RLS. | Drift si se cambia un rol solo en una capa. | Toda fase de permisos debe actualizar TS, SQL/migración, docs, tipos y QA juntos. |
| Alto | Usuarios | `updateInternalUser` permite cambiar rol/estado desde formulario admin. | Escalada o pérdida de admins si una guarda se rompe. | Mantener `usuarios.manage`, self guard, last-admin guard y trigger DB; agregar e2e focal. |
| Medio | Auth | `getCurrentProfile()` usa `select("*")`. | Carga más campos de perfil de los necesarios en algunos contextos. | Crear helper de perfil mínimo si Beta 2.5.4 toca auth/permisos. |
| Medio | Rutas | `/dashboard/pedidos/nuevo` está permitido por prefijo a trabajador, pero página/action lo bloquean. | UX/auditoría menos clara, aunque no hay fuga confirmada. | Formalizar decisión: bloquear por ruta o conservar pantalla explicativa. |
| Medio | Clientes | Datos personales de clientes aparecen en varios dashboards internos y relaciones. | Exposicion accidental si se reutiliza DTO/componente en rutas públicas. | Mantener DTOs internos separados y checklist de ruta pública para cualquier reuse. |
| Medio | E2E | No hay specs focales de Clientes/Usuarios. | Cambios futuros dependerán demasiado de full visual QA. | Agregar e2e focal en Beta 2.5.5. |
| Bajo | CRUD | Clientes y Usuarios repiten actions, states, validaciones y revalidaciones. | Costo de mantenimiento y omisiones menores. | Consolidar helpers pequeños por dominio sin abstracción global prematura. |
| Bajo | Búsquedas | Listados usan query `or(...ilike...)` local. | Crecimiento de filtros puede volver densos los servicios. | Extraer query builders solo cuando se agreguen filtros. |
| Observacion | Seguridad | No se detecta uso operativo de `service_role`, `SUPABASE_SERVICE_ROLE_KEY` ni consultas a `auth.users` en app code del dominio. | N/A | Mantener reglas actuales. |
| Observacion | Componentes | No se detecta Supabase directo en componentes de clientes/usuarios. | N/A | Mantener Client Components como UI/interacción. |

## 10. Plan recomendado para Beta 2.5

1. Beta 2.5.2 - Consolidar dominio Clientes.
   - Revisar README del dominio.
   - Uniformar create/update/list/detail solo donde reduzca duplicación real.
   - Mantener campos y comportamiento.
   - No implementar deduplicación ni eliminación.

2. Beta 2.5.3 - Consolidar dominio Usuarios/Perfiles.
   - Documentar mapa operativo de `src/lib/usuarios`.
   - Revisar actions y guardas de admin.
   - Mantener gestión solo sobre `public.perfiles`.
   - No crear usuarios Auth desde la app.

3. Beta 2.5.4 - Consolidar permisos y helpers de autorización.
   - Formalizar matriz TS/docs/RLS.
   - Evaluar helper de perfil mínimo.
   - Decidir el comportamiento de `/dashboard/pedidos/nuevo` para trabajador.
   - No cambiar roles ni permisos sin migración/fase explícita.

4. Beta 2.5.5 - QA e2e focal de Clientes/Usuarios.
   - Agregar specs pequeños para rutas de clientes y usuarios.
   - Verificar admin, supervisor y trabajador.
   - Cubrir errores seguros y no exposición en rutas públicas.

5. Beta 2.5.6 - Documentar y cerrar dominio Clientes/Usuarios/Permisos.
   - Crear README/mapa operativo final.
   - Registrar pendientes técnicos.
   - Ejecutar auditorías y `verify`.

## 11. Que NO conviene hacer

- No consultar `auth.users` desde app code.
- No usar `service_role`.
- No agregar `SUPABASE_SERVICE_ROLE_KEY`.
- No mover permisos a Client Components.
- No confiar en ocultar botones como seguridad.
- No exponer datos internos en rutas públicas.
- No cambiar RLS sin fase explícita.
- No mezclar refactor con cambios de roles.
- No crear `src/services`.
- No crear usuarios Auth desde la app.
- No pedir email/password en la gestión de perfiles internos.
- No reutilizar DTOs internos de clientes o usuarios en `/estado`.
- No implementar eliminación de clientes o perfiles dentro de esta fase sin
  diseño específico.

## 12. Checklist de cierre de auditoría

- [x] Revisado dominio Clientes.
- [x] Revisado dominio Usuarios/Perfiles.
- [x] Revisado dominio Permisos.
- [x] Revisada relación con Solicitudes.
- [x] Revisada relación con Pedidos.
- [x] Revisado auth/current-user.
- [x] Revisados riesgos de exposición.
- [x] Revisada cobertura e2e vigente.
- [x] Revisada RLS relevante de clientes/perfiles.
- [x] Propuestas subfases de Beta 2.5.
- [x] Confirmado que no se modifico código funcional.
- [x] Confirmado que no se modificaron componentes.
- [x] Confirmado que no se modificaron Server Actions.
- [x] Confirmado que no se modificaron servicios TypeScript.
- [x] Confirmado que no se modificaron migraciones.
- [x] Confirmado que no se modificaron tests.

## 13. Cierre Beta 2.5.6

Los hallazgos históricos anteriores reflejan el diagnóstico inicial de Beta
2.5.1. El estado final del dominio queda registrado en esta sección después de
las subfases 2.5.2 a 2.5.6.

Estado final:

- Clientes queda documentado en `src/lib/clientes/README.md` como dominio
  server-side interno, con rutas, componentes, servicios, revalidación,
  relación con solicitudes/pedidos, datos visibles y datos prohibidos en rutas
  públicas.
- Usuarios/Perfiles queda documentado en `src/lib/usuarios/README.md` como
  gestión de `public.perfiles`, sin crear usuarios Auth, sin consultar
  `auth.users`, sin email/password y sin `service_role`.
- Auth queda documentado con `CurrentProfile` mínimo: `id`, `role` e
  `is_active`. `getCurrentProfile()` selecciona esos campos de forma explícita
  y no usa `select("*")`.
- Permisos conserva una única matriz TypeScript para autorización interna y
  documenta que cualquier cambio funcional de roles debe tocar TypeScript,
  SQL/RLS, documentación y QA por rol en una fase explícita.
- Las specs focales de Beta 2.5.5 quedan registradas como cobertura actual:
  `tests/e2e/clientes.spec.ts` y `tests/e2e/usuarios.spec.ts`.
- La suite e2e actual de Beta 2.5 cubre 13 tests entre smoke, full visual QA,
  clientes y usuarios.

Pendientes técnicos registrados:

- Decidir en una fase posterior si `/dashboard/pedidos/nuevo` debe bloquearse
  por ruta para trabajador o conservar el bloqueo en página/action.
- Mantener sincronizados permisos TypeScript, SQL/RLS, documentación y QA por
  rol ante cualquier cambio futuro de matriz.
- Evaluar una fixture/semilla más estable para e2e si la cobertura focal crece.
- Mantener como deuda futura la posible deduplicación de clientes si aparece
  una necesidad operativa real.
- Definir en una fase futura una política de archivado, desactivación o
  eliminación controlada de clientes; no hay eliminación directa en Beta 2.5.
- Considerar la dependencia de red de Google Fonts durante `next build` cuando
  se ejecute `verify` en entornos restringidos.

Cierre:

- Beta 2.5 queda cerrada documentalmente para Clientes, Usuarios/Perfiles,
  Auth mínimo y Permisos.
- Este cierre no modifica código funcional, componentes, Server Actions,
  servicios TypeScript, migraciones, tipos generados ni tests.
