import { resolve } from "node:path";
import { EC_RUNTIME_STAGES, convergeEcSigningKeyRuntime } from "./ec-signing-key-runtime.mjs";
import { readEcSigningKeyRotationPlan } from "./ec-signing-key-rotation-plan.mjs";
import { parseEcRotationEnvironmentSnapshot } from "./ec-signing-key-rotation.mjs";

const root = process.cwd();
const [operation, ...args] = process.argv.slice(2);
let planId;
let toStage;
let apply = false;

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--plan") planId = args[++index];
  else if (args[index] === "--to-stage") toStage = args[++index];
  else if (args[index] === "--apply") apply = true;
  else throw new Error("INVALID_ARGUMENT");
}

if (!["activate", "rollback"].includes(operation) || !planId || !toStage) {
  throw new Error("INVALID_EC_RUNTIME_COMMAND");
}

const value = {
  root,
  protectedRoot: resolve(root, "protected-recovery-material/selfhosted"),
  supabaseEnvPath: resolve(root, "infra/supabase/.env"),
  godelEnvPath: resolve(root, "compose.env.local"),
};
const plan = await readEcSigningKeyRotationPlan({ protectedRoot: value.protectedRoot, planId });
const stageValues = new Map(EC_RUNTIME_STAGES.map((stage) => {
  const snapshot = stage === "GEN4" ? plan.source.supabaseSnapshot : plan.stages[stage]?.supabaseSnapshot;
  if (!snapshot) throw new Error("EC_RUNTIME_STAGE_SNAPSHOT_MISSING");
  return [stage, parseEcRotationEnvironmentSnapshot(snapshot)];
}));
const result = await convergeEcSigningKeyRuntime({
  operation,
  planId,
  toStage,
  apply,
  value,
  stageValues,
});

process.stdout.write(`${result.state}\nFROM_STAGE ${result.fromStage}\nTO_STAGE ${result.toStage}\nSERVICES ${result.services.join(",")}\n`);
