import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, sep } from "node:path";

const defaultRoots = ["src", "supabase", "docs", "AGENTS.md", ".env.example"];
const roots = process.argv.slice(2);
const auditRoots = roots.length > 0 ? roots : defaultRoots;

const allowedSecretEnvFile = normalizePath("src/lib/supabase/admin.ts");
const initialPasswordCompletionFile = normalizePath(
  "src/lib/auth/complete-initial-password-change.ts",
);
const createInternalUserFile = normalizePath(
  "src/lib/usuarios/create-internal-user.ts",
);
const resetInternalUserPasswordFile = normalizePath(
  "src/lib/usuarios/reset-internal-user-password.ts",
);
const allowedAdminConsumerFiles = new Set([
  normalizePath("src/lib/supabase/admin.ts"),
  createInternalUserFile,
  initialPasswordCompletionFile,
  resetInternalUserPasswordFile,
]);
const allowedAdminClientDeclarations = new Map([
  [
    createInternalUserFile,
    {
      variableName: "admin",
      categoryPrefix: "create-internal-user",
    },
  ],
  [
    resetInternalUserPasswordFile,
    {
      variableName: "admin",
      categoryPrefix: "reset-internal-user-password",
    },
  ],
  [
    initialPasswordCompletionFile,
    {
      variableName: "privilegedClient",
      categoryPrefix: "initial-password",
    },
  ],
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
const initialPasswordForbiddenAdminPattern =
  /\b(?:auth\.admin\.(?:createUser|updateUserById|deleteUser)|privilegedClient\s*\.\s*(?:from|storage)\b|createAdminClient\(\)\s*\.\s*(?:from|storage)\b)/g;
const privilegedRpcPattern =
  /\bprivilegedClient\s*\.\s*rpc\s*\(\s*["']([^"']+)["']/gs;
const forbiddenPrivilegedClientMemberPattern =
  /\bprivilegedClient\s*\.\s*(?:from|storage|auth|functions)\b/gs;
const forbiddenAuthAdminPattern = /\bauth\s*\.\s*admin\s*\./gs;
const adminAuthAdminCallPattern =
  /\badmin\s*\.\s*auth\s*\.\s*admin\s*\.\s*([A-Za-z0-9_]+)\s*\(/gs;
const directAdminAuthAdminCallPattern =
  /\bcreateAdminClient\s*\(\s*\)\s*\.\s*auth\s*\.\s*admin\s*\.\s*([A-Za-z0-9_]+)\s*\(/gs;
const forbiddenAdminClientDataMemberPattern =
  /\badmin\s*\.\s*(?:from|storage|functions|rpc)\b/gs;
const forbiddenDirectAdminClientDataMemberPattern =
  /\bcreateAdminClient\s*\(\s*\)\s*\.\s*(?:from|storage|functions|rpc)\b/gs;
const forbiddenPrivilegedFunctionsInvokePattern =
  /\b(?:admin|privilegedClient)\s*\.\s*functions\s*\.\s*invoke\b/gs;
const directSecretEnvPattern = /\bprocess\.env\.SUPABASE_SECRET_KEY\b/g;
const createAdminClientCallPattern = /\bcreateAdminClient\s*\(\s*\)/gs;
const adminClientDeclarationPattern =
  /\b(?:const|let|var)\s+([^=;\n]+?)\s*=\s*createAdminClient\s*\(\s*\)\s*;?/gs;

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

function getApproximateLine(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function collectContentPatternMatches(text, pattern) {
  pattern.lastIndex = 0;
  return [...text.matchAll(pattern)];
}

function scanInitialPasswordCompletionFile(text, relativeFile, violations) {
  for (const match of collectContentPatternMatches(text, privilegedRpcPattern)) {
    const rpcName = match[1];

    if (rpcName !== "complete_initial_password_change") {
      addViolation(
        violations,
        relativeFile,
        getApproximateLine(text, match.index ?? 0),
        "unexpected-initial-password-privileged-rpc",
      );
    }
  }

  for (const match of collectContentPatternMatches(
    text,
    forbiddenPrivilegedClientMemberPattern,
  )) {
    addViolation(
      violations,
      relativeFile,
      getApproximateLine(text, match.index ?? 0),
      "forbidden-initial-password-privileged-client-method",
    );
  }

  for (const match of collectContentPatternMatches(text, forbiddenAuthAdminPattern)) {
    addViolation(
      violations,
      relativeFile,
      getApproximateLine(text, match.index ?? 0),
      "forbidden-initial-password-auth-admin-operation",
    );
  }
}

function scanAllowedAdminClientConstruction(text, relativeFile, violations) {
  const policy = allowedAdminClientDeclarations.get(relativeFile);

  if (!policy) {
    return;
  }

  const calls = collectContentPatternMatches(text, createAdminClientCallPattern);
  const exactConstructionPattern = new RegExp(
    `\\bconst\\s+${policy.variableName}\\s*=\\s*createAdminClient\\s*\\(\\s*\\)\\s*;?`,
    "gs",
  );
  const legacyCompatibleConstructionPattern = new RegExp(
    `\\b(?:const\\s+${policy.variableName}|${policy.variableName})\\s*=\\s*createAdminClient\\s*\\(\\s*\\)\\s*;?`,
    "gs",
  );
  const canonicalConstructionPattern =
    relativeFile === resetInternalUserPasswordFile
      ? exactConstructionPattern
      : legacyCompatibleConstructionPattern;
  const canonicalConstructions = collectContentPatternMatches(
    text,
    canonicalConstructionPattern,
  );

  if (calls.length !== 1) {
    addViolation(
      violations,
      relativeFile,
      calls[0] ? getApproximateLine(text, calls[0].index ?? 0) : 1,
      `${policy.categoryPrefix}-invalid-admin-client-construction-count`,
    );
  }

  if (canonicalConstructions.length !== 1) {
    addViolation(
      violations,
      relativeFile,
      calls[0] ? getApproximateLine(text, calls[0].index ?? 0) : 1,
      `${policy.categoryPrefix}-invalid-admin-client-declaration`,
    );
  }

  for (const match of collectContentPatternMatches(
    text,
    adminClientDeclarationPattern,
  )) {
    const declarationTarget = match[1]?.trim();

    if (declarationTarget !== policy.variableName || !match[0].startsWith("const ")) {
      addViolation(
        violations,
        relativeFile,
        getApproximateLine(text, match.index ?? 0),
        `${policy.categoryPrefix}-forbidden-admin-client-alias`,
      );
    }
  }
}

function scanAdminAuthCapabilityFile(
  text,
  relativeFile,
  violations,
  allowedMethods,
  categoryPrefix,
) {
  for (const match of collectContentPatternMatches(text, adminAuthAdminCallPattern)) {
    const methodName = match[1];

    if (!allowedMethods.has(methodName)) {
      addViolation(
        violations,
        relativeFile,
        getApproximateLine(text, match.index ?? 0),
        `${categoryPrefix}-forbidden-auth-admin-method`,
      );
    }
  }

  for (const match of collectContentPatternMatches(
    text,
    directAdminAuthAdminCallPattern,
  )) {
    addViolation(
      violations,
      relativeFile,
      getApproximateLine(text, match.index ?? 0),
      `${categoryPrefix}-forbidden-direct-auth-admin-method`,
    );
  }

  for (const match of collectContentPatternMatches(
    text,
    forbiddenAdminClientDataMemberPattern,
  )) {
    addViolation(
      violations,
      relativeFile,
      getApproximateLine(text, match.index ?? 0),
      `${categoryPrefix}-forbidden-admin-client-data-method`,
    );
  }

  for (const match of collectContentPatternMatches(
    text,
    forbiddenDirectAdminClientDataMemberPattern,
  )) {
    addViolation(
      violations,
      relativeFile,
      getApproximateLine(text, match.index ?? 0),
      `${categoryPrefix}-forbidden-direct-admin-client-data-method`,
    );
  }

  for (const match of collectContentPatternMatches(
    text,
    forbiddenPrivilegedFunctionsInvokePattern,
  )) {
    addViolation(
      violations,
      relativeFile,
      getApproximateLine(text, match.index ?? 0),
      `${categoryPrefix}-forbidden-functions-invoke`,
    );
  }
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
      relativeFile === initialPasswordCompletionFile &&
      collectPatternMatches(line, initialPasswordForbiddenAdminPattern).length > 0
    ) {
      addViolation(
        violations,
        relativeFile,
        lineNumber,
        "forbidden-initial-password-admin-operation",
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

  if (relativeFile === initialPasswordCompletionFile) {
    scanAllowedAdminClientConstruction(text, relativeFile, violations);
    scanInitialPasswordCompletionFile(text, relativeFile, violations);
  }

  if (relativeFile === createInternalUserFile) {
    scanAllowedAdminClientConstruction(text, relativeFile, violations);
    scanAdminAuthCapabilityFile(
      text,
      relativeFile,
      violations,
      new Set(["createUser", "deleteUser"]),
      "create-internal-user",
    );
  }

  if (relativeFile === resetInternalUserPasswordFile) {
    scanAllowedAdminClientConstruction(text, relativeFile, violations);
    scanAdminAuthCapabilityFile(
      text,
      relativeFile,
      violations,
      new Set(["getUserById", "updateUserById"]),
      "reset-internal-user-password",
    );
  }

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
