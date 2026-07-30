import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, sep } from "node:path";

const defaultRoots = ["src", "supabase", "docs", "AGENTS.md", ".env.example"];
const roots = process.argv.slice(2);
const auditRoots = roots.length > 0 ? roots : defaultRoots;

const allowedSecretEnvFile = normalizePath("src/lib/supabase/admin.ts");
const allowedAdminConsumerFiles = new Set([
  normalizePath("src/lib/supabase/admin.ts"),
  normalizePath("src/lib/usuarios/create-internal-user.ts"),
]);
const secretReferencePattern = /\bSUPABASE_SECRET_KEY\b/g;
const legacySecretPattern = /\bSUPABASE_SERVICE_ROLE_KEY\b/g;
const publicSecretPattern =
  /\bNEXT_PUBLIC_SUPABASE_(?:SECRET|SERVICE_ROLE)_KEY\b/g;
const literalSecretPattern = /\bsb_secret_(?!\.\.\.)[^\s`'")<>]+/g;
const expectedReferencePattern =
  /\b(?:service_role|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|auth\.users)\b/g;
const componentAdminPattern =
  /\b(?:auth\.admin|createAdminClient|SUPABASE_SECRET_KEY)\b/g;
const adminConsumerPattern = /\b(?:auth\.admin|createAdminClient)\b/g;
const directSecretEnvPattern = /\bprocess\.env\.SUPABASE_SECRET_KEY\b/g;

function normalizePath(path) {
  return path.split(sep).join("/");
}

function projectPath(path) {
  return normalizePath(relative(process.cwd(), path));
}

function isWithin(path, folder) {
  return path === folder || path.startsWith(`${folder}/`);
}

function isDocumentationFile(path) {
  return /\.(?:md|mdx)$/i.test(path);
}

function isAllowedSecretEnvFile(path) {
  return path === allowedSecretEnvFile;
}

function isAllowedAdminConsumerFile(path) {
  return allowedAdminConsumerFiles.has(path);
}

function listFiles(path) {
  if (!existsSync(path)) {
    return [];
  }

  const stat = statSync(path);

  if (stat.isFile()) {
    return [path];
  }

  return readdirSync(path).flatMap((entry) => {
    const child = `${path}${sep}${entry}`;
    const childStat = statSync(child);

    if (childStat.isDirectory()) {
      return listFiles(child);
    }

    return childStat.isFile() ? [child] : [];
  });
}

function collectPatternMatches(line, pattern) {
  pattern.lastIndex = 0;
  return [...line.matchAll(pattern)];
}

function addViolation(violations, file, line, category) {
  violations.push({ file, line, category });
}

function addExpectedReference(expectedReferences, file, line, category) {
  expectedReferences.push({ file, line, category });
}

function scanFile(file) {
  const relativeFile = projectPath(file);
  const text = readFileSync(file, "utf8");
  const violations = [];
  const expectedReferences = [];

  text.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;

    if (collectPatternMatches(line, publicSecretPattern).length > 0) {
      addViolation(
        violations,
        relativeFile,
        lineNumber,
        "public-secret-prefix",
      );
    }

    if (collectPatternMatches(line, literalSecretPattern).length > 0) {
      addViolation(
        violations,
        relativeFile,
        lineNumber,
        "literal-supabase-secret-key",
      );
    }

    if (
      isWithin(relativeFile, "src/components") &&
      collectPatternMatches(line, componentAdminPattern).length > 0
    ) {
      addViolation(
        violations,
        relativeFile,
        lineNumber,
        "admin-api-in-client-components",
      );
    }

    if (
      isWithin(relativeFile, "src") &&
      !isDocumentationFile(relativeFile) &&
      !isAllowedAdminConsumerFile(relativeFile) &&
      collectPatternMatches(line, adminConsumerPattern).length > 0
    ) {
      addViolation(
        violations,
        relativeFile,
        lineNumber,
        "unauthorized-admin-api-consumer",
      );
    }

    if (
      isWithin(relativeFile, "src") &&
      !isDocumentationFile(relativeFile) &&
      !isAllowedSecretEnvFile(relativeFile) &&
      collectPatternMatches(line, secretReferencePattern).length > 0
    ) {
      addViolation(
        violations,
        relativeFile,
        lineNumber,
        "secret-env-reference-outside-admin-client",
      );
    }

    if (
      isWithin(relativeFile, "src") &&
      !isDocumentationFile(relativeFile) &&
      collectPatternMatches(line, legacySecretPattern).length > 0
    ) {
      addViolation(violations, relativeFile, lineNumber, "legacy-secret-env-in-src");
    }

    if (
      !isDocumentationFile(relativeFile) &&
      !isAllowedSecretEnvFile(relativeFile) &&
      collectPatternMatches(line, directSecretEnvPattern).length > 0
    ) {
      addViolation(
        violations,
        relativeFile,
        lineNumber,
        "direct-secret-env-access-outside-admin-client",
      );
    }

    for (const match of collectPatternMatches(line, expectedReferencePattern)) {
      addExpectedReference(
        expectedReferences,
        relativeFile,
        lineNumber,
        `reference:${match[0]}`,
      );
    }
  });

  return { violations, expectedReferences };
}

const scannedFiles = auditRoots.flatMap(listFiles);
const results = scannedFiles.map(scanFile);
const violations = results.flatMap((result) => result.violations);
const expectedReferences = results.flatMap((result) => result.expectedReferences);

console.log("Auditoria de seguridad");
console.log(`Archivos revisados: ${scannedFiles.length}`);
console.log(`Referencias esperadas: ${expectedReferences.length}`);
console.log(`Violaciones bloqueantes: ${violations.length}`);

if (expectedReferences.length > 0) {
  console.log("");
  console.log("Referencias esperadas:");

  for (const reference of expectedReferences) {
    console.log(`${reference.file}:${reference.line}: ${reference.category}`);
  }
}

if (violations.length > 0) {
  console.log("");
  console.log("Violaciones bloqueantes:");

  for (const violation of violations) {
    console.log(`${violation.file}:${violation.line}: ${violation.category}`);
  }

  process.exit(1);
}

console.log("");
console.log("Sin violaciones bloqueantes.");
