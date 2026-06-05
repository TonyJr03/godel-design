# Flujo de Clientes — Godel Design

## Propósito

Este documento describe cómo el equipo interno registra, consulta, edita y asocia clientes dentro del sistema de gestión operativa de Godel Diseño. También explica la relación actual entre clientes y solicitudes recibidas desde el formulario público.

## Alcance actual

El módulo de clientes incluye actualmente:

- Listado interno de clientes.
- Búsqueda básica.
- Creación manual.
- Detalle de cliente.
- Edición de datos básicos.
- Creación de cliente desde una solicitud.
- Asociación de una solicitud con un cliente existente.

Todavía no incluye:

- Eliminación de clientes.
- Historial avanzado.
- Deduplicación inteligente.
- Listado de pedidos por cliente.
- Listado completo de solicitudes por cliente.
- Conversión de solicitud a pedido.
- Archivos privados.

## Rutas del módulo

| Ruta | Propósito |
|---|---|
| `/dashboard/clientes` | Listado interno de clientes con búsqueda básica por `q`. |
| `/dashboard/clientes/nuevo` | Creación manual de cliente. |
| `/dashboard/clientes/[id]` | Detalle del cliente. |
| `/dashboard/clientes/[id]/editar` | Edición de datos básicos del cliente. |

## Permisos

Los accesos del módulo respetan la matriz definida conceptualmente en `docs/PERMISSIONS_MODEL.md`.

| Rol | Acceso a clientes |
|---|---|
| `admin` | Puede ver y gestionar clientes. |
| `supervisor` | Puede ver y gestionar clientes. |
| `trabajador` | No puede acceder al módulo general de clientes. Puede ver datos de clientes relacionados con pedidos asignados desde el detalle del pedido. |

Permisos usados:

- `clientes.view`: permite consultar listados y detalles.
- `clientes.manage`: permite crear y editar clientes.

## RLS

RLS en Supabase restringe:

- Lectura de clientes a `admin` y `supervisor`.
- Lectura de clientes a `trabajador` solo cuando el cliente está relacionado con un pedido asignado.
- Inserción de clientes a `admin` y `supervisor`.
- Actualización de clientes a `admin` y `supervisor`.
- Bloqueo de acceso del `trabajador` al módulo general de clientes.
- Acceso de usuarios anónimos a clientes.

No se usa service role key. RLS es la defensa final: la UI no es la única capa de seguridad.

## Modelo de datos de cliente

Campos principales usados actualmente:

| Campo | Uso |
|---|---|
| `id` | Identificador único del cliente. |
| `name` | Nombre del cliente o contacto. |
| `phone` | Teléfono principal. Es obligatorio porque el modelo actual lo exige. |
| `email` | Correo electrónico opcional. |
| `notes` | Notas internas opcionales. |
| `created_at` | Fecha de creación. |
| `updated_at` | Fecha de última actualización. |

Los campos opcionales vacíos se normalizan a `null`.

## Listado interno

Archivos principales:

- Página: `src/app/dashboard/clientes/page.tsx`
- Servicio: `src/lib/clientes/list-internal-clientes.ts`
- Componente: `src/components/clientes/InternalClientesList.tsx`

El listado carga server-side, valida el permiso `clientes.view` y permite búsqueda por `q`. La búsqueda consulta nombre, teléfono, correo y notas, normaliza y limita el texto recibido y conserva el valor en la URL. Los componentes cliente no consultan Supabase directamente y RLS sigue siendo la defensa final.

La barra común actualiza `q` con `router.replace` tras 200 ms sin escritura y
permite limpiar la búsqueda. El componente cliente solo sincroniza la URL; la
consulta y el filtrado permanecen server-side. Durante la espera muestra
`Buscando...`.

Esta búsqueda pertenece solo al listado de clientes, no es un buscador global. Si el volumen aumenta, podrán evaluarse índices o búsqueda más avanzada en una fase posterior.

## Creación manual

Archivos principales:

- Ruta: `/dashboard/clientes/nuevo`
- Action: `src/app/dashboard/clientes/nuevo/actions.ts`
- Servicio: `src/lib/clientes/create-internal-cliente.ts`
- Formulario: `src/components/clientes/ClienteForm.tsx`
- Validador: `src/lib/clientes/client-validation.ts`

La creación manual requiere `clientes.manage`, valida input server-side y no usa service role key. No implementa deduplicación avanzada.

## Detalle de cliente

Archivos principales:

- Ruta: `/dashboard/clientes/[id]`
- Servicio: `src/lib/clientes/get-internal-cliente-by-id.ts`
- Componente: `src/components/clientes/InternalClienteDetail.tsx`

El detalle carga server-side, valida UUID y usa `notFound()` para id inválido o cliente inexistente. Muestra datos básicos del cliente. Todavía no lista pedidos ni solicitudes asociadas.

## Edición de cliente

Archivos principales:

- Ruta: `/dashboard/clientes/[id]/editar`
- Action: `src/app/dashboard/clientes/[id]/editar/actions.ts`
- Servicio: `src/lib/clientes/update-internal-cliente.ts`
- Formulario: `src/components/clientes/ClienteEditForm.tsx`

La edición requiere `clientes.manage` y permite modificar solo:

- `name`
- `phone`
- `email`
- `notes`

No acepta campos internos, valida input server-side y no implementa eliminación.

## Asociación solicitud-cliente

Desde el detalle de una solicitud se puede:

- Asociar la solicitud a un cliente existente.
- Crear un cliente básico desde los datos de la solicitud y asociarlo.

Archivos principales:

- `src/lib/solicitudes/associate-solicitud-cliente.ts`
- `src/lib/solicitudes/create-cliente-from-solicitud.ts`
- `src/components/solicitudes/SolicitudClienteForm.tsx`
- `src/app/dashboard/solicitudes/[id]/actions.ts`

La asociación actualiza `solicitudes.cliente_id`. No modifica `converted_order_id` y no convierte la solicitud en pedido.

Crear cliente desde solicitud toma los datos desde la solicitud guardada en servidor:

- `client_name`
- `client_phone`
- `client_email`

No confía en datos de cliente enviados desde `FormData`. Si la solicitud ya tiene cliente asociado, no crea otro cliente automáticamente.

## Relación con solicitudes

Referencias conceptuales:

- `docs/PUBLIC_REQUEST_FLOW.md`
- `docs/INTERNAL_REQUESTS_FLOW.md`

Las solicitudes públicas pueden llegar con `cliente_id = null`. Luego, el equipo interno puede asociarlas con un cliente existente o crear un cliente básico desde los datos capturados en la solicitud.

Esta asociación prepara la futura conversión a pedido, pero la conversión se implementará en una fase posterior.

## Seguridad

Capas aplicadas:

1. Proxy por rol.
2. Validación server-side de permisos.
3. Validación server-side de UUID e input.
4. RLS en Supabase.
5. Errores controlados sin detalles técnicos.

Aclaraciones:

- No se usa service role key.
- Los componentes cliente no consultan Supabase directamente.
- `trabajador` no puede gestionar clientes ni entrar al módulo general de clientes.
- `trabajador` puede ver datos de clientes relacionados con pedidos asignados.
- Usuarios anónimos no pueden leer ni modificar clientes.

## Qué no incluye esta fase

- Eliminación de clientes.
- Deduplicación inteligente.
- Historial de cambios.
- Comentarios internos.
- Archivos.
- Pedidos.
- Conversión de solicitud a pedido.
- Estadísticas por cliente.
- Seguimiento público por cliente.

## Consideraciones futuras

Más adelante se podrá:

- Buscar clientes con autocomplete.
- Detectar posibles duplicados.
- Listar solicitudes asociadas al cliente.
- Listar pedidos asociados al cliente.
- Registrar historial de cambios.
- Restringir edición según reglas de negocio.
- Fusionar clientes duplicados si fuera necesario.

## Pruebas manuales recomendadas

- `admin` ve listado de clientes.
- `supervisor` ve listado de clientes.
- `trabajador` no entra a `/dashboard/clientes`.
- Búsqueda por nombre funciona.
- Búsqueda por teléfono funciona.
- Búsqueda por correo y notas funciona.
- Limpiar la búsqueda restaura el listado.
- Crear cliente manualmente.
- Crear cliente con email inválido debe fallar.
- Crear cliente sin teléfono debe fallar.
- Abrir detalle de cliente.
- Id inválido muestra 404.
- Editar cliente.
- Asociar cliente existente a solicitud.
- Crear cliente desde solicitud.
- Verificar que `solicitudes.cliente_id` se actualiza.
- Verificar que `converted_order_id` no se modifica.

## Cierre

Después de esta documentación corresponde la revisión final de la Fase 7 antes de pasar a la siguiente fase del roadmap.
