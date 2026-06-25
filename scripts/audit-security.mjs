import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["src", "supabase", "docs", "AGENTS.md"];
const pattern = /service_role|SUPABASE_SERVICE_ROLE_KEY|auth\.users/g;

function listFiles(path) {
  if (!existsSync(path)) {
    return [];
  }

  const stat = statSync(path);

  if (stat.isFile()) {
    return [path];
  }

  return readdirSync(path).flatMap((entry) => {
    const child = join(path, entry);
    const childStat = statSync(child);

    if (childStat.isDirectory()) {
      return listFiles(child);
    }

    return childStat.isFile() ? [child] : [];
  });
}

function scanFile(file) {
  const text = readFileSync(file, "utf8");
  const matches = [];

  text.split(/\r?\n/).forEach((line, index) => {
    pattern.lastIndex = 0;

    if (pattern.test(line)) {
      matches.push({ file, line: index + 1, text: line.trim() });
    }
  });

  return matches;
}

const matches = roots.flatMap((root) => listFiles(root).flatMap(scanFile));

console.log("Auditoria de seguridad: service_role, SUPABASE_SERVICE_ROLE_KEY, auth.users");

if (matches.length === 0) {
  console.log("Sin coincidencias.");
  process.exit(0);
}

for (const match of matches) {
  console.log(`${match.file}:${match.line}: ${match.text}`);
}

console.log("");
console.log("Coincidencias encontradas. Revisar si son riesgos reales o referencias documentales esperadas.");
