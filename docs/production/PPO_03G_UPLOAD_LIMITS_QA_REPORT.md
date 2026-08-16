# PPO-03G — Upload transport limits closure

## 1. Objective

PPO-03G is CLOSED / APPROVED. Its purpose was to remove the legacy 110 MB application
upload allowances and prove, in the self-hosted production-like runtime, that
an exact 20 MiB file remains a direct Browser → Storage TUS transfer for both
Pedido and public Solicitud.

## 2. Starting debt

Before this gate, `next.config.ts` set both
`serverActions.bodySizeLimit` and `proxyClientMaxBodySize` to `110mb`, and the
Nginx server-level `client_max_body_size` was `110m`. TD-UPLOAD-001 remained
active only for this residual transport-limit debt.

The product contract was not changed: `MAX_STORAGE_FILE_SIZE_BYTES = 20 MiB`,
`TUS_CHUNK_SIZE_BYTES = 6 MiB`, and `MAX_UPLOAD_SESSION_ITEMS = 10`.

## 3. Architecture

The approved flow remains unchanged:

```text
Pedido: Browser → authenticated TUS → /storage/v1/ → Storage → finalize
Solicitud: Browser → signed TUS → /storage/v1/ → Storage → finalize
```

Server Actions keep reserve, sign and finalize metadata only. File bytes do not
cross Next.js.

## 4. Configuration changes

- Next `serverActions.bodySizeLimit`: `110mb` before; no override after.
- Next `proxyClientMaxBodySize`: `110mb` before; no override after.
- Nginx app/server limit: `110m` before; `1m` after.
- Nginx `/storage/v1/` limit: `8m`.
- Existing `proxy_request_buffering off` and `proxy_buffering off` remain in
  the Storage location.

Next.js 16.2.11 local documentation records a default `1MB` Server Action body
limit and a default `10MB` `proxyClientMaxBodySize` when no override is set.

## 5. Pedido 20 MiB

PASS in Chromium through `http://localhost:8080`. The production Pedido
component created `QA PPO-03G Pedido <runId>`, reserved the item, completed
authenticated TUS, finalized it, navigated canonically and displayed the
committed PDF. The internal signed download was verified with a byte-range
request.

## 6. Public Solicitud 20 MiB

PASS in Chromium through `http://localhost:8080`. The real public form created
`QA PPO-03G Solicitud <runId>`, completed signed TUS and finalized to
`Recibido`. An authenticated Admin view then confirmed committed metadata and a
functional byte-range download.

## 7. Control-plane evidence

PASS. Every observed upload Server Action POST was below 128 KiB. The focused
spec records only method, pathname, content-length, TUS upload-offset and
boolean auth/signature presence; it does not record credentials, full URLs,
object paths or file paths. Chromium exposes streaming PATCH bodies without a
request `Content-Length`; the server-confirmed `Upload-Offset` is therefore the
authoritative byte-progress evidence.

## 8. Data-plane evidence

PASS. Pedido used authenticated TUS and Solicitud used signed TUS with
`x-signature` present and `Authorization` absent. Both transfers used only
`/storage/v1/upload/resumable...`; no large Server Action request was observed.
The server-confirmed offsets were 6 MiB, 12 MiB, 18 MiB and exactly 20 MiB,
following client PATCH offsets 0, 6 MiB, 12 MiB and 18 MiB.

## 9. Large app body rejection

PASS. A controlled 2 MiB POST to `/login` returned Nginx `413 Payload Too
Large`; no product endpoint or debug route was added.

## 10. Storage vs app boundary

PASS in the same recreated runtime: small application Server Actions passed,
the 2 MiB app request was rejected with 413, and 6 MiB TUS PATCH progress
passed through `/storage/v1/` to final 20 MiB committed files.

## 11. Regression

PASS. `storage-access-selfhosted.spec.ts` passed 2/2 after the existing local
QA identities were bootstrapped. The 20 MiB Pedido creation in this gate is the
focused small Server Action smoke and passed.

The broader historical `server-action-completion-selfhosted.spec.ts` was also
run but failed later while asserting that a newly created Client reappeared in
its first unfiltered list page. Classification: **QA DATA / PAGINATION
ASSUMPTION — NON-BLOCKING**. The Client creation flow closes successfully, but
`listInternalClientes()` orders by `name ASC` and paginates while the self-hosted
database retains persistent QA data; the fixture can therefore fall outside the
first page. This is consistent with TD-QA-003. It is not a TD-NEXT
manifestation, PPO-03G regression or body-size regression, and the spec was not
modified.

## 12. Security/static gates

PASS: static config gate, `npm run lint`, `npm run build`,
`npm run audit:security`, `npm run audit:client-supabase` and
`npm run audit:public-tracking`, `git diff --check` and `npm run diff:check`
all passed. The legacy 110 MB search contains
only this gate/test, the current closure report, and historical documentation;
there is no active runtime/config occurrence.

## 13. TD-UPLOAD-001

TD-UPLOAD-001 = RESOLVED / APPROVED. See `docs/development/TECH_DEBT.md` for
the retained historical context and resolution record.

## 14. Baseline drift

No database work was performed. Git confirms migrations 01–06 and
`src/types/database.types.ts` are unchanged; migration 07 is absent. Compose,
Dockerfile, Dockerfile.nginx and Supabase upstream are unchanged.

## 15. Final verdict

Architectural review = APPROVED. PPO-03G = CLOSED / APPROVED and
TD-UPLOAD-001 = RESOLVED / APPROVED. PPO-03 = CLOSED / APPROVED. SH-03 remains
CLOSED / APPROVED; SH-04 is READY / NEXT but not started. No commit or push was
made.
