# Clientes

`src/lib/clientes` centraliza la lógica server-side del módulo interno de clientes.

## `listInternalClientes`

- Carga el listado interno de clientes desde Server Components.
- Requiere el permiso `clientes.view`.
- Usa el cliente server-side de Supabase y respeta RLS como defensa final.
- No usa service role key.
- Permite una búsqueda básica por `q` sobre nombre, teléfono y email.
- Devuelve errores controlados para no exponer detalles técnicos al usuario.

## Creación manual

La ruta `/dashboard/clientes/nuevo` muestra el formulario interno para crear clientes manualmente.

- `createClienteAction` lee únicamente `nombre`, `telefono`, `email` y `notas` desde `FormData`.
- `createInternalCliente` valida el permiso `clientes.manage` en servidor.
- `validateClienteInput` normaliza el input, valida longitud y formato básico, y convierte campos opcionales vacíos a `null`.
- La inserción usa el cliente server-side de Supabase, respeta RLS y no usa service role key.
- No implementa deduplicación avanzada.

## Detalle interno

La ruta `/dashboard/clientes/[id]` muestra el detalle server-side de un cliente.

- `getInternalClienteById` valida el formato UUID antes de consultar.
- Requiere el permiso `clientes.view`.
- Consulta la tabla `clientes` con el cliente server-side de Supabase.
- Respeta RLS y no usa service role key.
- Devuelve estados controlados para `id` inválido, cliente inexistente, falta de permisos o errores de carga.
- No consulta solicitudes, pedidos ni archivos.

## Edición interna

La ruta `/dashboard/clientes/[id]/editar` permite actualizar datos básicos de un cliente.

- `updateClienteAction` lee únicamente `cliente_id`, `nombre`, `telefono`, `email` y `notas` desde `FormData`.
- `updateInternalCliente` valida el permiso `clientes.manage` en servidor.
- El servicio valida UUID e input antes de actualizar.
- Solo actualiza `nombre`, `telefono`, `email` y `notas`.
- Respeta RLS y no usa service role key.
- No implementa eliminación.

## Asociación con solicitudes

- Los clientes pueden crearse manualmente o desde una solicitud recibida.
- La asociación solicitud-cliente queda registrada en `solicitudes.cliente_id`.
- La creación desde solicitud toma los datos guardados en servidor, no datos de cliente enviados desde el formulario.
- Pedidos y conversión de solicitud a pedido quedan para una fase posterior.
