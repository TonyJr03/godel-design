# Clientes

`src/lib/clientes` centraliza la lógica server-side del módulo interno de clientes.

## `listInternalClientes`

- Carga el listado interno de clientes desde Server Components.
- Requiere el permiso `clientes.view`.
- Usa el cliente server-side de Supabase y respeta RLS como defensa final.
- No usa service role key.
- Permite una búsqueda básica por `q` sobre nombre, teléfono y email.
- Devuelve errores controlados para no exponer detalles técnicos al usuario.

La creación, edición, detalle de cliente y asociación con solicitudes quedan para próximas subfases.
