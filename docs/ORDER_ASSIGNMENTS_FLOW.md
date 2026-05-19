# Flujo de Asignación de Personal a Pedidos — Godel Design

## Propósito

Este documento describe cómo el sistema permite asignar usuarios internos a pedidos para organizar el trabajo operativo de Godel Diseño.

La asignación indica que una persona participa o está involucrada operativamente en un pedido. No cambia el rol real del usuario ni sus permisos globales dentro del sistema.

## Alcance actual

Actualmente el flujo incluye:

- asignación de uno o varios usuarios internos a un pedido;
- remoción de asignaciones concretas;
- visualización del personal asignado en el detalle del pedido;
- visibilidad de personal asignado para trabajadores que pertenecen al mismo pedido;
- cambio de estado por parte de trabajadores asignados;
- control de permisos mediante servicios server-side, RLS y RPC segura para estado.

Actualmente no incluye:

- historial avanzado de asignaciones;
- notificaciones;
- comentarios internos;
- control de carga de trabajo;
- asignación automática;
- roles temporales dentro del pedido;
- diferenciación avanzada entre responsable principal y colaboradores;
- reportes.

## Modelo funcional

Un pedido puede tener varios usuarios internos asignados. Un usuario interno puede estar asignado a varios pedidos.

Los usuarios asignables pueden tener rol:

- `admin`;
- `supervisor`;
- `trabajador`.

Asignar un usuario a un pedido no cambia su rol real. Asignar un `admin` no lo convierte en trabajador. Asignar un `supervisor` no lo convierte en trabajador.

La asignación solo representa participación operativa en ese pedido.

## Modelo técnico

La tabla técnica usada para registrar asignaciones es `pedido_trabajadores`.

Columnas principales:

- `pedido_id`: identifica el pedido asignado.
- `trabajador_id`: identifica el usuario interno asignado.
- `assigned_by`: identifica el usuario que realizó la asignación.
- `assigned_at`: registra la fecha y hora de asignación.

El campo `trabajador_id` conserva el nombre técnico original, pero actualmente representa al usuario interno asignado, que puede tener rol `admin`, `supervisor` o `trabajador`.

Relaciones principales:

- `pedido_trabajadores.pedido_id` se relaciona con `pedidos.id`.
- `pedido_trabajadores.trabajador_id` se relaciona con `profiles.id`.
- `pedido_trabajadores.assigned_by` se relaciona con `profiles.id`.

La restricción única sobre `(pedido_id, trabajador_id)` evita duplicar la misma asignación para el mismo pedido.

## Roles y permisos

`admin` puede asignar y remover personal de pedidos.

`supervisor` puede asignar y remover personal de pedidos.

`trabajador` no puede asignar ni remover personal.

`trabajador` puede ver pedidos donde está asignado, puede ver el personal asignado a esos pedidos y puede cambiar el estado de un pedido si está asignado.

`trabajador` no puede entrar al módulo general de usuarios y no puede listar todos los perfiles internos.

`admin` y `supervisor` conservan sus permisos globales aunque estén asignados operativamente a un pedido.

## Servicios y actions

Archivos principales:

- `src/lib/pedidos/list-assignable-workers.ts`
- `src/lib/pedidos/assign-internal-pedido-worker.ts`
- `src/lib/pedidos/remove-internal-pedido-worker.ts`
- `src/lib/pedidos/order-assignment-roles.ts`
- `src/app/dashboard/pedidos/[id]/actions.ts`
- `src/components/pedidos/PedidoWorkerAssignmentForm.tsx`

`list-assignable-workers.ts` lista usuarios internos activos que pueden asignarse a pedidos. Aunque el nombre conserva “workers” por compatibilidad histórica, el resultado representa personal interno asignable.

`order-assignment-roles.ts` define los roles asignables: `admin`, `supervisor` y `trabajador`.

`assign-internal-pedido-worker.ts` agrega una relación entre pedido y usuario interno. Valida permiso, UUID de pedido, UUID de usuario, existencia del pedido, existencia del usuario, estado activo del usuario y rol asignable.

`remove-internal-pedido-worker.ts` elimina solo la relación concreta entre pedido y usuario interno. No elimina el pedido ni elimina el perfil.

`actions.ts` expone `assignPedidoWorkerAction` y `removePedidoWorkerAction`. Ambas leen únicamente `pedido_id` y `trabajador_id`, delegan en servicios server-side y revalidan el listado y el detalle del pedido.

Los duplicados se evitan con una comprobación previa en el servicio y con la restricción única `(pedido_id, trabajador_id)` en base de datos.

## Interfaz

La sección visible se llama “Personal asignado” y aparece en el detalle del pedido.

`admin` y `supervisor` ven un selector para agregar personal y botones de remoción por cada usuario asignado.

`trabajador` ve la lista en modo lectura, sin controles para agregar ni remover.

El selector oculta usuarios ya asignados cuando están en la lista de personal asignable.

La sección muestra nombre, rol visible y fecha de asignación cuando la información está disponible.

## Seguridad

Capas aplicadas:

- proxy y permisos de ruta;
- permisos server-side;
- validación de UUID;
- validación de rol asignable;
- validación de usuario activo;
- RLS en `pedidos`;
- RLS en `pedido_trabajadores`;
- RLS en `profiles` para que trabajadores vean perfiles del personal asignado al mismo pedido;
- RPC segura para cambio de estado.

Aclaraciones:

- no se usa service role key;
- no se abre lectura pública;
- trabajador no puede gestionar usuarios;
- trabajador no puede modificar perfiles;
- trabajador no puede asignar ni remover personal;
- componentes cliente no consultan Supabase directamente.

## Relación con cambio de estado

Cualquier trabajador asignado puede cambiar el estado del pedido.

Un trabajador no asignado no puede cambiar el estado del pedido.

`admin` y `supervisor` pueden cambiar el estado de cualquier pedido.

El cambio de estado se hace mediante la RPC segura `public.actualizar_estado_pedido`.

No se hace un `UPDATE` amplio inseguro sobre `pedidos` desde el código de aplicación.

## Limitaciones actuales

- No hay responsable principal diferenciado.
- No hay historial de quién fue removido.
- No hay notificaciones al asignar.
- No hay métricas de carga por usuario.
- No hay comentarios internos.
- No hay asignación automática.

## Consideraciones futuras

Posibles mejoras:

- responsable principal más colaboradores;
- historial de asignaciones;
- notificaciones internas;
- vista de carga de trabajo por usuario;
- filtros por personal asignado;
- reglas de transición de estado por rol;
- comentarios internos por pedido.

## Pruebas manuales recomendadas

- Admin asigna trabajador.
- Admin asigna supervisor.
- Admin asigna admin.
- Supervisor asigna trabajador.
- Trabajador no ve controles de asignación.
- Trabajador ve el personal completo del pedido asignado.
- Asignar el mismo usuario dos veces no duplica.
- Remover un usuario no elimina el pedido.
- Remover un usuario no elimina el perfil.
- Al asignar varios usuarios, todos aparecen en el detalle.
- El trabajador asignado ve el pedido en su listado.
- El trabajador no asignado no ve el pedido.
- Trabajador asignado cambia estado.
- Trabajador no asignado no cambia estado.

## Relación con otros documentos

Documentos relacionados:

- `docs/ORDERS_FLOW.md`
- `docs/PERMISSIONS_MODEL.md`
- `docs/DATABASE_MODEL.md`
