import { randomBytes } from "node:crypto";

export type QaRunScope = "servicios" | "clientes" | "solicitudes" | "pedidos";

export type QaRunContext<TScope extends QaRunScope = QaRunScope> = {
  runId: string;
  scope: TScope;
  ownershipPrefix: string;
};

const QA_RUN_ID_PATTERN = /^\d{14}-[0-9a-f]{8}$/;

export function createQaRunId() {
  return new Date()
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);
}

function createTimestamp() {
  return new Date().toISOString().replace(/\D/g, "").slice(0, 14);
}

function assertQaRunId(runId: string) {
  if (!QA_RUN_ID_PATTERN.test(runId)) {
    throw new Error(
      "GODEL_E2E_RUN_ID must match YYYYMMDDHHMMSS-xxxxxxxx with lowercase hexadecimal suffix.",
    );
  }

  return runId;
}

export function createQaRunContext<TScope extends QaRunScope>(
  scope: TScope,
): QaRunContext<TScope> {
  const explicitRunId = process.env.GODEL_E2E_RUN_ID?.trim();
  const runId = explicitRunId
    ? assertQaRunId(explicitRunId)
    : `${createTimestamp()}-${randomBytes(4).toString("hex")}`;

  return {
    runId,
    scope,
    ownershipPrefix: `E2E-${scope}-${runId}`,
  };
}

export function createQaRunLabel(runId: string) {
  return runId.replace(
    /\d/g,
    (digit) => "abcdefghij"[Number(digit)] ?? "x",
  );
}

function normalizeQaToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createQaEmail(prefix: string, runId: string) {
  return `${normalizeQaToken(prefix)}-${runId}@example.com`;
}

export function createUnlikelyQaQuery(prefix: string, runId = createQaRunId()) {
  return `qa-${normalizeQaToken(prefix)}-${runId}`;
}
