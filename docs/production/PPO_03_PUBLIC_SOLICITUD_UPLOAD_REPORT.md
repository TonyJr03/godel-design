# PPO-03E.2 — Integración runtime público de Solicitudes con TUS

Fecha: 2026-08-11

Estado:

```text
PPO-03E.1 — cerrada / aprobada
PPO-03E.2 — cerrada / aprobada
PPO-03E.3 — implementada / pendiente revisión arquitectónica
PPO-03E — activa / pendiente cierre arquitectónico
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
- La reservation entrega temporalmente al navegador los identificadores,
  `objectPath` y capability requeridos por el control plane y TUS. No se
  renderizan, registran ni persisten. Capability y firmas permanecen sólo en
  memoria durante la transferencia.

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

La URL resumible y el fingerprint TUS se conservan mediante `UrlStorage`
exclusivamente en memoria del runtime del navegador. Desaparecen al recargar o
cerrar la página; el resume cross-page no forma parte del contrato.

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

- El reset previo de Supabase CLI local fue realizado por Dirección Técnica. La
  baseline comprobada conserva las seis migraciones actuales y las cinco
  funciones de control plane requeridas.
- `npm run qa:bootstrap`: PASS; perfiles admin, supervisor y trabajador
  preparados e inicio de sesión comprobado.
- `git diff --check`, `npm run diff:check`, lint y build: PASS.
- `npm run audit:security`: PASS, 0 violaciones bloqueantes.
- `npm run audit:client-supabase`: PASS, sin coincidencias en componentes.
- `tests/e2e/pedido-upload-direct.spec.ts`: PASS, 6/6. Incluye PDF de 7 MiB,
  resume del mismo recurso, lote de tres, concurrencia máxima dos y límites
  tempranos.
- `tests/e2e/public-solicitud.spec.ts`: PASS, 7/7; no se modificaron tests.
  Cubre Encargo sin archivos, Impresión bloqueada sin archivo, Impresión con
  PDF, catálogo y seguridad de servicio público.
- Smoke dirigido en Chromium: PASS. Encargo sin archivos dejó 1 solicitud, 0
  sesiones, 0 items y 0 archivos; Impresión sin archivo dejó 0/0/0/0; Encargo
  con tres PDFs dejó 1 solicitud, 1 sesión, 3 items y 3 archivos committed.
- En el lote público se observaron tres POST y tres PATCH TUS al origen de
  Storage, concurrencia PATCH máxima de dos, y solicitudes POST de Next de
  control plane pequeñas (máximo observado: 414 bytes).
- `MemoryUrlStorage`: PASS. El retry de Pedido reanudó el mismo recurso TUS en
  la misma página; no hay persistencia cross-page. Tras la carga pública no se
  hallaron claves relacionadas con TUS, fingerprint o `cargas/v1` en
  `localStorage` ni `sessionStorage`.

## PPO-03E.3 implementada

`tests/e2e/public-solicitud-upload-direct.spec.ts` añade gates reales de
`/solicitud`: PDF público de 7 MiB, endpoint firmado de Storage, transferencia
que no cruza Next, resume del mismo recurso, Web Storage vacío, lote de tres
con concurrencia máxima dos, retry solo-finalize y límites tempranos. Los POST
de control plane de Next permanecen bajo 128 KiB; los PATCH TUS avanzan los
offsets de chunks del archivo y no usan sesión Bearer pública.

La retirada de código heredado elimina el uploader público directo, creación
pública directa, builders de metadata/rutas legacy y sus contratos TS sin
consumidores. La documentación activa ahora describe el control plane,
`cargas/v1`, TUS firmado, límites 1..10 y los retries vigentes.
