# SH-03 — Closure Report

## 1. Scope

SH-03 validó funcionalmente la topología production-like `App Docker + Nginx +
Supabase self-hosted`. SH-03.4 ejecutó una regresión agregada focal; no añadió
funcionalidad, producto, migraciones, RLS, infraestructura ni deuda nueva.

## 2. Runtime under test

- Entrada pública: Nginx en `http://localhost:8080`.
- Aplicación Docker y Nginx: healthy/running.
- Servicios requeridos de Supabase self-hosted: healthy/running.
- Health: `GET /api/health/live = 200`; `GET /api/health/ready = 200`.
- El runner oficial confirmó el endpoint público de navegador y aisló el
  transporte interno server-side sin exponer secretos.

## 3. Approved subphases

| Subfase | Estado |
| --- | --- |
| SH-03.0 | CLOSED / APPROVED |
| SH-03.1 | CLOSED / APPROVED |
| SH-03.2 | CLOSED / APPROVED |
| SH-03.3A–E | CLOSED / APPROVED |
| SH-03.4 | CLOSED / APPROVED |

Architectural review: `APPROVED`.

SH-03 global queda `CLOSED / APPROVED`.

## 4. Aggregate regression

| Gate | Resultado | Evidencia |
| --- | --- | --- |
| Runtime health | PASS | `live/ready` 200; contenedores healthy/running |
| QA bootstrap | PASS | `qa:bootstrap:selfhosted`; perfiles y login de tres roles |
| Core | PASS | handoff 1/1; Pedidos y listados 30 PASS, 2 SKIP documentados |
| Pedido TUS | PASS | happy path authenticated 7 MiB 1/1 |
| Solicitud TUS | PASS | happy path signed 7 MiB 1/1 |
| Storage access | PASS | 2/2 |
| Cleanup | PASS | físico 1/1; mantenimiento 4/4 |
| Storage histórico | PASS | 4 PASS, 2 SKIP legítimos |
| Static/security | PASS | auditorías y diff checks |
| Build | PASS | `next build` |
| Baseline | PASS | comparación desde `SH03_BASE_COMMIT` |

## 5. Auth/session

- `smoke.spec.ts`: PASS 6/6.
- `dashboard-shell.spec.ts`: PASS 3/3, SKIP 1 documentado por workspace
  existente.
- `auth-admin-selfhosted.spec.ts`: PASS 1/1.

El reset Auth Admin cambia deliberadamente la contraseña fixture del trabajador.
Se ejecutó al final; un bootstrap restauró el fixture tras el intento agregado
que reveló la dependencia de orden. Es un comportamiento del fixture QA, no una
regresión de sesión o permisos del producto.

## 6. Core business

`core-business-handoff-selfhosted.spec.ts`, `pedidos.spec.ts` e
`internal-listings.spec.ts` terminaron sin fallos: 30 PASS y 2 SKIP ya
documentados. Se reutiliza la evidencia aprobada de Clientes, Servicios,
Solicitudes, Plantillas y Dashboard, sin repetir suites focales sin causa.

## 7. Storage

- Pedido: reserva autenticada, TUS, finalize y navegación canónica committed
  verificadas por el happy path de 7 MiB.
- Solicitud pública: TUS signed, `x-signature`, sin Bearer, finalize y
  `Recibido` verificados por el happy path de 7 MiB.
- Lectura/aislamiento: signed URL pública, descarga funcional, revocación,
  owner binding y staged-to-committed: PASS 2/2.
- Cleanup: fixture TUS real staged, ausencia física comprobada mediante
  `item.object_path → storage.objects`, control committed conservado e
  idempotencia: PASS 1/1; mantenimiento PASS 4/4.

La evidencia detallada permanece en
[SH_03_STORAGE_QA_REPORT.md](SH_03_STORAGE_QA_REPORT.md).

## 8. TD-NEXT-001

La matriz core histórica permanece `31 SAFE / 0 TEST / 5 N/A / 36 TOTAL`.
La manifestación adicional de SH-03.3B queda documentada separadamente:
finalize de Pedido persistía y requería navegación documental canónica tras
`router.refresh` stale. No se detectaron manifestaciones nuevas en C, D, E ni
SH-03.4. Storage público, read/download y mantenimiento permanecen SAFE.

TD-NEXT-001 sigue `ACTIVE`; los fallbacks aprobados no se retiraron en este
cierre.

## 9. Security/static gates

- `npm run lint`: PASS.
- `npm run build`: PASS.
- `npm run audit:security`: PASS, 0 violaciones bloqueantes.
- `npm run audit:client-supabase`: PASS, sin coincidencias.
- `npm run audit:public-tracking`: PASS, sin coincidencias.
- `git diff --check` y `npm run diff:check`: PASS.

Los avisos LF→CRLF son informativos y no introducen errores de whitespace.

## 10. Baseline drift

`SH03_BASE_COMMIT=e6b6bb4` (`docs: cerrar integración self-hosted de SH-02`).

- Migraciones 01–06: sin modificaciones.
- Migration 07: ausente.
- `src/types/database.types.ts`, `compose.yaml`, `Dockerfile`,
  `Dockerfile.nginx` e `infra/SUPABASE_UPSTREAM.md`: sin drift SH-03.
- `docker/nginx/conf.d/default.conf`: un cambio aprobado, `proxy_buffering off`,
  para streaming RSC self-hosted.
- `package.json` y `package-lock.json`: cambio aprobado SH-03.1 de
  compatibilidad runtime/seguridad: `next` y `eslint-config-next`
  `16.2.6 → 16.2.11`. React y React DOM permanecieron en `19.2.4`; la
  regresión SH-03.4 y el build final se ejecutaron sobre Next `16.2.11`.
- SQL bajo `scripts/sql/`: QA-only (PPO-03F aislado y verificadores E), no
  migraciones.

Cambios productivos/runtime aprobados de SH-03:

1. Next.js y `eslint-config-next` `16.2.6 → 16.2.11`.
2. Nginx con `proxy_buffering off` para streaming RSC/App Router.
3. TD-NEXT-001: fallbacks documentales sólo en superficies reproducidas y
   probadas en SH-03.1, SH-03.2 y SH-03.3B; ver
   [TECH_DEBT.md](../development/TECH_DEBT.md),
   [SH_03_CORE_QA_REPORT.md](SH_03_CORE_QA_REPORT.md) y
   [SH_03_STORAGE_QA_REPORT.md](SH_03_STORAGE_QA_REPORT.md).
4. Auth: namespace compartido browser/server/proxy derivado del endpoint
   público.
5. Storage download: firma por endpoint interno server-side y normalización del
   origin browser-facing al endpoint público.

QA/tooling separado de product drift: `test:e2e:selfhosted`,
`qa:bootstrap:selfhosted`, runner/validación de entorno self-hosted, specs
focales SH-03 y scripts SQL QA lifecycle/cleanup. No existe otro drift
productivo o infraestructural desconocido.

## 11. Active debt / non-blockers

- TD-NEXT-001: fallbacks temporales conocidos de navegación self-hosted.
- TD-UPLOAD-001: límite transitorio de 110 MB; owner PPO-03G.
- TD-STORAGE-002: sin AV/cuarentena.
- TD-SECURITY-001: antiabuso público; owner PPO-05.

El cierre SH-03 no implica aprobación para Internet público: PPO-04 permanece
LAN/private hasta el trabajo de PPO-05.

## 12. Final verdict

Architectural review: `APPROVED`. Todos los gates SH-03.4 requeridos pasan.
SH-03.4 y SH-03 quedan `CLOSED / APPROVED`. PPO-03G queda `READY / NEXT`.
No se inicia SH-04, SH-05 ni PPO-03G.

## 13. Handoff to PPO-03G

El siguiente workstream es PPO-03G (`READY / NEXT`). Es owner de TD-UPLOAD-001
y del gate final de infraestructura para los límites transitorios de carga. No
se implementó PPO-03G en SH-03.4.

## Issues found during SH-03

1. **Product compatibility issue:** manifestaciones Next/App Router bajo
   self-hosted; registradas como TD-NEXT-001 con fallbacks focales aprobados.
2. **Product configuration issue:** namespace distinto de cookies entre browser
   y server; corregido en SH-03.3B.
3. **Product configuration issue:** signed download con origen interno;
   corregido en SH-03.3D mediante normalización al origen público.
4. **Test harness issue:** PPO-03F asumía una base QA sin backlog persistente;
   su harness se aisló target-scoped.
5. **QA fixture issue:** un time-warp sólo de `expires_at` violaba un constraint
   válido; se sustituyó por una línea temporal QA coherente.
