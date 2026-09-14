# PPO-03D.1 - Integración interna de cargas directas de Pedido

Fecha: 2026-08-10  
Estado: implementada localmente / pendiente revisión arquitectónica

## Alcance implementado

PPO-03D.1 sustituye la ruta interna de Pedido `File -> Server Action -> Next.js
-> Storage` por el control plane de PPO-03C y transferencia directa del
navegador a Storage.

- `reservePedidoFilesAction` recibe exclusivamente `{ name, size }` y delega en
  `reservePedidoUpload`.
- `finalizePedidoFileAction` delega en `finalizePedidoUpload`, acepta la
  idempotencia `committed`/`already_committed` y revalida el detalle.
- `PedidoFileUploadForm` mantiene cada `File` y el JWT normal de Auth solo en
  memoria del navegador; renueva `getStorageAccessToken` antes de cada intento
  que realmente ejecuta TUS y lo entrega a `uploadReservedFile` como autorización
  autenticada.
- La cola local procesa hasta dos items simultáneos, muestra progreso real,
  finaliza cada item al concluir TUS y permite reintentar el mismo item. Si TUS
  ya concluyó y falló finalize, el retry reintenta finalize sin crear una reserva
  nueva.
- El input acepta uno a diez archivos de hasta 20 MiB. La validación de UX usa
  solamente nombre, extensión y tamaño. TypeScript server-side deriva el MIME
  canónico desde la extensión; PostgreSQL valida el descriptor, deriva
  visibilidad y genera sesión, item, nonce y path. Storage/finalize vuelven a
  verificar el objeto.

La constante específica `PPO03_STORAGE_FILE_INPUT_ACCEPT` se deriva del mapa
canónico de PPO-03 e incluye PDF, JPG/JPEG, PNG, WEBP, DOC/DOCX, ZIP, RAR y CDR.
La constante legacy pública no cambió.

## Retiro del flujo legado interno

Tras buscar consumidores productivos no quedaron usos de `uploadPedidoFile`,
`uploadPedidoFileAction` ni del módulo `upload-pedido-file.ts`. Se retiraron el
uploader interno, su export y sus tipos. El uploader público de Solicitudes y
sus paths legacy permanecen sin cambios.

## Gate browser local

`tests/e2e/pedido-upload-direct.spec.ts` ejercita el componente de producción
en Chromium con login interno real y Pedidos QA creados por UI:

- PDF de 7 MiB: reserva real, POST/PATCH TUS browser-to-Storage, progreso,
  finalize y metadata visible mediante el listado normal.
- Reanudación: se aborta el PATCH posterior al primer chunk; el usuario usa
  retry sobre el mismo item, el navegador hace HEAD y continúa el mismo recurso
  TUS antes de finalizar.
- Lote de tres PDF: una reserva de lote, tres commits y máximo dos PATCH activos
  en la cola del navegador.
- UX temprana: once archivos, más de 20 MiB y extensión SVG se rechazan antes de
  reservar.

El recorrido registra solo destino, método, presencia de autorización y tamaño
de requests. Confirmó que los PATCH van al endpoint de Storage y que las POST a
Next.js son de control plane y permanecen muy por debajo del tamaño de archivo;
no registra JWT ni bodies.

## Seguridad y límites

No se añadió `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, cliente admin,
Storage admin, PostgreSQL remoto, base64 ni transporte de bytes hacia Next.js.
La UI recibe temporalmente `objectPath` reservado en memoria para TUS, pero no
lo renderiza, registra ni persiste. Los listados normales no exponen `file_path`
y las descargas siguen pasando por el handler interno de URL firmada. El usuario no selecciona
visibilidad y los estados entregado/cancelado no presentan controles de carga;
la reserva/finalize vuelven a validar autorización y estado.

El resume TUS dentro de la misma página usa `MemoryUrlStorage`; no hay
persistencia cross-page en Web Storage. El `objectPath` reservado tampoco se
persiste fuera de la memoria del runtime.

No se modificaron migraciones 01..08. La migración
`20260809000200_08_ppo03c_upload_control_plane.sql` permanece desplegada e
inmutable. PPO-03E, PPO-03F y la retirada del límite transitorio de 110 MB no
forman parte de esta subfase.

## Validaciones locales

- `npm run lint`
- `npm run build`
- `npx playwright test tests/e2e/pedido-upload-direct.spec.ts --project=chromium --workers=1`
- `npm run spike:ppo-03c1:local`
- `npm run audit:security`
- `npm run audit:client-supabase`
- `npm audit --omit=dev`
- `npm run diff:check`

`npm audit --omit=dev` mantiene tres vulnerabilidades altas transitivas de
`next`, `postcss` y `sharp`. La única corrección propuesta exige
`next@16.3.0`, fuera del rango declarado; no se ejecutó `npm audit fix` ni se
actualizaron dependencias.

## Estado

```text
PPO-03D.1 — implementada localmente / pendiente revisión arquitectónica
PPO-03D — activa
PPO-03 — activa
PPO-03E — pendiente
```
