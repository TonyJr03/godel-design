# PPO-03B.2B — Validación HTTPS administrada de DB/Storage

## Resultado

**Estado: ejecutada — aprobación pendiente de evidencia concluyente de listado
en `cargas/v1`.**

La validación se ejecutó contra Supabase administrado mediante HTTPS, con el
contexto `VPN activo / ProTUN`. Codex no desactivó el VPN ni ejecutó
administración PostgreSQL remota, SQL remoto, `psql`, `db push`, `db pull`,
`db lint --linked`, repair ni conexión directa a PostgreSQL.

## Evidencia manual de Dirección Técnica — PPO-03B.2A

La evidencia aprobada y sanitizada indica:

- preflight: seis migraciones sincronizadas y migración 07 pendiente;
- dry-run: sólo aplicaría `20260809000100_07_ppo03b_upload_sessions_storage.sql`;
- push: migración 07 aplicada correctamente;
- postflight: siete migraciones sincronizadas;
- dry-run final: sin pendientes;
- seed: no aplicado.

La administración PostgreSQL fue realizada manualmente por Dirección Técnica
con VPN desactivado únicamente durante esa operación. Codex no reintentó ni
verificó ese canal.

## Evidencia HTTPS de Codex

El harness `npm run spike:ppo-03b2:managed` utiliza sólo URL pública,
publishable key, cliente Supabase normal, `fetch` HTTPS y las credenciales QA
normales disponibles. No usa service role, `SUPABASE_SECRET_KEY`, contraseña de
base de datos, cliente admin ni Storage admin. Su salida contiene sólo estados
sanitizados.

Resultados confirmados:

- el control plane de sesiones/items rechaza `SELECT` e `INSERT` directos para
  `anon`;
- el mismo control plane rechaza `SELECT` e `INSERT` directos para el usuario
  QA autenticado, aunque sea administrador de negocio;
- `createSignedUploadUrl()` sobre una ruta aleatoria `cargas/v1` sin reserva es
  rechazado;
- TUS regular anónimo, endpoint firmado sin `x-signature` y endpoint firmado
  con firma inválida son rechazados;
- TUS authenticated sobre otra ruta `cargas/v1` sin reserva es rechazado:
  un path con forma válida no concede autorización;
- TUS legacy authenticated de Pedido mantuvo POST, PATCH de 6 MiB, HEAD,
  reanudación y PATCH final de 1 MiB;
- el upload legacy público ZIP con
  `application/x-zip-compressed` continuó funcionando;
- cada fixture HTTPS y objeto `ppo-03b2-*` se eliminó por APIs normales antes
  de declarar `cleanup_completed=true`.

No se insertó `public.archivos`; tampoco se crearon filas remotas de
`archivo_carga_sesiones` o `archivo_carga_items`.

## Listado de la raíz nueva

Las llamadas HTTPS `list("cargas/v1")` para `anon` y para el usuario QA
autenticado respondieron sin error con una lista vacía. Ese resultado no se
acepta como evidencia suficiente de que no exista capacidad de listado: sin un
item reservado y sin crear un staged (ambas acciones fuera de B.2B), la API no
permite distinguir un filtro RLS de una raíz realmente vacía.

No es un defecto de schema ni una apertura demostrada. Tampoco se modificaron
policies para facilitar la prueba. La evidencia concluyente de ausencia de
listado, junto con el primer TUS público firmado sobre una reserva real, se
traslada a PPO-03C.

## Compatibilidad de backend

Esta fase valida comportamiento real administrado por HTTPS. No determinó la
versión de Storage mediante SQL. La compatibilidad arquitectónica de
`storage.tus.upload.create`, `storage.tus.upload.part`,
`storage.tus.upload.get`, `/upload/resumable/sign` y `x-signature` fue
contrastada previamente contra el código oficial de Storage v1.68.1.

## Validaciones estáticas

- `node --check scripts/spikes/ppo-03b2/run.mjs`;
- `npm run spike:ppo-03b2:managed`;
- `npm run lint`: correcto;
- `npm run build`: correcto;
- `npm run audit:security`: correcto, sin violaciones bloqueantes;
- `npm run audit:client-supabase`: correcto, sin coincidencias;
- `npm run diff:check`: correcto.

## Gate transferido a PPO-03C

El primer TUS presigned administrado sobre un item creado por las RPCs reales
de reserva es un gate obligatorio de PPO-03C. Esa fase deberá además aportar
evidencia concluyente sobre la ausencia de listado de staged.

## Deuda conservada

Esta validación no cierra `TD-UPLOAD-001`, `TD-STORAGE-001`,
`TD-STORAGE-002`, `TD-SECURITY-001` ni `TD-OBS-001`. Los límites transitorios
de 110 MB permanecen vigentes.
