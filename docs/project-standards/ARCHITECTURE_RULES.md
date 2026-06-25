# Reglas de arquitectura

## Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage

## Principios

- Claridad antes que complejidad.
- Separacion de responsabilidades.
- Seguridad desde el inicio.
- Escalabilidad razonable.
- Archivos privados por defecto.
- Trazabilidad basica.

## Reglas de implementacion

- Usa Server Components por defecto.
- Usa Client Components solo cuando haya interactividad real.
- No consultes Supabase desde Client Components.
- Mantén las Server Actions finas.
- Mantén la lógica de negocio en `src/lib`.
- Los componentes deben enfocarse en renderizar UI.
- Las operaciones transaccionales críticas deben resolverse con RPC cuando corresponda.
- No dupliques patrones existentes.
- No agregues dependencias sin justificación.
- No implementes funcionalidades futuras fuera del alcance de la tarea.

## Dominios actuales del sistema

- Solicitudes.
- Pedidos.
- Clientes.
- Usuarios y perfiles.
- Permisos.
- Archivos privados.
- Comentarios.
- Historial.
- Tareas de pedido.
- Plantillas de tareas.
- Tracking público.
- Pagos de pedidos.

## Documentos funcionales relacionados

- `docs/PUBLIC_REQUEST_FLOW.md`
- `docs/INTERNAL_REQUESTS_FLOW.md`
- `docs/CLIENTS_FLOW.md`
- `docs/ORDERS_FLOW.md`
- `docs/ORDER_ASSIGNMENTS_FLOW.md`
- `docs/COMMENTS_AND_HISTORY_MODEL.md`
- `docs/USERS_MANAGEMENT_MODEL.md`
- `docs/DASHBOARD_OPERATIVE_MODEL.md`
