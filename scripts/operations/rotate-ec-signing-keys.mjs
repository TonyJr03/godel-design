#!/usr/bin/env node
import { resolve } from "node:path";
import { activateEcSigningKeyRotation, ecSigningKeyRotationStatus, prepareEcSigningKeyRotation, renderEcSigningKeyRotationFailure, renderEcSigningKeyRotationResult, rollbackEcSigningKeyRotation } from "./ec-signing-key-rotation-plan.mjs";

const ROOT = process.cwd();
function fail(code) { throw new Error(code); }
function parse(args) {
  const command = args.shift(); const value = { root: ROOT, protectedRoot: resolve(ROOT, "protected-recovery-material/selfhosted"), supabaseEnvPath: resolve(ROOT, "infra/supabase/.env"), godelEnvPath: resolve(ROOT, "compose.env.local"), apply: false, planId: null, toStage: null };
  while (args.length) { const argument = args.shift(); if (argument === "--apply") value.apply = true; else if (argument === "--plan") value.planId = args.shift(); else if (argument === "--to-stage") value.toStage = args.shift(); else fail("INVALID_ARGUMENT"); }
  if (!["prepare", "activate", "rollback", "status"].includes(command)) fail("INVALID_COMMAND"); if (["activate", "rollback", "status"].includes(command) && !value.planId) fail("EC_ROTATION_PLAN_REQUIRED"); if (["activate", "rollback"].includes(command) && !value.toStage) fail("EC_ROTATION_STAGE_REQUIRED"); if (command === "prepare" && (value.planId || value.toStage)) fail("INVALID_ARGUMENT"); return { command, value };
}
if (import.meta.main) { try { const { command, value } = parse(process.argv.slice(2)); const result = command === "prepare" ? await prepareEcSigningKeyRotation(value) : command === "activate" ? await activateEcSigningKeyRotation(value) : command === "rollback" ? await rollbackEcSigningKeyRotation(value) : await ecSigningKeyRotationStatus(value); process.stdout.write(renderEcSigningKeyRotationResult(result)); } catch (error) { process.stderr.write(renderEcSigningKeyRotationFailure(error)); process.exitCode = 1; } }
