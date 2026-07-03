export function createQaRunId() {
  return new Date()
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);
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
