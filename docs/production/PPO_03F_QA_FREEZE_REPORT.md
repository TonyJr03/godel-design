# PPO-03F.3 — QA, freeze y handoff

## Estado

- PPO-03F.0: CLOSED / APPROVED.
- PPO-03F.1: CLOSED / APPROVED.
- PPO-03F.2: CLOSED / APPROVED.
- PPO-03F.3: CLOSED / APPROVED.
- PPO-03F: CLOSED / APPROVED.

## QA ejecutado

Se ejecutó un fresh rebuild local 01–06, seguido de `qa:bootstrap` con login
verificado para admin, supervisor y trabajador. El validador transaccional
`scripts/sql/ppo-03f-lifecycle-qa.sql` terminó con rollback y cubrió la RPC,
la matriz de candidatos y los rechazos de supervisor, trabajador y anon.

Los E2E focales de mantenimiento, pedido upload directo, solicitud pública upload
directo y Storage terminaron con 19 PASS y 2 skips previstos por ausencia de
fixtures estables tras el rebuild. La pantalla de mantenimiento se inspeccionó
en 1366×768 y 390×844; no mostró locators ni overflow horizontal.

## Lifecycle validado

Evidencia ejecutada: abandono materializa `expired` sin `completed_at`; una
sesión mixta conserva el item committed y queda `partial`; todos committed
convergen a `completed`. La separación TTL/grace quedó validada: antes de una
hora no se selecciona el staged, y después se seleccionan sólo candidatos
exactos sin metadata `public.archivos`.

## Cleanup físico e idempotencia

Evidencia ejecutada: una fixture local tras grace se procesó mediante la acción
admin y el Storage API normal; el objeto marcado dejó de existir en
`storage.objects`. La reejecución de reconciliación no rematerializó estados ni
duplicó transiciones. Los tests focales cubren error explícito de Storage,
respuesta silenciosa vacía, eliminación parcial y respuesta sobredimensionada:
cualquier count distinto de candidates devuelve `storage_failed` reintentable.

## Seguridad y concurrencia

Evidencia ejecutada: admin activo permitió maintenance; supervisor y trabajador
fueron denegados por ruta y servicio; anon fue rechazado por la RPC. Los E2E y
el auditor verificaron que UI y acciones no exponen paths, IDs, bucket ni errores
crudos. No hay service role, cliente admin, listado de bucket, DELETE SQL a
Storage ni filesystem directo en el executor.

Garantía arquitectónica revisada: la RPC usa `FOR UPDATE SKIP LOCKED` al
materializar sesiones y el cleanup trabaja por paths exactos; las ejecuciones
solapadas convergen sin claims ni estados auxiliares. No se añadió maquinaria de
concurrencia adicional.

## Fresh rebuild y freeze

Evidencia ejecutada: `supabase db reset` aplicó exactamente las seis migraciones
01–06, y el conteo posterior fue 6. No existe migration 07. El diff de
migraciones y `src/types/database.types.ts` permanece vacío.

La revisión arquitectónica aprobó PPO-03F.3.

`BASELINE 01–06 = FROZEN`.

Toda evolución posterior de base de datos deberá realizarse mediante una nueva
migration 07+. Las migraciones 01–06 no deben volver a modificarse salvo una
decisión extraordinaria explícita de Dirección Técnica.

## Deuda técnica y handoff

TD-STORAGE-001 se retiró de la deuda viva: sesiones, staged conocidos, finalize,
expiración, reconciliación, cleanup e idempotencia/retry ya están demostrados.
TD-UPLOAD-001 continúa activa hasta los gates SH-02, SH-03 y PPO-03G.

Handoff decidido: PPO-03F CLOSED → SH-02. SH-02 no se inició ni implementó en
esta fase.
