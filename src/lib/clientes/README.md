# Clientes

`src/lib/clientes` contiene la logica server-side del dominio interno de
clientes. El dashboard usa este dominio para listar, consultar, crear y editar
clientes registrados para la operacion.

Los datos de clientes son datos personales internos. No deben reutilizarse en
rutas publicas ni en DTOs de `/estado`.

## Mapa de archivos

- `index.ts`: barrel publico del dominio.
- `types.ts`: DTOs internos `InternalCliente` e `InternalClienteDetail`.
- `client-validation.ts`: normalizacion y validacion de input editable.
- `list-internal-clientes.ts`: listado interno con busqueda.
- `get-internal-cliente-by-id.ts`: detalle interno por UUID.
- `create-internal-cliente.ts`: creacion manual de cliente.
- `update-internal-cliente.ts`: actualizacion manual de cliente.

## Rutas internas

- `/dashboard/clientes`: listado interno con busqueda `q`.
- `/dashboard/clientes/nuevo`: formulario de creacion manual.
- `/dashboard/clientes/[id]`: detalle interno.
- `/dashboard/clientes/[id]/editar`: edicion interna.

Las rutas viven en `src/app/dashboard/clientes` y deben seguir delegando en
servicios de `src/lib/clientes`. Las Server Actions son adaptadores finos:
leen `FormData`, llaman servicios y revalidan rutas.

## Componentes principales

- `InternalClientesList`: listado responsive de clientes.
- `InternalClienteDetail`: detalle interno con datos operativos.
- `ClienteForm`: formulario de creacion.
- `ClienteEditForm`: formulario de edicion.

Los componentes son UI. No consultan Supabase, no deciden permisos criticos y
no deben reutilizarse en rutas publicas.

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

## Tipos y validacion

`types.ts` centraliza los DTOs internos:

- `InternalCliente`: `id`, `name`, `phone`, `email`, `created_at`,
  `updated_at`.
- `InternalClienteDetail`: lo anterior mas `notes`.

`client-validation.ts` normaliza `name`, `phone`, `email` y `notes`, valida
longitudes, valida email basico y convierte opcionales vacios a `null`.

## Revalidacion

Las rutas de clientes se revalidan con helpers centralizados en
`src/lib/actions/revalidation.ts`:

- `revalidateClientesList()`
- `revalidateClienteDetail(clienteId)`
- `revalidateClienteEdit(clienteId)`

Las actions de clientes deben usar esos helpers en lugar de repetir rutas a
mano.

## Relacion con solicitudes

Clientes puede relacionarse con solicitudes de dos formas:

- asociar una solicitud a un cliente existente;
- crear un cliente desde una solicitud ya recibida.

El flujo de creacion desde solicitud pertenece al dominio `solicitudes`, porque
la solicitud es el origen de la operacion. Ese flujo usa datos persistidos en la
solicitud y delega la parte critica en la RPC
`public.crear_cliente_desde_solicitud(uuid)`, que crea cliente, historial y
asociacion en una transaccion.

La creacion manual de clientes no debe tomar decisiones sobre solicitudes.

## Relacion con pedidos

Los pedidos pueden tener `cliente_id` o quedar sin cliente asociado. El dominio
pedidos valida la existencia/acceso del cliente cuando crea pedidos manuales y
carga datos minimos de cliente para listados y detalles internos.

Clientes no debe crear pedidos ni forzar la creacion automatica de clientes
para pedidos sin cliente.

## Datos visibles en dashboard

En rutas internas puede mostrarse:

- nombre;
- telefono;
- correo;
- notas solo en detalle/edicion interna;
- fechas de creacion/actualizacion;
- UUID interno solo dentro del dashboard cuando el componente lo necesite.

## Datos prohibidos en rutas publicas

No deben llegar a `/solicitud` ni `/estado`:

- UUIDs internos de cliente;
- telefono;
- correo;
- notas;
- nombres de cliente internos derivados de dashboards;
- errores SQL/Postgres/Supabase;
- metadatos crudos.

No reutilices `InternalCliente` ni `InternalClienteDetail` en contratos
publicos.

## Seguridad

- Validar perfil activo y permisos en servidor.
- Mantener `clientes.view` para lecturas internas.
- Mantener `clientes.manage` para creacion/edicion.
- Usar RLS como defensa final.
- No usar `service_role`.
- No agregar `SUPABASE_SERVICE_ROLE_KEY`.
- No consultar `auth.users`.
- No consultar Supabase desde componentes cliente.

## Estado actual y pendientes

- No hay eliminacion de clientes en esta fase.
- No hay deduplicacion avanzada todavia.
- La desactivacion, archivado o eliminacion controlada de clientes requiere
  diseno futuro explicito.
- La deduplicacion de clientes queda como posible mejora futura si aparece
  necesidad operativa real.

## Que no hacer

- No exponer datos de clientes en rutas publicas.
- No reutilizar DTOs internos en `/estado`.
- No mover permisos a componentes.
- No confiar en ocultar botones como seguridad.
- No crear `src/services`.
- No implementar eliminacion directa sin fase explicita.
- No mezclar refactors del dominio con cambios de solicitudes, pedidos o RLS.
