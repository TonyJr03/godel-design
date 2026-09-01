# SH-04.4 — Update and rollback design

**Phase:** SH-04.4A — CLOSED / APPROVED
**Date:** 2026-09-01
**Scope:** controlled same-host Supabase bundle update/rollback. This is architectural only: it does not pull images, alter vendor files, recreate services, back up or restore data, rotate secrets, update or rollback.

## Authority and baseline

| Item | Contract |
| --- | --- |
| Branch / HEAD | `preprod/selfhosted-supabase` / `eb02dec43fff72a028d432de0906acb33c03a667` |
| Worktree before discovery | CLEAN; `git diff --check` passed |
| Official source | `https://github.com/supabase/supabase.git`, path `docker/` |
| BASE_REF | `e846d45ce64207b952a4df44ac8b480ea0abb27e` (2026-08-11) |
| Human authority | `infra/SUPABASE_UPSTREAM.md` |
| Machine mirror | `infra/supabase-upstream.lock.json`; disagreement is fail-closed |

The ignored `infra/supabase/.supabase-version` remains absent. Its absence is valid: SH-04.4B resolves BASE_REF from `infra/SUPABASE_UPSTREAM.md` and `infra/supabase-upstream.lock.json`, requires their full SHAs to agree, then passes that exact base explicitly as `update.sh --from`. If a local stamp exists, it must be well-formed and match the expected tracked/runtime state; only a present malformed or mismatching stamp is fail-closed. It is an operational stamp, not project authority, and must not be created or hand-edited. Never guess a base. A future accepted update may advance the local stamp, but the tracked pin changes only after the reviewed final runtime state is known.

Discovery used official read-only Git refs and temporary sparse snapshots. No candidate content was copied to `infra/supabase/`; no Docker command ran.

## Target selection and upstream delta

Official refs discovered: `v0.5.0`, `v0.5.1`, `v0.6.0`, `v0.7.0`, `v0.7.1`, `v0.7.2`, and `v0.8.0`. Immediate predecessors of the latest are `self-hosted/v0.7.2` (`549db119c44c25167461812041ba198bde2b31a4`) and `self-hosted/v0.7.1` (`9e225a279b33e4e6e1452e573a40a6a25aa2cb2f`).

| Latest official candidate | Exact SHA | Release date | Decision |
| --- | --- | --- | --- |
| `self-hosted/v0.8.0` | `241bb11c0627f2981746d37033f57dbfa81d29b0` | 2026-08-11 | **NO_UPDATE_REQUIRED / BASE_DOCKER_EQUIVALENT_TO_LATEST_RELEASE**: its `docker/` snapshot is exactly identical to BASE_REF. It is the current release ceiling, not a pending update. |

Both snapshots have 61 files. Structural delta is zero added, zero removed and zero modified paths. Accordingly, there are no high-risk changed paths in COMPOSE, ENV_EXAMPLE, API_GATEWAY, AUTH, REST, REALTIME, STORAGE, POSTGRES, SUPAVISOR, FUNCTIONS, META, STUDIO, IMGPROXY, SCRIPTS, MIGRATIONS, UPDATE_TOOLING or OTHER.

This is neither a direct update nor a staged-update finding. Recreating merely to relabel an equivalent tree adds risk without an upgrade. SH-04.4B is NEXT and must wait for a later official self-hosted tag with a different exact `docker/` snapshot before preparing a real cutover. It must never select `master` automatically.

## Breaking gates and persistent state

`update.sh` uses a semver window. Since BASE_REF is a SHA, its open lower bound can over-report entries; a printed gate is review input, not proof of applicability.

| Gate | Classification | Contract |
| --- | --- | --- |
| `0.6.0` PostgreSQL 15 → 17 | ALREADY_PRESENT_IN_BASE | BASE_REF already uses the Postgres 17 bundle. Do not run its major-migration gate. |
| `0.7.0` external Auth URL / anon OpenAPI | ALREADY_PRESENT_IN_BASE | Future targets must verify custom OAuth/SAML callbacks and absence of a Godel dependency on anon schema access. |
| `0.8.0` Kong → Envoy / `api-gw` | ALREADY_PRESENT_IN_BASE | Base and target are identical and already use the current gateway contract. |
| Later manifest entries | NOT_APPLICABLE | None exists in the selected tag. Reclassify from exact refs for every later target. |

There is no `UNCLEAR` gate for the no-op candidate. An unclear future gate stops cutover; `--yes` may never bypass it.

| Persistent area | Classification for this candidate | Basis |
| --- | --- | --- |
| PostgreSQL major / extensions | NO_PERSISTENT_CHANGE | Same source and bundle declaration. |
| Auth schema | NO_PERSISTENT_CHANGE | No source or image-configuration delta. |
| Storage schema / bytes | NO_PERSISTENT_CHANGE | No source or Storage-image configuration delta. |
| Realtime, Supavisor and other service-owned state | NO_PERSISTENT_CHANGE | No source delta. |

This is not a general backward-compatibility claim. A future target must classify every affected area as `NO_PERSISTENT_CHANGE`, `BACKWARD_COMPATIBLE`, `FORWARD_ONLY`, `REQUIRES_RUNTIME_PROOF` or `UNKNOWN`. Any rollback-relevant `UNKNOWN` blocks SH-04.4C.

`update.sh` configuration backup is not the SH-04.1 recovery set: it excludes PostgreSQL and Storage bytes. A fresh recovery-grade backup is **NOT_REQUIRED_WITH_EVIDENCE** only for this unauthorized no-op candidate. It is **REQUIRED** for every future target that can start a different runtime or mutate persistent state.

## Godel drift and effective Compose

The BASE_REF-to-local comparison excluded operational state (`.env`, local stamp, backups, DB data, Storage bytes, snippets and ignored Functions state). It found exactly these tracked local edits:

| Path | Classification | Required handling |
| --- | --- | --- |
| `infra/supabase/.env.example` | GODEL_REQUIRED | Preserve Godel guidance and disabled optional integrations; review new keys by name, never values. |
| `infra/supabase/CONFIG.md` | GODEL_REQUIRED | Deliberately reconcile Godel configuration guidance after any future vendor merge. |
| `infra/supabase/docker-compose.yml` | GODEL_REQUIRED | Preserve serialized JWT/JWKS handling, optional-protocol guidance and runtime compose details; high-risk merge surface. |
| `infra/supabase/volumes/db/jwt.sql` | GODEL_REQUIRED | Preserve initialization adjustment without exposing key material. |

There is no local `UPSTREAM_CHANGED_LOCAL_EDIT`, `UPSTREAM_UNCHANGED_LOCAL_EDIT`, `HISTORICAL_PATCH_NO_LONGER_REQUIRED` or `UNKNOWN` for this candidate. Rebuild this matrix for any future target and never remove a local edit automatically.

`infra/supabase-godel.override.yml` and root `compose.yaml` are Godel-owned overlays, never vendor-merge inputs. A future candidate render (not performed in A) combines reviewed vendor Compose with the Godel override and separately checks Godel's external network attachment. These invariants are release gates:

- `api-gw` and Supavisor have no host ports.
- `godel-supabase-api` remains external and `api-gw` retains its alias.
- Auth, Realtime, Storage and Functions retain the reviewed JWT/JWKS JSON serialization/fallback contract.
- Godel retains its internal `SUPABASE_SERVER_URL` to `api-gw`, while the browser uses the public Supabase URL.
- The server-only secret-key contract remains unchanged; no secret, JWK, JWT, password, key identifier or signed URL is rendered, logged or documented.

## Secret continuity and rollback model

D5 remains `CURRENT / MATCH`; no secret was read or rotated. Source equivalence makes legacy `JWT_SECRET` verification, `JWT_KEYS`/`JWT_JWKS`, asymmetric anon and service-role keys, opaque publishable/secret keys, Dashboard Basic Auth and PostgreSQL credentials **EXPECTED_COMPATIBLE** for this candidate. A future runtime target requires operational proof of each item before cutover.

| Class | Contract |
| --- | --- |
| R0_PRE_RUNTIME_ABORT | Target runtime did not start and persistent state did not change. |
| R1_CONFIG_VENDOR_ROLLBACK | Candidate files changed but target did not run; restore reviewed old vendor/config identity. |
| R2_RUNTIME_COMPATIBLE_ROLLBACK | Target ran and explicit evidence proves old-bundle compatibility. |
| R3_RECOVERY_REQUIRED_ROLLBACK | A forward-only transformation may have occurred; restore recovery set, old bundle and matching external generation. |

The minimum expected class for this no-op candidate is **R0_PRE_RUNTIME_ABORT**. No R2/R3 compatibility claim is made. For a future non-empty target, missing proof defaults to R3, never R2.

The rollback drill must identify trigger, old and target vendor SHA/tree, immutable image digests, effective config identity, recovery-set ID when required, and D5 generation. It then proves infrastructure health, Auth sessions/tokens, Storage metadata/bytes/signed access, Godel health and frozen regression. The recommended drill final state is **ON_UPDATED_TARGET**: after proving the previous bundle recoverable, re-establish and accept the reviewed target so the intended version remains active. No drill is scheduled for the no-op candidate.

## Future work contracts

SH-04.4B implements the smallest reviewed wrapper around upstream `update.sh`, not a replacement merge engine. It must validate tracked base/lock equality; resolve explicit official base and target refs; acquire temporary snapshots; produce structural/image/gate reports; run `update.sh --dry-run --from <SHA> --to <tag>` only in an isolated candidate; render sanitized effective Compose; check overlays; classify persistent/rollback risk; preflight health and D5; and emit machine-readable review evidence. A ref mismatch, conflict, unclear gate, unknown rollback effect, missing image identity, failed invariant, health failure or D5 mismatch is fail-closed.

The machine lock is warranted because the ignored operational stamp cannot be the sole base resolver. It contains only public refs and mirrors, rather than replaces, `SUPABASE_UPSTREAM.md`.

SH-04.4C, only after a non-empty target review, is: preflight → recovery checkpoint when required → reviewed candidate/images → controlled recreate → infrastructure health → DB/Auth/Storage compatibility → secret continuity → Godel integration → frozen regression → stability observation.

SH-04.4D proves class-specific rollback, not merely tag reversal. SH-04.4E closes only with evidence of exact target and reproducible path, preserved overlays, known persistent effects, accepted update, successful classified rollback and post-rollback acceptance, explicit desired final state, no implicit secret-generation rollback, and repository/upstream pin matching final runtime.

## Stop conditions and result

Stop before a real update for no official forward target, unknown persistent or rollback effect, unclear gate, unresolved local conflict, unknown image identity, failed Compose invariant, D5 mismatch, absent required recovery set, or an attempt to guess a base from an absent or invalid local stamp or from `master`.

**SH-04.4A: CLOSED / APPROVED / PASS_DESIGN.** The current official release ceiling is already represented by the tracked vendor base. SH-04.4B is NEXT; no runtime update is authorized until a forward official target exists.
