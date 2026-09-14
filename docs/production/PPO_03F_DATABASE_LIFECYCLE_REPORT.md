# PPO-03F.1 — Lifecycle DB, cleanup authority y amendment final

## Estado

- PPO-03F.0: CLOSED / APPROVED.
- PPO-03F.1: CLOSED / APPROVED.
- PPO-03F: ACTIVE; siguiente PPO-03F.2.

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

## Cierre QA del bugfix Auth Admin

El gate self-hosted detectó que `service_role` tenía `EXECUTE` sobre
`public.complete_initial_password_change(uuid)`, pero no `USAGE` sobre
`public`; por ello el onboarding fallaba con `42501` después del cambio de
contraseña Auth. La migración 06 concede solo `USAGE`, revoca `CREATE` y
endurece una whitelist: la RPC de completion es la única función pública
ejecutable por `service_role`.

- Fresh rebuild self-hosted: PASS; history 6/6; migration 07: 0.
- Onboarding developer por Auth Admin, `godel_provisioning` y trigger: PASS;
  cambio Auth y completion RPC: PASS; flag final: `must_change_password=false`.
- Candidate-before-grace, admin inactivo y admin must-change: PASS.
- Storage API/TUS: solo admin activo eliminó el candidate elegible; los demás
  casos conservaron el objeto. Ante RLS, `remove` devuelve lista vacía y la
  no eliminación se verificó materialmente.
- RPC normal authenticated y RPC pública anon: sin regresión; service_role no
  puede ejecutar reconciliación ni upload RPCs.
- Paridad CLI local: `db reset` 01--06 y `qa:bootstrap` (`QA_PROFILES_OK`): PASS.

El runner CLI contra el stack self-hosted sigue limitado por TLS local; se
validó mediante SQL directo dentro del PostgreSQL self-hosted.

## Handoff

F.1 no añade UI, scheduler ni executor. Toda la matriz DB/Auth/Storage pendiente
quedó validada. PPO-03F.1 está CLOSED / APPROVED.

F.2 implementará:

- executor server-only;
- Storage API con JWT normal;
- operación administrativa manual;
- counts seguros;
- sin scheduler.
