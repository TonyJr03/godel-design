import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import type { PaginationMeta } from "@/lib/pagination";

type ListingPaginationProps = {
  pagination: PaginationMeta;
  pathname: string;
  query?: Record<string, string | null | undefined>;
  itemLabel: string;
  ariaLabel?: string;
};

type PaginationControlProps = {
  children: ReactNode;
  disabled: boolean;
  href: string;
  label: string;
  title: string;
};

const CONTROL_BASE_CLASS =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors duration-200";
const CONTROL_ENABLED_CLASS =
  "border-border-strong bg-surface text-text-primary hover:border-brand-primary hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const CONTROL_DISABLED_CLASS =
  "cursor-default border-border bg-surface-muted text-text-muted opacity-60";

function buildPageHref(
  pathname: string,
  query: Record<string, string | null | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (
      key === "page" ||
      value === null ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    params.set(key, value);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();

  return queryString ? `${pathname}?${queryString}` : pathname;
}

function PaginationControl({
  children,
  disabled,
  href,
  label,
  title,
}: PaginationControlProps) {
  const className = `${CONTROL_BASE_CLASS} ${
    disabled ? CONTROL_DISABLED_CLASS : CONTROL_ENABLED_CLASS
  }`;

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={label}
        className={className}
        title={title}
      >
        {children}
      </span>
    );
  }

  return (
    // TD-NEXT-001: fallback temporal para navegación same-route en self-hosted.
    <a aria-label={label} className={className} href={href} title={title}>
      {children}
    </a>
  );
}

export function ListingPagination({
  pagination,
  pathname,
  query = {},
  itemLabel,
  ariaLabel = "Paginación del listado",
}: ListingPaginationProps) {
  if (pagination.totalCount === 0) {
    return null;
  }

  const previousPage = Math.max(pagination.page - 1, 1);
  const nextPage = Math.min(pagination.page + 1, pagination.totalPages);
  const previousHref = buildPageHref(pathname, query, previousPage);
  const nextHref = buildPageHref(pathname, query, nextPage);

  return (
    <nav
      aria-label={ariaLabel}
      className="mt-5 flex flex-col items-center gap-2 text-center"
    >
      <div className="flex min-w-0 items-center justify-center gap-3">
        <PaginationControl
          disabled={!pagination.hasPreviousPage}
          href={previousHref}
          label="Ir a la página anterior"
          title="Página anterior"
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
        </PaginationControl>

        <p
          className="min-w-0 text-sm font-semibold text-text-primary"
          aria-live="polite"
        >
          Página {pagination.page} de {pagination.totalPages}
        </p>

        <PaginationControl
          disabled={!pagination.hasNextPage}
          href={nextHref}
          label="Ir a la página siguiente"
          title="Página siguiente"
        >
          <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
        </PaginationControl>
      </div>

      <p className="max-w-full text-sm text-text-secondary">
        Mostrando {pagination.startItem}–{pagination.endItem} de{" "}
        {pagination.totalCount} {itemLabel}
      </p>
    </nav>
  );
}
