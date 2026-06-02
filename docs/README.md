# Documentación del proyecto

Esta carpeta contiene documentación estable sobre las partes principales del sistema Godel Diseño: modelo de datos, permisos, Storage, flujos funcionales y dashboard operativo.

## Documentos principales

- `DATABASE_MODEL.md`: modelo de datos y relaciones principales.
- `PERMISSIONS_MODEL.md`: roles, permisos, rutas internas y relación con RLS.
- `STORAGE_MODEL.md`: bucket privado, rutas de archivos, metadatos y descargas firmadas.
- `PUBLIC_REQUEST_FLOW.md`: flujo público de solicitudes.
- `INTERNAL_REQUESTS_FLOW.md`: gestión interna de solicitudes.
- `CLIENTS_FLOW.md`: gestión de clientes.
- `ORDERS_FLOW.md`: gestión de pedidos.
- `ORDER_ASSIGNMENTS_FLOW.md`: asignación de personal a pedidos.
- `COMMENTS_AND_HISTORY_MODEL.md`: comentarios e historial operativo.
- `USERS_MANAGEMENT_MODEL.md`: gestión de perfiles internos.
- `DASHBOARD_OPERATIVE_MODEL.md`: dashboard operativo por rol.

## Documentación de desarrollo

La carpeta `development/` contiene documentos útiles durante la construcción y consolidación técnica, pero más propensos a quedar obsoletos: roadmap histórico, auditorías, deuda técnica y guías de entorno local.

Cuando un documento explique el funcionamiento estable del sistema, debe vivir en `docs/`. Cuando sea seguimiento, deuda, diagnóstico o planificación de desarrollo, debe vivir en `docs/development/`.
