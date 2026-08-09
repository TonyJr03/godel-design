# PPO-03C.1 - Control plane DB de reservas y finalize

Fecha: 2026-08-09  
Estado: implementada localmente / pendiente revisión arquitectónica

## Alcance implementado

La migración local 20260809000200_08_ppo03c_upload_control_plane.sql implementa
el control plane de reserva y finalize sobre las tablas privadas de PPO-03B.
La migración 07 permanece inmutable y no se realizó ninguna operación contra
PostgreSQL administrado.

El contrato de la RPC pública mantiene primero sus seis argumentos obligatorios
y declara con `DEFAULT NULL` los opcionales de Encargo e Impresión. Esto hace
que los tipos Supabase generados expongan esas propiedades como opcionales, sin
casts: Encargo puede omitir `p_print_*` e Impresión puede omitir
`p_description` y `p_desired_date`. Los `NULL` de nombre, teléfono y
descripción de Encargo se rechazan controladamente con `invalid_public_request`.

- TTL global de cuatro horas y descriptores JSON estrictos de uno a diez items.
- Identificadores, orden, nonce y path de cargas generados en PostgreSQL.
- Reserva atómica pública, reserva autenticada de pedido, autorización pública
  por hash de capacidad y finalizers público e interno.
- Finalize verifica el objeto exacto de Storage, inserta metadata en archivos y
  deja que los triggers existentes generen el historial.
- Finalize idempotente y sesión completed solamente con todos los items
  committed.
- Helpers privados sin grants API y RPCs SECURITY DEFINER con search_path vacío.

La autorización pública rechaza JWT y no filtra si falló sesión, item, hash,
expiración o estado. La autorización interna exige usuario activo, creador de
sesión, acceso vigente al pedido y visibilidad aún compatible con su estado.

## Evidencia local

- Reset local: migraciones 01 a 08 aplicadas.
- Bootstrap QA, tipos Supabase y lint DB correctos.
- Validador SQL reversible ampliado: diez descriptores ordenados, atomicidad,
  matriz representativa de Impresión, estados públicos e internos,
  autorización por rol, visibilidad stale y reintentos tras cambios de estado.
- Smoke local reforzado: el staged no solo es no enumerable; la descarga normal
  por anónimo y autenticado no autorizado es rechazada. El cleanup comprueba
  cero residuos en Storage, sesiones, items, archivos, solicitudes, pedidos e
  historiales asociados antes de imprimir `cleanup_completed=true`.
- Validador SQL reversible: grants, helpers privados, descriptores, staging no
  legible, mismatch de objeto, idempotencia e historial automático.
- Smoke local: TUS firmado público y TUS autenticado interno con POST, PATCH,
  HEAD, reanudación de 6 MiB más restante, staging no enumerable, finalize
  concurrente idempotente y limpieza sin residuos.

## Límite y gate

Hardening final: autorización y finalize públicos reciben capability plaintext
base64url y calculan SHA-256 con extensions.digest contra el hash persistido;
el hash no es una capability reutilizable. La respuesta de reserva conserva
sort_order, finalize devuelve committed o already_committed sin duplicar
metadata/historial y la reserva pública valida Encargo/Impresión en PostgreSQL.
El QA reversible y el smoke cubren capability, orden, multi-item, retry,
staging y cleanup.

No se cambia ningún flujo productivo de UI, Server Actions ni límites heredados.
PPO-03C permanece abierta. El gate pendiente es reserva real, staged real,
presigned TUS administrado y staged no enumerable por actores no autorizados.
