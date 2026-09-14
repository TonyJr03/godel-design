# Supabase Self-Hosted Operations Runbook

## 1. Purpose and scope

This is the permanent operator entry point for technical same-host operation of
Godel with Supabase self-hosted. It integrates proven baseline checks,
secret-generation status, recovery-grade backup, update planning, rollback
classification, and procedure-owned failure handling.

It does not authorize public exposure, a general production restore, or an
update or rollback by itself. It does not define backup schedule, retention,
off-host destination, RPO/RTO, monitoring, clean-host portability, or a
deployment to the selected operational VPS.

## 2. Operational safety principles

- Fail closed when an expected identity, gate, health result, or recovery
  requirement is absent or ambiguous.
- Use exact tracked identities; do not guess refs, images, scope, or an
  operational stamp.
- Keep secret values and protected recovery material out of evidence.
- Do not skip procedure phases, cross phase boundaries manually, or retry a
  failed mutable operation automatically.
- Preserve procedure-defined failure evidence.
- Destructive actions require explicit authorization for the affected procedure.

## 3. Terminology and traceability

Operational terms are lifecycle-independent: **active external secret
generation**, **recovery-grade backup**, **same-host technical restore**,
**update candidate**, **update plan**, **rollback classification**, and
**runtime-compatible rollback**.

The stable domain classifications are `R0_PRE_RUNTIME_ABORT`,
`R1_CONFIG_VENDOR_ROLLBACK`, `R2_RUNTIME_COMPATIBLE_ROLLBACK`, and
`R3_RECOVERY_REQUIRED_ROLLBACK`. Use the semantic name with the code where
practical.

Identifiers such as SH-04.4C, C.2, D.2, and D.5 are historical traceability
IDs: they identify provenance and acceptance evidence only, not permanent
operator actions or resources. Likewise, `PASS_RUNTIME_UPDATE`,
`PASS_R2_ROLLBACK_PROOF`, and `PASS_FINAL_ACCEPTANCE` are evidence labels,
not commands or resource identities.

`D5` is a historical alias for the generation established during historical
step D.5. It is not the name of the current generation or a registry. The
canonical operational identity is the active external secret generation ID in
the external secret generation registry, protected operational state managed by
the existing tooling.

## 4. Canonical authorities

Read the applicable authority before a procedure; this runbook does not repeat
their internal design:

- [SH-04 operations design](SH_04_OPERATIONS_DESIGN.md)
- [SH-04 backup QA report](SH_04_BACKUP_QA_REPORT.md)
- [SH-04 secrets and Auth report](SH_04_SECRETS_AUTH_REPORT.md)
- [SH-04 secret rotation report](SH_04_SECRET_ROTATION_REPORT.md)
- [SH-04 update and rollback design](SH_04_UPDATE_ROLLBACK_DESIGN.md)
- [Supabase upstream authority](../../infra/SUPABASE_UPSTREAM.md)
- [Machine-readable upstream lock](../../infra/supabase-upstream.lock.json)

The human-readable upstream authority governs the baseline; the lock mirrors it
for fail-closed tooling and does not replace it.

## 5. Pre-operation baseline

Before an operation, perform the checks applicable to that procedure:

- Confirm the repository/ref expected by the procedure and an appropriate
  worktree state.
- Identify the production Compose scope exactly and confirm it is unambiguous.
- Confirm required Supabase services are healthy and Godel is live/ready.
- Check for an unresolved operation lock, failure marker, or residue relevant to
  the procedure.
- Confirm an initialized active external secret generation and `MATCH` status.
- Run secret validation where required.
- Confirm required tools and applicable recovery evidence are available.

There is no monolithic health CLI. Use the documented procedure-specific checks;
do not replace them with guessed Docker commands.

## 6. Secret-generation status

Use the canonical read-only status interface:

```text
npm run ops:secrets:generation:status
```

It must resolve an initialized active generation ID and report that it matches
the live Supabase and Godel environments. A generation-operation lock or a
mismatch is fail-closed. Do not hand-edit generation metadata or a current
pointer, and do not rerun a historical secret-rotation phase as an operational
shortcut.

Use the canonical secret-contract validation when the affected procedure
requires it:

```text
npm run ops:secrets:check
```

Neither interface is a mechanism to expose or record secret values.

## 7. Recovery-grade backup

The canonical create interface is:

```text
npm run ops:backup:selfhosted
```

Verify a completed backup with:

```text
npm run ops:backup:selfhosted:verify -- --backup <path>
```

The backup contract uses schema v3: a recovery candidate must be `COMPLETE`,
pass checksum verification, include its required recovery material, and record
the external secret generation ID captured in its manifest. A backup that
references an older generation does not authorize moving the active generation
backward: `NO_IMPLICIT_ROLLBACK_CHAIN` applies.

Create a fresh verified recovery-grade backup before a persistence-affecting or
destructive operation when that procedure's recovery contract requires one. For
a future Supabase update, one is required when the candidate may start a
different runtime or mutate persistent state. A proven read-only or no-op
operation does not automatically require a new backup.

## 8. Restore and recovery boundary

The existing restore executor accepts only `--target current-selfhosted-qa`.
It is therefore **destructive**, a **QA / technical same-host proof**, and
**explicit-authorization-required**. Do not present or use it as a generally
authorized production restore interface.

For an authorized technical restore, use the exact existing procedure and its
preconditions in the [SH-04 operations design](SH_04_OPERATIONS_DESIGN.md).
Routine recovery must align with the active generation; historical recovery is
generation-aware; and `NO_IMPLICIT_ROLLBACK_CHAIN` remains in force. No
production restore interface is invented here.

## 9. Update discovery and planning

Use only the routine planning interface for a candidate official self-hosted
tag:

```text
npm run ops:supabase:update:plan -- --to self-hosted/vX.Y.Z
```

The planner requires an official exact tag and exact peeled SHA, verifies
tracked `BASE_REF`/lock agreement, and reviews Godel drift, effective Compose
invariants, persistent-state effects, breaking gates, and rollback
classification. Never use `latest`, `master`, or a guessed ref.

At SH-04 closure, the accepted operational decision is `NO_UPDATE_REQUIRED`:
the current Godel Docker snapshot is equivalent to the accepted
`self-hosted/v0.8.0` snapshot. This is not a permanent assertion; evaluate
every future candidate again.

## 10. Update result handling

- `NO_UPDATE_REQUIRED`: record the result; do not mutate solely to repeat a
  no-op decision.
- `UPDATE_PLAN_READY`: obtain candidate-specific technical review and an
  approved recovery/rollback contract before any runtime mutation.
- `BLOCKED` or `ERROR`: stop, preserve the result, and resolve the stated
  gate through its canonical authority.

An update plan is not authorization to mutate production.

## 11. Rollback classification

- **Pre-runtime abort (R0):** stop before TARGET starts; no runtime rollback is
  assumed necessary.
- **Configuration/vendor rollback (R1):** use only the approved configuration
  or vendor recovery path for the exact candidate.
- **Runtime-compatible rollback (R2):** permitted only when old-bundle
  compatibility has been explicitly proved for the exact relevant state.
- **Recovery-required rollback (R3):** use the approved recovery contract;
  compatibility must not be assumed.

If TARGET ran and exact old-bundle compatibility has not been proved, do not
assume runtime-compatible rollback. `FORWARD_ONLY`, `UNKNOWN`, and unresolved
`REQUIRES_RUNTIME_PROOF` effects must not silently become R2.

## 12. Historical R2 proof boundary

Historical capability evidence proved runtime-compatible rollback only for the
exact synthetic pair `self-hosted/v0.7.2` to `self-hosted/v0.8.0`, followed
by restoration of that exact historical BASE runtime. It does not prove generic
Supabase downgrade compatibility, future-update rollback safety, or a current
production rollback need. See the
[update and rollback design](SH_04_UPDATE_ROLLBACK_DESIGN.md).

## 13. Reverse update prohibition

**DO NOT** use `update.sh` in reverse as a rollback mechanism. It is a forward
update/merge mechanism; no reverse-update command is authorized by this
runbook. Follow the candidate-specific rollback classification and canonical
rollback design instead.

## 14. Routine interfaces and historical validation tooling

**CURRENT OPERATIONAL PROCEDURES** use only these documented interfaces:

- `ops:secrets:generation:status`
- `ops:secrets:check`
- `ops:backup:selfhosted`
- `ops:backup:selfhosted:verify`
- `ops:supabase:update:plan`

**HISTORICAL CAPABILITY EVIDENCE** uses the update-rehearsal and
rollback-rehearsal families. They are validation tooling, not routine
production update or rollback actions. Their current npm interfaces include
`ops:supabase:update:rehearsal:plan`,
`ops:supabase:update:rehearsal:execute`, and
`ops:supabase:rollback:rehearsal:execute`.

References sometimes shorten those families to
`ops:supabase:update:rehearsal`, `ops:supabase:rollback:rehearsal`, or
`ops:supabase:rollback:rehearsal:runtime`. Those shortened labels are not
executable npm aliases and are not commands in this runbook. Historical
secret-rotation mutation procedures and destructive restore proof commands are
not routine actions merely because tooling exists.

## 15. Failure and evidence

On failure: **STOP**. Do not retry automatically. Preserve the evidence defined
by the affected procedure, as applicable: final structured output, checkpoints,
journal, failure marker, and operation lock. Do not claim every procedure has
all of these artifacts, delete evidence to make a system appear clean, or
manually cross operation phases.

## 16. Cleanup

Cleanup is executor- and procedure-owned. Identity and ownership must be exact;
never use broad Docker deletion or a generic “delete leftovers” action. Where a
procedure defines zero-residue evidence, retain and assess it. Do not remove
residue from a failed operation unless its canonical recovery procedure
explicitly authorizes that action.

## 17. Global STOP conditions

Stop, where applicable, for a dirty or unexpected repository state,
`BASE_REF`/lock disagreement, invalid local operational stamp, unofficial or
ambiguous target, unknown image identity, unclear breaking gate, unresolved
Godel drift, failed effective Compose invariant, ambiguous production scope,
active-generation mismatch, secret validation failure, unhealthy required
runtime, missing/unverified required recovery-grade backup,
`UNKNOWN`/`FORWARD_ONLY` persistence without approved recovery, unexpected
operation lock/failure marker/residue, or cleanup ownership ambiguity.

## 18. Final acceptance checklist

After a mutable technical operation, check as applicable:

- Required runtime health and Godel live/ready.
- Exact production scope.
- Initialized, matching active external secret generation.
- Expected data or fixtures.
- Complete required evidence.
- Accepted cleanup/residue state.
- Expected repository/worktree state.
- Absence of unexpected secret exposure.

## 19. Ownership boundaries

PPO-06 owns backup scheduling, retention, off-host destination, disaster
operating policy, and any future RPO/RTO. PPO-07 owns continuous monitoring,
centralized logs, metrics, alerts, support/escalation, and routine automated
health monitoring. SH-05 owns clean-host reconstruction and
portability/reproducibility from a new host.

Same-host recovery proof is not clean-host portability proof.
