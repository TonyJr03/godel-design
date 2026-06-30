import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = [
  "src/lib/public-tracking",
  "src/app/estado",
  "src/components/tracking",
];
const codeFilePattern = /\.(?:[cm]?[jt]sx?)$/;
const pattern = /order_number|pedido_pagos|file_path/g;

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
  if (!codeFilePattern.test(file)) {
    return [];
  }

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

console.log("Auditoria tracking publico: order_number, pedido_pagos, file_path");

if (matches.length === 0) {
  console.log("Sin coincidencias.");
  process.exit(0);
}

for (const match of matches) {
  console.log(`${match.file}:${match.line}: ${match.text}`);
}

console.log("");
console.log("Coincidencias encontradas. Revisar que tracking publico no exponga datos internos.");
