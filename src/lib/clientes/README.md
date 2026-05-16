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
- No asocia solicitudes todavía.

El detalle, la edición y la asociación con solicitudes quedan para próximas subfases.
