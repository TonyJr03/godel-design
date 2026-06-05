export function getSingleSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const DEFAULT_SEARCH_QUERY_MAX_LENGTH = 120;

export function normalizeSearchQuery(
  value: string | null | undefined,
  maxLength = DEFAULT_SEARCH_QUERY_MAX_LENGTH,
): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/[(),*%_'\"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

  return normalized || null;
}
