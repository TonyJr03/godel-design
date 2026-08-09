# PPO-03C.3B - Gate HTTPS administrado del control plane de cargas

Fecha: 2026-08-09  
Estado: cerrada / aprobada

## Contexto y límites

Dirección Técnica promovió manualmente PPO-03C.3A: las migraciones 01 a 08
quedaron sincronizadas y la migración
`20260809000200_08_ppo03c_upload_control_plane.sql` es inmutable. La ejecución
de Codex usó ProTUN activo y solamente Auth, PostgREST/RPC, Storage y TUS por
HTTPS con publishable key y dos identidades QA normales. No ejecutó PostgreSQL
remoto, Supabase CLI enlazado, service role, `SUPABASE_SECRET_KEY`, cliente
admin ni operaciones de migración.

## Evidencia del gate

El harness `npm run spike:ppo-03c3:managed` creó fixtures exclusivamente a
través de las RPC productivas y transfirió dos PDF de 7 MiB mediante TUS directo
al hostname administrado de Storage. En ambos modos comprobó POST 201, primer
PATCH de 6 MiB, HEAD con offset 6 MiB, PATCH final y completion.

- Público: reserva real de Encargo, capability en memoria con hash SHA-256,
  autorización de firma correcta y rechazo de capability incorrecta. TUS
  regular anónimo y endpoint firmado sin firma o con firma inválida fueron
  rechazados. Antes de finalize, anon y trabajador QA no enumeraron ni
  descargaron el staged. Finalize devolvió `committed`/`completed` y el retry
  devolvió `already_committed` con el mismo archivo.
- Interno: Pedido fixture creado por RPC normal, reserva derivada de estado y
  rechazo del trabajador QA sobre el Pedido ajeno. TUS sin JWT fue rechazado;
  con JWT de la sesión del actor autorizado completó la transferencia. Anon y
  trabajador QA no enumeraron ni descargaron el staged; finalize y su retry
  fueron idempotentes.

Después del commit público, el admin QA pudo leer la metadata `archivos` por
RLS. La descarga directa de Storage siguió sin exponerse, por lo que la ruta
correcta permanece en la descarga firmada server-side existente; no se amplió
ninguna policy para el harness.

## Cleanup y limitaciones

El recorrido aprobado terminó con `cleanup_completed=true`. El cleanup
recuperatorio posterior por API normal encontró cero Solicitudes QA residuales
del prefijo exclusivo PPO-03C.3B. No se crearon políticas temporales ni se
usaron bypasses administrativos.

El primer PATCH TUS emitido por `fetch` de Node se agotó bajo ProTUN. El
harness cambió únicamente ese transporte HTTP crudo a Chromium headless y el
recorrido completo pasó; no ejecutó `uploadReservedFile()` ni afirma validación
browser del wrapper productivo. Ese gate permanece en PPO-03D para authenticated
y PPO-03E para presigned, junto con UI, progreso y ausencia de bytes por Next.js.

## Validaciones

- `node --check scripts/spikes/ppo-03c3/run.mjs`: correcto.
- `npm run spike:ppo-03c3:managed`: correcto.
- `npm run spike:ppo-03c3:cleanup`: cero fixtures residuales.
- `npm run lint` y `npm run build`: correctos.
- `npm run audit:security`: cero violaciones bloqueantes.
- `npm run audit:client-supabase`: sin coincidencias.
- `npm run diff:check`: correcto.

## Veredicto

```text
PPO-03C.1 — cerrada
PPO-03C.2 — cerrada con condición runtime en PPO-03D/E
PPO-03C.3A — cerrada
PPO-03C.3B — cerrada
PPO-03C — cerrada
PPO-03D — siguiente
```
