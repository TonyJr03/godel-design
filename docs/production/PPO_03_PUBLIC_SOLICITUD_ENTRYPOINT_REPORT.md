# PPO-03E.1 — Entry point público de Solicitudes sin archivos

Fecha: 2026-08-11

Estado: PPO-03E.1 — implementada / pendiente revisión arquitectónica

Estado de fase: PPO-03E — activa

## Decisión y alcance

El flujo público definitivo no crea sesiones de carga vacías. Un Encargo válido
sin archivos crea únicamente una solicitud. Una Impresión sin archivos continúa
siendo inválida. Cuando hay de 1 a 10 archivos, la reserva pública existente
crea la solicitud, una sesión y sus items antes de la transferencia TUS.

La Dirección Técnica autorizó excepcionalmente integrar esta decisión en la
baseline consolidada de seis migraciones. No se creó migration 07. Los cambios
de baseline se limitaron a `03_business_rpcs.sql` y
`06_final_hardening.sql`.

## Diseño implementado

- `private.create_public_solicitud_record` centraliza la validación pública,
  disponibilidad del servicio, derivación de workflow, reglas de Encargo e
  Impresión, descripción estructurada e inserción de `public.solicitudes`.
- `public.crear_solicitud_publica_sin_archivos` reutiliza ese helper y devuelve
  sólo `solicitud_id` y `public_reference`.
- El nuevo RPC es `SECURITY DEFINER`, tiene `search_path = ''`, revoca `PUBLIC`,
  `authenticated` y `service_role`, y concede `EXECUTE` exclusivamente a
  `anon`.
- El helper privado no concede `EXECUTE` a roles de aplicación ni a `PUBLIC`.
- `crear_solicitud_publica_con_reserva_carga` conserva firma, grants,
  capability/hash, TTL, paths, visibilidad y límite 1..10; valida items antes
  de crear la sesión y delega la solicitud al helper común.
- El servicio server-only `createPublicSolicitudWithoutUpload` revalida el
  servicio y el input con `hasFiles: false`, genera/reintenta la referencia
  pública y usa `createPublicServerClient()` para el RPC final.
- La generación y retry de `public_reference` se centralizaron para el servicio
  nuevo y `reserve-public.ts`; el flujo legacy sigue intacto hasta PPO-03E.2.

## Fresh rebuild y QA

Se destruyó sólo el runtime local de validación y se reconstruyó Supabase
self-hosted desde cero. La serie aplicada fue exactamente 01–06 y el historial
final registró 6/6 versiones actuales.

- Encargo sin archivos: PASS; una solicitud, cero sesiones y cero items.
- Impresión sin archivos: REJECT, sin residuos.
- Servicio oculto: REJECT, sin residuos.
- Referencia, nombre, teléfono, email y fecha inválidos: REJECT, sin residuos.
- Reserva pública con un item: PASS; item `reserved`, sesión `open`, path
  `cargas/v1`, visibilidad `cliente_solicitud` y TTL de cuatro horas.
- Reserva con cero u once items: REJECT, sin residuos.
- Atomicidad: PASS; un trigger de prueba que falla al insertar sesión revirtió
  también la solicitud creada previamente. La prueba completa se ejecutó en
  transacción y se revirtió.
- Grants del RPC nuevo y del helper privado: PASS.
- Storage baseline: owner platform-managed, RLS, bucket privado, MIME final y
  cuatro policies Godel: PASS.
- Negative anonymous Storage API: PASS; listado vacío y acceso arbitrario
  rechazado.
- DB lint: 0 errores, 0 warnings.
- Tipos generados desde self-hosted: PASS.
- `npm run diff:check`, lint y build: PASS.

## Handoff

El formulario público actual continúa usando el runtime legacy y queda
temporalmente incompatible con la baseline, que ya no permite el INSERT legado
anónimo. No se reabrieron permisos para hacerlo pasar. `public-solicitud.spec.ts`
no es un gate funcional completo de PPO-03E.1.

PPO-03E.2 integrará el formulario con reserva, firma TUS y finalize público.
