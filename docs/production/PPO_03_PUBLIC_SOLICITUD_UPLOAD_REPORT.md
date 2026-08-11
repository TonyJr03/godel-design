# PPO-03E.2 — Integración runtime público de Solicitudes con TUS

Fecha: 2026-08-11

Estado:

```text
PPO-03E.1 — cerrada / aprobada
PPO-03E.2 — implementada / pendiente revisión arquitectónica
PPO-03E — activa
```

## Runtime integrado

`PublicSolicitudForm` ya no envía un `FormData` ni archivos a una Server
Action. Conserva los `File[]` solamente en memoria del navegador y llama al
control plane con valores serializables y descriptores `{ name, size }`.

- Cero archivos: `startPublicSolicitudAction` delega en
  `createPublicSolicitudWithoutUpload`. Encargo puede completarse; Impresión
  conserva el error `files` server-side.
- Uno a diez archivos: la misma acción delega en `reservePublicUpload`. La
  solicitud, sesión e items se crean una única vez antes de transferir.
- La firma pública y finalize usan Server Actions delgadas que delegan
  exclusivamente en `signPublicUpload` y `finalizePublicUpload`.
- No se devuelve ni se renderiza path, UUID, bucket, capability ni firma. La
  capability y la firma permanecen sólo en memoria durante la transferencia.

## Browser-to-Storage

La cola local `PublicSolicitudUploadQueue` usa la infraestructura aprobada
`uploadReservedFile` con autorización pública `x-signature`, endpoint TUS
firmado, `apikey` y `x-upsert: false` ya centralizados por dicho adaptador.

- máximo funcional: 10 archivos;
- máximo por archivo: 20 MiB;
- formatos visibles: PDF, JPG/JPEG, PNG, WEBP, DOC/DOCX, ZIP, RAR y CDR;
- concurrencia máxima local: 2;
- no se usa `file.type` como autoridad;
- antes de iniciar TUS se ordenan y comparan items reservados con nombre y
  tamaño originales.

Cada entry conserva `queued`, `uploading`, `finalizing`, `completed` o `failed`
en memoria. Un retry tras fallo TUS solicita una firma nueva y reanuda el mismo
item; un retry tras fallo de finalize omite firma y TUS y reintenta sólo
finalize. No se crea una segunda solicitud, sesión, item o reserva.

La UI mantiene el código de seguimiento tras crear la solicitud y diferencia
éxito total, parcial y fallo de todos los archivos. El formulario de datos se
bloquea después de crear una solicitud para prevenir doble envío.

## Alcance y seguridad

No se modificaron migraciones, tipos generados, infraestructura, policies,
grants, Compose ni módulos legacy generales. Estos últimos permanecen presentes
sin ser runtime productivo de `/solicitud`; su retirada y la auditoría final de
consumidores corresponden a PPO-03E.3.

No se persisten capabilities, firmas, rutas u otros datos transitorios en
storage del browser, cookies, URL, history ni logs.

## QA

- `git diff --check`, `npm run diff:check`, lint y build: PASS.
- `npm run audit:security`: PASS, 0 violaciones bloqueantes.
- `npm run audit:client-supabase`: PASS, sin coincidencias en componentes.
- Se intentó smoke browser local con `next dev`, `next start` y `next dev
  --webpack`. Ninguno abrió `localhost:3000` y todos los procesos temporales se
  detuvieron. Por ello el smoke visual/TUS real y el spec existente quedan
  bloqueados por el entorno local, no declarados como PASS.

## Handoff a PPO-03E.3

PPO-03E.3 medirá destinos de red y bytes por Next, y aportará gates específicos
de resume, concurrencia, retry parcial/finalize y E2E público antes de retirar
los módulos legacy.
