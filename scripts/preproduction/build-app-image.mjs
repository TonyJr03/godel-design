import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const publicNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

function parseArguments(args) {
  const value = {
    tag: "godel-design-app:local",
    noCache: false,
    envFile: ".env.local",
  };

  while (args.length > 0) {
    const argument = args.shift();
    if (argument === "--tag") value.tag = args.shift() ?? "";
    else if (argument === "--no-cache") value.noCache = true;
    else if (argument === "--env-file") value.envFile = args.shift() ?? "";
    else throw new Error("invalid argument");
  }

  if (!value.tag || !value.envFile) throw new Error("tag and env file are required");
  return value;
}

function parseEnvironment(text) {
  const values = new Map();

  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    if (publicNames.includes(name)) values.set(name, line.slice(separator + 1));
  }

  return values;
}

function run(command, args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      resolveResult({ code, output: Buffer.concat([...stdout, ...stderr]).toString("utf8") }),
    );
  });
}

function redact(text, values) {
  return values.reduce(
    (result, value) => result.split(value).join("[REDACTED_PUBLIC_VALUE]"),
    text,
  );
}

function evidenceDirectory() {
  const base = process.env.LOCALAPPDATA || tmpdir();
  return join(
    base,
    "GodelDesign",
    "PPO-02",
    "builds",
    new Date().toISOString().replace(/[:.]/g, ""),
  );
}

const options = parseArguments(process.argv.slice(2));
const root = process.cwd();
const status = await run("git", ["status", "--porcelain", "--untracked-files=all"], {
  cwd: root,
});

if (status.code !== 0) throw new Error("unable to inspect git status");
if (status.output.trim()) throw new Error("build helper requires a clean git worktree");

const publicValues = parseEnvironment(await readFile(resolve(root, options.envFile), "utf8"));
const url = publicValues.get("NEXT_PUBLIC_SUPABASE_URL");
const publishable = publicValues.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const nonce = randomUUID();

if (!url || !publishable) throw new Error("required public build configuration is missing");

const args = [
  "buildx",
  "build",
  "--load",
  "--platform",
  "linux/amd64",
  "--progress=plain",
  "--tag",
  options.tag,
  "--build-arg",
  `NEXT_PUBLIC_SUPABASE_URL=${url}`,
  "--build-arg",
  `GODEL_PUBLIC_BUILD_NONCE=${nonce}`,
  "--secret",
  "id=godel_supabase_publishable_key,env=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

if (options.noCache) args.push("--no-cache");
args.push(".");

const result = await run("docker", args, {
  cwd: root,
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable },
});
const directory = evidenceDirectory();
await mkdir(directory, { recursive: true });
await writeFile(join(directory, "build.log"), redact(result.output, [url, publishable, nonce]), "utf8");
await writeFile(
  join(directory, "build-summary.json"),
  `${JSON.stringify(
    { tag: options.tag, noCache: options.noCache, exitCode: result.code, succeeded: result.code === 0 },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`BUILD_TAG=${options.tag}`);
console.log(`BUILD_EXIT=${result.code}`);
console.log("RAW_LOG_PERSISTENCE=NO");
console.log("PUBLISHABLE_ARG_TRANSPORT=NO");

process.exitCode = result.code || 0;
