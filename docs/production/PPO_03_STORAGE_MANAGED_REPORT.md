# PPO-03B.2B — Validación HTTPS administrada de DB/Storage

## Resultado

**Estado: Cerrada — Aprobada con condición de integración.**

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
autenticado respondieron sin error con cero objetos visibles. `Storage.list()`
es una operación basada en `SELECT`; una colección vacía es compatible con
filtrado RLS cuando ninguna fila resulta visible. La policy nueva no habilita
`storage.object.list` y la policy SELECT legacy no reconoce `cargas/v1`.

No existía un staged real durante B.2B, por lo que esta evidencia no prueba el
caso de un objeto reservado existente. Tampoco demuestra una apertura ni un
defecto de la migración 07. El harness falla si cualquier actor recibe un objeto
visible y no se modificaron policies para facilitar la prueba.

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

El primer flujo administrado con una reserva real deberá demostrar:

```text
reserva real → staged real → presigned TUS administrado → staged no enumerable por actores no autorizados
```

Es una condición obligatoria de integración de PPO-03C, no un defecto conocido
ni un bloqueador del modelo DB/Storage cerrado en PPO-03B.

## Deuda conservada

Esta validación no cierra `TD-UPLOAD-001`, `TD-STORAGE-001`,
`TD-STORAGE-002`, `TD-SECURITY-001` ni `TD-OBS-001`. Los límites transitorios
de 110 MB permanecen vigentes.
