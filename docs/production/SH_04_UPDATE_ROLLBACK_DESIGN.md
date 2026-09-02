# SH-04.4 — Update and rollback design

**Phase:** SH-04.4A — CLOSED / APPROVED; SH-04.4C.1 — CLOSED / APPROVED / PASS_TOOLING; SH-04.4C.1-R3 — CLOSED / APPROVED / PASS_JQ_PREFLIGHT_FIX; SH-04.4C.2 — CLOSED / APPROVED / PASS_RUNTIME_UPDATE_CAPABILITY; SH-04.4C — CLOSED / APPROVED / PASS_UPDATE_CAPABILITY
**Date:** 2026-09-02
**Scope:** controlled same-host Supabase bundle update/rollback design and isolated historical capability evidence. It does not authorize or claim an update of the current Godel operational bundle.

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

This is neither a direct update nor a staged-update finding. Recreating merely to relabel an equivalent tree adds risk without an upgrade. SH-04.4B is `CLOSED / APPROVED / PASS_IMPLEMENTATION`; its planner must wait for a later official self-hosted tag with a different exact `docker/` snapshot before preparing a real cutover. It must never select `master` automatically. SH-04.4C is `CLOSED / APPROVED / PASS_UPDATE_CAPABILITY`.

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

SH-04.4B is `CLOSED / APPROVED / PASS_IMPLEMENTATION`; R1, R2 and R3 are each `CLOSED / APPROVED`. Its reviewed non-mutating wrapper `scripts/operations/supabase-bundle-update-plan.mjs`, invoked as `npm run ops:supabase:update:plan -- --to <official-self-hosted-tag>`, provides exact official-tag resolution, tracked base/lock and optional stamp fail-closed validation, structural and image deltas, breaking-gate analysis, Godel drift validation, real Docker Compose effective-candidate validation, image-aware persistent-state risk, conservative rollback classification, isolated upstream `update.sh` dry-run with an allowlisted subprocess environment, an optional runtime-preflight seam and safe machine-readable evidence. Its hermetic test suite is `npm run ops:supabase:update:plan:test`.

The planner validates tracked base/lock equality; resolves the target only through the exact `refs/tags/self-hosted/vX.Y.Z` ref (then peels annotated tags to their commit); and records `targetTag` separately from `targetCommit`. A branch with the same name is not a target. It produces structural/image/gate reports; derives persistent risk from both paths and changed service images (including db, Auth, Storage, Realtime and Supavisor); and uses R3 recovery-required rollback whenever runtime proof is required. Before any non-zero dry-run it materializes only the target `docker-compose.yml` and tracked Godel override in its temporary workspace, then invokes Docker Compose itself as `docker compose -f <target> -f <override> config --no-interpolate --no-env-resolution --format json`. The parsed merged JSON, not either source file in isolation, must prove required services, closed API gateway/Supavisor host ports, the external API network and gateway attachment, and the Auth/Realtime/Storage/Functions JWT/JWKS override contracts. The temporary render runs with no real `.env` or production environment file and emits only a PASS/FAIL status, never rendered Compose or values. Its isolated `update.sh --dry-run --from <SHA> --to <tag>` subprocess likewise receives only a platform execution allowlist plus `SUPABASE_REPO_URL`, never the parent application/runtime environment. It cleans all temporary resources. Runtime health, D5, lock and failure-marker checks are an optional read-only preflight seam: absent is `NOT_RUN`; only all-PASS evidence is accepted and any failure is fail-closed. It never replaces upstream's merge engine or runs against `infra/supabase/`. A ref mismatch, Compose parser/merge failure, conflict, unclear gate, unknown rollback effect, missing image identity, failed candidate invariant or preflight failure is fail-closed. A zero delta returns `NO_UPDATE_REQUIRED` with candidate Compose `NOT_REQUIRED_ZERO_DELTA`; a safe non-zero proposal returns `UPDATE_PLAN_READY` but does not authorize SH-04.4C.

The machine lock is warranted because the ignored operational stamp cannot be the sole base resolver. It contains only public refs and mirrors, rather than replaces, `SUPABASE_UPSTREAM.md`.

SH-04.4C.0 is `CLOSED / BLOCKED_ACTIONABLE`: it established the historical capability pair `self-hosted/v0.7.2` (`549db119c44c25167461812041ba198bde2b31a4`) → `self-hosted/v0.8.0` (`241bb11c0627f2981746d37033f57dbfa81d29b0`) without altering production. SH-04.4C.1 is `CLOSED / APPROVED / PASS_TOOLING`; its R3 jq preflight correction is `CLOSED / APPROVED / PASS_JQ_PREFLIGHT_FIX`. SH-04.4C.2-P0 is `CLOSED / APPROVED / PASS_READINESS`; jq and all exact images were available, and the planner returned `HISTORICAL_DRY_RUN_PASS`. SH-04.4C.2-A is `CLOSED / APPROVED / PASS_IMPLEMENTATION`. The base fixture probe is `CLOSED / APPROVED / PASS_BASE_FIXTURE_PROBE`; C.2-B attempt #4 is `CLOSED / APPROVED / PASS_RUNTIME_UPDATE`. Consequently SH-04.4C.2 is `CLOSED / APPROVED / PASS_RUNTIME_UPDATE_CAPABILITY`, and SH-04.4C is `CLOSED / APPROVED / PASS_UPDATE_CAPABILITY`.

On 2026-09-02, the isolated C.2 runtime rehearsal materialized the exact historical refs and proved the base fixture before the non-zero update. The base used `kong/kong:3.9.3`; db, auth, rest, storage and kong were healthy. PostgreSQL, Auth Admin and password session, Storage bucket/object, loopback gateway and internal Kong alias checks passed, then the base stopped while preserving data. Isolated upstream `update.sh --from self-hosted/v0.7.2 --to self-hosted/v0.8.0 --yes` passed with zero conflicts and merge failures, a `TARGET_EXACT` stamp and a configuration backup. The target used `envoyproxy/envoy:v1.39.0`; db, auth, rest, storage and api-gw were healthy. The same database, Auth/session, Storage bytes and digest, gateway and internal Kong alias checks passed; fixture comparison also passed.

The rehearsal preserved production evidence: internal and external production fingerprints were unchanged, D5 was `CURRENT / MATCH`, and Godel live readiness passed. Project-scoped containers, networks and volumes reached zero, the temporary workspace was removed, and process lifecycle cleanup passed. No image pull and no production runtime mutation occurred. The `pre-update-*.tgz` configuration/vendor backup is a rollback aid only; it is not an SH-04.1 recovery-grade backup because it does not evidence PostgreSQL and Storage recovery.

Attempt #1 was `FAIL_PRE_RUNTIME_TOOLING` because of a Windows `npm.cmd`/`execFile` incompatibility, corrected with direct Node status handling. Attempt #2 was `INCIDENT_INCONCLUSIVE / CASE_F_INSUFFICIENT_EVIDENCE`, leading to bounded subprocesses, checkpoints, journal ordering and exact production-fingerprint scope. Attempt #3 was `FAIL_BASE_FIXTURE_RUNTIME` (`FIXTURE_HTTP_502`) after base gateway readiness; the update was not executed and production remained unchanged. Its correction required db, auth, rest, storage and gateway health readiness plus granular fixture evidence. The subsequent base fixture probe passed, and attempt #4 passed the runtime update. These are tooling and readiness findings, not claims of Supabase defects.

This is a `CAPABILITY_PROOF`: the exact historical update mechanism can materialize safely, maintain a healthy base, preserve fixtures across the real non-zero Kong-to-Envoy update, leave production untouched and emit recoverable fail-closed evidence. It is not a `CURRENT_RELEASE_COMPATIBILITY_PROOF`, not a production update and not rollback proof. SH-04.4C is `CLOSED / APPROVED / PASS_UPDATE_CAPABILITY`. SH-04.4D is `NOT STARTED` and may only prove the appropriate rollback class, without presuming a reverse update or authorizing implementation here. SH-04.4E is `NOT STARTED`.

## Stop conditions and result

Stop before a real update for no official forward target, unknown persistent or rollback effect, unclear gate, unresolved local conflict, unknown image identity, failed Compose invariant, D5 mismatch, absent required recovery set, or an attempt to guess a base from an absent or invalid local stamp or from `master`.

**SH-04.4A: CLOSED / APPROVED / PASS_DESIGN. SH-04.4B: CLOSED / APPROVED / PASS_IMPLEMENTATION. SH-04.4C.1: CLOSED / APPROVED / PASS_TOOLING. SH-04.4C.1-R3: CLOSED / APPROVED / PASS_JQ_PREFLIGHT_FIX. SH-04.4C.2-P0: CLOSED / APPROVED / PASS_READINESS. SH-04.4C.2-A: CLOSED / APPROVED / PASS_IMPLEMENTATION. SH-04.4C.2-B base fixture probe: CLOSED / APPROVED / PASS_BASE_FIXTURE_PROBE. SH-04.4C.2-B attempt #4: CLOSED / APPROVED / PASS_RUNTIME_UPDATE. SH-04.4C.2: CLOSED / APPROVED / PASS_RUNTIME_UPDATE_CAPABILITY. SH-04.4C: CLOSED / APPROVED / PASS_UPDATE_CAPABILITY.** The current official release ceiling remains `self-hosted/v0.8.0` at `241bb11c0627f2981746d37033f57dbfa81d29b0`, exactly Docker-equivalent to BASE_REF `e846d45ce64207b952a4df44ac8b480ea0abb27e`; the operational Godel bundle result remains `NO_UPDATE_REQUIRED`. The historical rehearsal is a `CAPABILITY_PROOF`, not a `CURRENT_RELEASE_COMPATIBILITY_PROOF`, production update or rollback proof. SH-04.4 remains `IN PROGRESS`; SH-04.4D, SH-04.4E and SH-05 are `NOT STARTED`.
