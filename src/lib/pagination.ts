export const INTERNAL_LIST_PAGE_SIZE = 50;

export type PaginationMeta = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  startItem: number;
  endItem: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

type PaginationRange = {
  from: number;
  to: number;
};

type PaginationMetaInput = {
  page: string | number | null | undefined;
  pageSize: number;
  totalCount: number | null | undefined;
};

function normalizePositiveInteger(value: number, fallback: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    return fallback;
  }

  return value;
}

export function normalizePageParam(
  page: string | number | null | undefined,
): number {
  if (page === null || page === undefined) {
    return 1;
  }

  if (typeof page === "number") {
    return normalizePositiveInteger(page, 1);
  }

  const trimmedPage = page.trim();

  if (!/^\d+$/.test(trimmedPage)) {
    return 1;
  }

  const numericPage = Number(trimmedPage);

  return normalizePositiveInteger(numericPage, 1);
}

export function getPaginationRange(
  page: string | number | null | undefined,
  pageSize: number,
): PaginationRange {
  const normalizedPageSize = normalizePositiveInteger(Math.trunc(pageSize), 1);
  const normalizedPage = normalizePageParam(page);
  const offset = (normalizedPage - 1) * normalizedPageSize;
  const to = offset + normalizedPageSize - 1;

  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(to)) {
    return {
      from: 0,
      to: normalizedPageSize - 1,
    };
  }

  return {
    from: offset,
    to,
  };
}

export function createPaginationMeta({
  page,
  pageSize,
  totalCount,
}: PaginationMetaInput): PaginationMeta {
  const normalizedPageSize = normalizePositiveInteger(Math.trunc(pageSize), 1);
  const normalizedTotalCount =
    Number.isSafeInteger(totalCount) && totalCount && totalCount > 0
      ? totalCount
      : 0;
  const totalPages =
    normalizedTotalCount === 0
      ? 1
      : Math.ceil(normalizedTotalCount / normalizedPageSize);
  const normalizedPage = normalizePageParam(page);
  const effectivePage =
    normalizedTotalCount === 0 ? 1 : Math.min(normalizedPage, totalPages);
  const startItem =
    normalizedTotalCount === 0
      ? 0
      : (effectivePage - 1) * normalizedPageSize + 1;
  const endItem =
    normalizedTotalCount === 0
      ? 0
      : Math.min(startItem + normalizedPageSize - 1, normalizedTotalCount);

  return {
    page: effectivePage,
    pageSize: normalizedPageSize,
    totalCount: normalizedTotalCount,
    totalPages,
    startItem,
    endItem,
    hasPreviousPage: effectivePage > 1,
    hasNextPage: effectivePage < totalPages,
  };
}
