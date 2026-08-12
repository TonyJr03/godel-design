# PPO-03F.1 — Lifecycle DB, cleanup authority y amendment final

## Estado

- PPO-03F.0: CLOSED / APPROVED.
- PPO-03F.1: IMPLEMENTED / PENDING ARCHITECTURAL REVIEW.
- PPO-03F: ACTIVE; siguiente PPO-03F.2 tras revisión.

## Amendment final

Es el último amendment autorizado de la baseline consolidada: siguen existiendo exactamente seis migraciones y no se creó migration 07. Se mantuvieron intactas 01, 02 y 05; cambiaron solamente 03, 04 y 06. El freeze formal queda para F.3.

## Implementación

`public.reconciliar_cargas_expiradas(p_session_limit integer default 100, p_candidate_limit integer default 100)` es `SECURITY DEFINER`, tiene `search_path = ''`, requiere admin activo y limita ambos argumentos a 1..100. Materializa sesiones `open` vencidas mediante `FOR UPDATE SKIP LOCKED` y devuelve una sola fila de counts más `candidates jsonb` con sólo `item_id` y `object_path`.

| Caso | Resultado |
| --- | --- |
| cero committed | reserved → expired; sesión expired; `completed_at` nulo |
| mezcla committed/reserved | reserved → expired; sesión partial |
| todos committed | sesión completed; items intactos |

Los candidates son globales y reintentables: exigen sesión `expired/partial`, item `expired` sin metadata, grace de una hora, objeto exacto presente y ausencia de `public.archivos` para el mismo bucket/path. El grace no prolonga la sesión: sign/TUS/finalize terminan exactamente en `expires_at`; sólo el cleanup físico se difiere una hora.

El helper de completion es terminal-safe. La policy Storage se estrechó a admin activo y candidate exacto; conserva la rama operation-aware mínima de select que requiere delete API y no amplía las lecturas committed.

## QA

- Fresh rebuild local: PASS; history: 6/6; migration 07: 0.
- DB lint `public,private`: 0 errores.
- Lifecycle, terminal safety, retry global, candidate después de grace, committed y metadata defense: PASS en transacciones con rollback.
- RPC: admin PASS; supervisor, trabajador y anon REJECT; grants `PUBLIC`, `anon` y `service_role`: NONE.
- Storage API con Auth normal: sólo admin eliminó el staged exacto elegible; before-grace, reserved, committed, unknown, supervisor, trabajador y anon conservaron físicamente su objeto. No hubo DELETE SQL a Storage.
- Policies Storage Godel: exactamente 4. Tipos generados incluyen el RPC.

Las fixtures persistentes serán retiradas por fresh reset local al cierre de QA.

## Handoff

F.1 no añade UI, scheduler ni executor. F.2 debe usar la API Storage normal con candidates exactos y retornar sólo counts seguros. La comprobación de admin inactivo/must-change requiere una segunda identidad admin QA: el único admin local está protegido por la integridad del baseline contra auto-desactivación. La selección RPC de candidate before-grace queda como comprobación específica pendiente; el delete before-grace sí fue rechazado por la policy y verificado por estado físico.
