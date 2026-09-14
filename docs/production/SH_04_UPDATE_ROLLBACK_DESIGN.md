# SH-04.4 — Update and rollback design

**Phase:** SH-04.4A–C — CLOSED / APPROVED; SH-04.4D — CLOSED / APPROVED / PASS_R2_RUNTIME_COMPATIBLE_ROLLBACK; SH-04.4E — CLOSED / APPROVED / PASS_FINAL_ACCEPTANCE
**Date:** 2026-09-02
**Scope:** controlled same-host Supabase bundle update/rollback design and isolated historical capability evidence. It does not authorize or claim an update of the current Godel operational bundle.

## Authority and baseline

| Item | Contract |
| --- | --- |
| Discovery branch / HEAD | `preprod/selfhosted-supabase` / `eb02dec43fff72a028d432de0906acb33c03a667` |
| Current accepted SH-04.4D evidence HEAD | `46b501738425a934535cfeda0c25a64563c47922` |
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

The rollback drill must identify trigger, old and target vendor SHA/tree, immutable image digests, effective config identity, recovery-set ID when required, and D5 generation. It then proves infrastructure health, Auth sessions/tokens, Storage metadata/bytes/signed access, Godel health and frozen regression. For a future real update, the final operational state must be explicitly defined by that candidate's approved runbook and rollback strategy. The historical synthetic D.2 capability rehearsal instead ended in **DISPOSABLE_CLEANUP**: it intentionally did not reapply TARGET after proving rollback, because that would add no capability evidence in a disposable environment.

## Future work contracts

SH-04.4B is `CLOSED / APPROVED / PASS_IMPLEMENTATION`; R1, R2 and R3 are each `CLOSED / APPROVED`. Its reviewed non-mutating wrapper `scripts/operations/supabase-bundle-update-plan.mjs`, invoked as `npm run ops:supabase:update:plan -- --to <official-self-hosted-tag>`, provides exact official-tag resolution, tracked base/lock and optional stamp fail-closed validation, structural and image deltas, breaking-gate analysis, Godel drift validation, real Docker Compose effective-candidate validation, image-aware persistent-state risk, conservative rollback classification, isolated upstream `update.sh` dry-run with an allowlisted subprocess environment, an optional runtime-preflight seam and safe machine-readable evidence. Its hermetic test suite is `npm run ops:supabase:update:plan:test`.

The planner validates tracked base/lock equality; resolves the target only through the exact `refs/tags/self-hosted/vX.Y.Z` ref (then peels annotated tags to their commit); and records `targetTag` separately from `targetCommit`. A branch with the same name is not a target. It produces structural/image/gate reports; derives persistent risk from both paths and changed service images (including db, Auth, Storage, Realtime and Supavisor); and uses R3 recovery-required rollback whenever runtime proof is required. Before any non-zero dry-run it materializes only the target `docker-compose.yml` and tracked Godel override in its temporary workspace, then invokes Docker Compose itself as `docker compose -f <target> -f <override> config --no-interpolate --no-env-resolution --format json`. The parsed merged JSON, not either source file in isolation, must prove required services, closed API gateway/Supavisor host ports, the external API network and gateway attachment, and the Auth/Realtime/Storage/Functions JWT/JWKS override contracts. The temporary render runs with no real `.env` or production environment file and emits only a PASS/FAIL status, never rendered Compose or values. Its isolated `update.sh --dry-run --from <SHA> --to <tag>` subprocess likewise receives only a platform execution allowlist plus `SUPABASE_REPO_URL`, never the parent application/runtime environment. It cleans all temporary resources. Runtime health, D5, lock and failure-marker checks are an optional read-only preflight seam: absent is `NOT_RUN`; only all-PASS evidence is accepted and any failure is fail-closed. It never replaces upstream's merge engine or runs against `infra/supabase/`. A ref mismatch, Compose parser/merge failure, conflict, unclear gate, unknown rollback effect, missing image identity, failed candidate invariant or preflight failure is fail-closed. A zero delta returns `NO_UPDATE_REQUIRED` with candidate Compose `NOT_REQUIRED_ZERO_DELTA`; a safe non-zero proposal returns `UPDATE_PLAN_READY` but does not authorize SH-04.4C.

The machine lock is warranted because the ignored operational stamp cannot be the sole base resolver. It contains only public refs and mirrors, rather than replaces, `SUPABASE_UPSTREAM.md`.

SH-04.4C.0 is `CLOSED / BLOCKED_ACTIONABLE`: it established the historical capability pair `self-hosted/v0.7.2` (`549db119c44c25167461812041ba198bde2b31a4`) → `self-hosted/v0.8.0` (`241bb11c0627f2981746d37033f57dbfa81d29b0`) without altering production. SH-04.4C.1 is `CLOSED / APPROVED / PASS_TOOLING`; its R3 jq preflight correction is `CLOSED / APPROVED / PASS_JQ_PREFLIGHT_FIX`. SH-04.4C.2-P0 is `CLOSED / APPROVED / PASS_READINESS`; jq and all exact images were available, and the planner returned `HISTORICAL_DRY_RUN_PASS`. SH-04.4C.2-A is `CLOSED / APPROVED / PASS_IMPLEMENTATION`. The base fixture probe is `CLOSED / APPROVED / PASS_BASE_FIXTURE_PROBE`; C.2-B attempt #4 is `CLOSED / APPROVED / PASS_RUNTIME_UPDATE`. Consequently SH-04.4C.2 is `CLOSED / APPROVED / PASS_RUNTIME_UPDATE_CAPABILITY`, and SH-04.4C is `CLOSED / APPROVED / PASS_UPDATE_CAPABILITY`.

On 2026-09-02, the isolated C.2 runtime rehearsal materialized the exact historical refs and proved the base fixture before the non-zero update. The base used `kong/kong:3.9.3`; db, auth, rest, storage and kong were healthy. PostgreSQL, Auth Admin and password session, Storage bucket/object, loopback gateway and internal Kong alias checks passed, then the base stopped while preserving data. Isolated upstream `update.sh --from self-hosted/v0.7.2 --to self-hosted/v0.8.0 --yes` passed with zero conflicts and merge failures, a `TARGET_EXACT` stamp and a configuration backup. The target used `envoyproxy/envoy:v1.39.0`; db, auth, rest, storage and api-gw were healthy. The same database, Auth/session, Storage bytes and digest, gateway and internal Kong alias checks passed; fixture comparison also passed.

The rehearsal preserved production evidence: internal and external production fingerprints were unchanged, D5 was `CURRENT / MATCH`, and Godel live readiness passed. Project-scoped containers, networks and volumes reached zero, the temporary workspace was removed, and process lifecycle cleanup passed. No image pull and no production runtime mutation occurred. The `pre-update-*.tgz` configuration/vendor backup is a rollback aid only; it is not an SH-04.1 recovery-grade backup because it does not evidence PostgreSQL and Storage recovery.

Attempt #1 was `FAIL_PRE_RUNTIME_TOOLING` because of a Windows `npm.cmd`/`execFile` incompatibility, corrected with direct Node status handling. Attempt #2 was `INCIDENT_INCONCLUSIVE / CASE_F_INSUFFICIENT_EVIDENCE`, leading to bounded subprocesses, checkpoints, journal ordering and exact production-fingerprint scope. Attempt #3 was `FAIL_BASE_FIXTURE_RUNTIME` (`FIXTURE_HTTP_502`) after base gateway readiness; the update was not executed and production remained unchanged. Its correction required db, auth, rest, storage and gateway health readiness plus granular fixture evidence. The subsequent base fixture probe passed, and attempt #4 passed the runtime update. These are tooling and readiness findings, not claims of Supabase defects.

This C capability proof showed that the exact historical forward update can materialize safely, maintain a healthy base, preserve fixtures across the real non-zero Kong-to-Envoy update, leave production untouched and emit recoverable fail-closed evidence. It was not itself a `CURRENT_RELEASE_COMPATIBILITY_PROOF`, production update or rollback proof; D.2 supplied the separate, exact-pair rollback evidence recorded below.

## Historical rollback acceptance — SH-04.4D/E

On 2026-09-02, D.0 discovery classified the exact historical pair `self-hosted/v0.7.2` (`549db119c44c25167461812041ba198bde2b31a4`) → `self-hosted/v0.8.0` (`241bb11c0627f2981746d37033f57dbfa81d29b0`) as `R2_CANDIDATE / REQUIRES_RUNTIME_PROOF`. Its material delta was the runtime gateway: `kong/kong:3.9.3` / `kong` became `envoyproxy/envoy:v1.39.0` / `api-gw`. PostgreSQL, Auth, REST, Storage, Realtime and Supavisor state-owning images did not change; no database, Auth-schema or Storage migration was identified. This was the `RUNTIME_GATEWAY_CHANGE` gate, not an assumed rollback guarantee.

D.2 proved `R2_RUNTIME_COMPATIBLE_ROLLBACK` only for that exact pair. The isolated flow stopped TARGET without deleting persistent state; preserved PostgreSQL and Storage data plus exact `db-config`; recreated only disposable `deno-cache`; validated the `pre-update-*.tgz` configuration/vendor aid; extracted it into a **fresh rollback runtime**; reattached preserved state; verified BASE config identity; and started historical BASE. The archive was never extracted over TARGET, avoiding TARGET-only residue such as `docker-compose.kong.yml` and `.supabase-version`.

`update.sh` remains a forward update/merge mechanism. **REVERSE UPDATE.SH = REJECTED**: the proof never used `update.sh --from self-hosted/v0.8.0 --to self-hosted/v0.7.2`, never re-applied TARGET, and did not assume an upstream downgrade contract. The `pre-update-*.tgz` archive is a **CONFIG / VENDOR ROLLBACK AID**, not an SH-04.1 recovery-grade backup: it excludes PostgreSQL data, Storage data and backups. Because it held the synthetic runtime `.env` in this rehearsal, it was treated as `SENSITIVE_SYNTHETIC_ENV` and remained in the disposable workspace.

Archive safety was fail-closed: the executor rejects absolute and Windows-drive paths, traversal and backslash paths, symlinks/hardlinks/special entries, backup payload, PostgreSQL/Storage payload and the TARGET stamp. Its identity was checked privately before extraction and remained `STABLE`. Restored `.env` continuity was `MATCH`; the BASE managed-tree path inventory and SHA256 identity fingerprint was `MATCH`, detecting TARGET-only residue without documenting hashes or secret values.

Fixture Set A was created on BASE, validated on TARGET and validated again on restored BASE across PostgreSQL, Auth user/password session, Storage bucket/object bytes, gateway and internal Kong hostname: **PASS**. Decisively, independent Set B was created only while TARGET/Envoy ran, then all of its PostgreSQL, Auth, session, Storage, gateway and internal Kong checks passed after rollback to BASE/Kong. **TARGET-WRITTEN FIXTURE B ROLLBACK = PASS**, proving `R2_RUNTIME_COMPATIBLE_ROLLBACK` for the exact pair.

Production was not altered: the internal fingerprint passed before, was unchanged after TARGET and after rollback, and independent external production evidence remained unchanged; D5 stayed `CURRENT / MATCH` and Godel `LIVE / READY`. No production runtime mutation, secret rotation, image pull, reverse update or TARGET reapply occurred. The executor returned `ROLLBACK_R2_PASS` / `R2_PROVEN`, then exact-project cleanup reached zero containers, networks and volumes; the workspace was removed, process lifecycle passed, final JSON preceded journal removal, and the worktree remained clean with no rehearsal changes.

D.1 was hardened after its first pre-runtime attempt failed before Docker mutation because journal metadata was attached twice (`Cannot redefine property: Symbol(sh044dIncidentJournal)`). The accepted correction uses a single exact generation/path journal attachment. Subsequent review also hardened immutable BASE `.env` identity, tar normalization and lstat identity, exact residue audit, production collision guards for every Compose phase, strict R2 evidence and negative orchestration coverage. Pre-runtime attempt #2 passed.

This result does **not** prove that current Godel was updated or rolled back, that all future updates are R2-compatible, clean-host portability, off-host recovery, backup scheduling/retention, monitoring, public exposure or company deployment. The current Godel Docker snapshot remains equivalent to `self-hosted/v0.8.0` at `241bb11c0627f2981746d37033f57dbfa81d29b0`, while its BASE_REF remains `e846d45ce64207b952a4df44ac8b480ea0abb27e`; therefore **CURRENT OPERATIONAL UPDATE DECISION = NO_UPDATE_REQUIRED**. Future non-zero updates must independently classify persistent effects as R0, R1, R2 or R3; without explicit runtime backward-compatibility proof, R2 must never be assumed and recovery-grade backup remains required for `FORWARD_ONLY`, `UNKNOWN` or R3 effects.

The dedicated executor is `scripts/operations/supabase-update-rollback-rehearsal-execute.mjs`, exposed through `ops:supabase:rollback:rehearsal:execute` and `ops:supabase:rollback:rehearsal:execute:test`. It is dedicated to the historical proof, leaves C.2 untouched, and enforces pre-runtime capability, exact-project isolation, bounded subprocesses, archive validation, A/B fixtures, production fingerprints, fail-closed cleanup, zero-residue auditing and final-output/journal ordering.

**SH-04.4D.2: CLOSED / APPROVED / PASS_R2_ROLLBACK_PROOF. SH-04.4D: CLOSED / APPROVED / PASS_R2_RUNTIME_COMPATIBLE_ROLLBACK. SH-04.4E: CLOSED / APPROVED / PASS_FINAL_ACCEPTANCE. SH-04.4: CLOSED / APPROVED / PASS_UPDATE_ROLLBACK_CAPABILITY. SH-04.5: NOT STARTED. SH-04: IN PROGRESS. SH-05: NOT STARTED.**

## Stop conditions and result

Stop before a real update for no official forward target, unknown persistent or rollback effect, unclear gate, unresolved local conflict, unknown image identity, failed Compose invariant, D5 mismatch, absent required recovery set, or an attempt to guess a base from an absent or invalid local stamp or from `master`.

**SH-04.4A–C: CLOSED / APPROVED; SH-04.4D: CLOSED / APPROVED / PASS_R2_RUNTIME_COMPATIBLE_ROLLBACK; SH-04.4E: CLOSED / APPROVED / PASS_FINAL_ACCEPTANCE.** The current official release ceiling remains `self-hosted/v0.8.0` at `241bb11c0627f2981746d37033f57dbfa81d29b0`, exactly Docker-equivalent to BASE_REF `e846d45ce64207b952a4df44ac8b480ea0abb27e`; the operational Godel bundle result remains `NO_UPDATE_REQUIRED`. The historical proof is limited to its exact pair and is neither a production update nor a generic rollback guarantee. SH-04.4 is `CLOSED / APPROVED / PASS_UPDATE_ROLLBACK_CAPABILITY`; SH-04 remains `IN PROGRESS`; SH-04.5 and SH-05 are `NOT STARTED`.
