import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTAINER = "supabase_db_godel-design";
const SCRIPT_DIRECTORY = resolve(process.cwd(), "scripts/spikes/ppo-03a2");

async function runSql(fileName) {
  let sql;

  try {
    sql = await readFile(resolve(SCRIPT_DIRECTORY, fileName), "utf8");
  } catch {
    throw new Error("No se pudo leer el SQL temporal local del spike.");
  }

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        CONTAINER,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        "-",
      ],
      { cwd: process.cwd(), stdio: ["pipe", "ignore", "ignore"], windowsHide: true },
    );

    child.once("error", () => {
      rejectRun(new Error("No se pudo ejecutar el SQL temporal local del spike."));
    });
    child.once("exit", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      rejectRun(new Error("El SQL temporal local del spike no finalizó correctamente."));
    });
    child.stdin.end(sql);
  });
}

export function installLocalPublicPolicy() {
  return runSql("setup-local-public-policy.sql");
}

export function cleanupLocalPublicPolicy() {
  return runSql("cleanup-local-public-policy.sql");
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  if (process.argv[2] !== "cleanup") {
    throw new Error("Uso: node scripts/spikes/ppo-03a2/local-policy.mjs cleanup");
  }

  await cleanupLocalPublicPolicy();
  console.log("local_public_policy_cleanup=true");
}
