# PPO-03F.2 — Executor server-only y operación manual de cleanup

## Estado

- PPO-03F.0: CLOSED / APPROVED.
- PPO-03F.1: CLOSED / APPROVED.
- PPO-03F.2: IMPLEMENTED / PENDING ARCHITECTURAL REVIEW.
- PPO-03F: ACTIVE.
- Siguiente: PPO-03F.3 tras revisión.

## Implementación

`cleanupExpiredUploads()` es un servicio server-only. Exige un perfil activo,
sin cambio de contraseña pendiente y `configuracion.manage`; usa el cliente
Supabase normal ligado al JWT autenticado del administrador.

Cada ejecución manual llama una sola vez a
`reconciliar_cargas_expiradas(100, 100)`, valida defensivamente la única fila
devuelta y mantiene `item_id` y `object_path` dentro del servicio. Si hay
candidatos válidos, ejecuta una única eliminación exacta mediante Storage API.
El éxito de Storage exige ausencia de error y que el count de objetos devuelto
sea exactamente igual al count de candidatos. Un error explícito o cualquier
desajuste de counts devuelve un resultado reintentable; la reconciliación DB ya
aplicada se conserva. El navegador recibe solo counts seguros.

No se usa service_role, `SUPABASE_SECRET_KEY`, cliente administrativo, listado
del bucket, DELETE SQL sobre Storage, scheduler, cron ni proceso de fondo. Un
fallo de Storage o una eliminación incompleta tras la reconciliación se informa
como reintentable; los cambios DB permanecen válidos y la siguiente operación
manual puede reintentar.

## Operación

La ruta admin-only es `/dashboard/configuracion/mantenimiento`. La operación
requiere confirmación explícita y muestra sesiones, items y archivos como
counts seguros. Configuración muestra Mantenimiento únicamente a administradores.

Scheduling queda diferido a SH-04.
