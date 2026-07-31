# Clientes

`src/lib/clientes` contiene la lógica server-side del dominio interno de
clientes. El dashboard usa este dominio para listar, consultar, crear y editar
clientes registrados para la operación.

Los datos de clientes son datos personales internos. No deben reutilizarse en
rutas públicas ni en DTOs de `/estado`.

## Mapa de archivos

- `index.ts`: barrel público del dominio.
- `types.ts`: DTOs internos `InternalCliente` e `InternalClienteDetail`.
- `client-validation.ts`: normalización y validación de input editable.
- `list-internal-clientes.ts`: listado interno con búsqueda.
- `get-internal-cliente-by-id.ts`: detalle interno por UUID.
- `create-internal-cliente.ts`: creación manual de cliente.
- `update-internal-cliente.ts`: actualización manual de cliente.

## Rutas internas

- `/dashboard/clientes`: listado interno con búsqueda `q`.
- `/dashboard/clientes/nuevo`: formulario de creación manual.
- `/dashboard/clientes/[id]`: detalle interno.
- `/dashboard/clientes/[id]/editar`: edición interna.

Las rutas viven en `src/app/(interno)/dashboard/clientes` y deben seguir delegando en
servicios de `src/lib/clientes`. Las Server Actions son adaptadores finos:
leen `FormData`, llaman servicios y revalidan rutas.

## Componentes principales

- `InternalClientesList`: listado responsive de clientes.
- `InternalClienteDetail`: detalle interno con datos operativos.
- `ClienteForm`: formulario de creación.
- `ClienteEditForm`: formulario de edición.

Los componentes son UI. No consultan Supabase, no deciden permisos críticos y
no deben reutilizarse en rutas públicas.

## Servicios

- `listInternalClientes` requiere `clientes.view`, busca por `name`, `phone`,
  `email` y `notes`, y devuelve DTO de listado sin notas.
- `getInternalClienteById` valida UUID, requiere `clientes.view` y devuelve el
  detalle con `notes`.
- `createInternalCliente` requiere `clientes.manage`, valida input y crea una
  fila en `clientes`.
- `updateInternalCliente` requiere `clientes.manage`, valida UUID e input, y
  actualiza solo `name`, `phone`, `email` y `notes`.

Todos usan el cliente server-side normal de Supabase, respetan RLS como defensa
final y devuelven errores seguros.

## Tipos y validación

`types.ts` centraliza los DTOs internos:

- `InternalCliente`: `id`, `name`, `phone`, `email`, `created_at`,
  `updated_at`.
- `InternalClienteDetail`: lo anterior más `notes`.

`client-validation.ts` normaliza `name`, `phone`, `email` y `notes`, valida
longitudes, valida email básico y convierte opcionales vacíos a `null`.

## Revalidación

Las rutas de clientes se revalidan con helpers centralizados en
`src/lib/actions/revalidation.ts`:

- `revalidateClientesList()`
- `revalidateClienteDetail(clienteId)`
- `revalidateClienteEdit(clienteId)`

Las actions de clientes deben usar esos helpers en lugar de repetir rutas a
mano.

## Relación con solicitudes

Clientes puede relacionarse con solicitudes de dos formas:

- asociar una solicitud a un cliente existente;
- crear un cliente desde una solicitud ya recibida.

El flujo de creación desde solicitud pertenece al dominio `solicitudes`, porque
la solicitud es el origen de la operación. Ese flujo usa datos persistidos en la
solicitud y delega la parte crítica en la RPC
`public.crear_cliente_desde_solicitud(uuid)`, que crea cliente, historial y
asociación en una transacción.

La creación manual de clientes no debe tomar decisiones sobre solicitudes.

## Relación con pedidos

Los pedidos pueden tener `cliente_id` o quedar sin cliente asociado. El dominio
pedidos valida la existencia/acceso del cliente cuando crea pedidos manuales y
carga datos mínimos de cliente para listados y detalles internos.

Clientes no debe crear pedidos ni forzar la creación automática de clientes
para pedidos sin cliente.

## Datos visibles en dashboard

En rutas internas puede mostrarse:

- nombre;
- teléfono;
- correo;
- notas solo en detalle/edición interna;
- fechas de creación/actualización;
- UUID interno solo dentro del dashboard cuando el componente lo necesite.

## Datos prohibidos en rutas públicas

No deben llegar a `/solicitud` ni `/estado`:

- UUIDs internos de cliente;
- teléfono;
- correo;
- notas;
- nombres de cliente internos derivados de dashboards;
- errores SQL/Postgres/Supabase;
- metadatos crudos.

No reutilices `InternalCliente` ni `InternalClienteDetail` en contratos
públicos.

## Seguridad

- Validar perfil activo y permisos en servidor.
- Mantener `clientes.view` para lecturas internas.
- Mantener `clientes.manage` para creación/edición.
- Usar RLS como defensa final.
- No usar `service_role`.
- No agregar `SUPABASE_SERVICE_ROLE_KEY`.
- No consultar `auth.users`.
- No consultar Supabase desde componentes cliente.

## Estado actual y pendientes

- No hay eliminación de clientes en esta fase.
- No hay deduplicación avanzada todavía.
- La desactivación, archivado o eliminación controlada de clientes requiere
  diseño futuro explícito.
- La deduplicación de clientes queda como posible mejora futura si aparece
  necesidad operativa real.

## Qué no hacer

- No exponer datos de clientes en rutas públicas.
- No reutilizar DTOs internos en `/estado`.
- No mover permisos a componentes.
- No confiar en ocultar botones como seguridad.
- No crear `src/services`.
- No implementar eliminación directa sin fase explícita.
- No mezclar refactors del dominio con cambios de solicitudes, pedidos o RLS.
