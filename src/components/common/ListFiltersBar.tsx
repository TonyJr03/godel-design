"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { normalizeSearchQuery } from "@/lib/utils/search-params";

const SEARCH_DEBOUNCE_MS = 200;

export type ListFilterOption = {
  value: string;
  label: string;
};

export type ListFilterConfig = {
  name: string;
  label: string;
  value: string;
  options: ListFilterOption[];
};

type ListFiltersBarProps = {
  searchLabel: string;
  searchPlaceholder: string;
  initialQuery: string;
  filters?: ListFilterConfig[];
  clearLabel?: string;
  debounceMs?: number;
};

export function ListFiltersBar({
  searchLabel,
  searchPlaceholder,
  initialQuery,
  filters = [],
  clearLabel = "Limpiar",
  debounceMs = SEARCH_DEBOUNCE_MS,
}: ListFiltersBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const normalizedQuery = normalizeSearchQuery(query) ?? "";
  const isSearching = normalizedQuery !== initialQuery || isPending;
  const hasActiveFilters =
    Boolean(query.trim()) || filters.some((filter) => Boolean(filter.value));

  const replaceSearchParams = useCallback(
    (nextParams: URLSearchParams) => {
      const queryString = nextParams.toString();

      if (queryString === searchParams.toString()) {
        return;
      }

      startTransition(() => {
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    function syncQueryFromHistory() {
      const nextQuery =
        normalizeSearchQuery(
          new URLSearchParams(window.location.search).get("q"),
        ) ?? "";

      setQuery(nextQuery);
    }

    window.addEventListener("popstate", syncQueryFromHistory);

    return () => window.removeEventListener("popstate", syncQueryFromHistory);
  }, []);

  useEffect(() => {
    if (normalizedQuery === initialQuery) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const nextParams = new URLSearchParams(searchParams.toString());

      if (normalizedQuery) {
        nextParams.set("q", normalizedQuery);
      } else {
        nextParams.delete("q");
      }

      nextParams.delete("page");
      replaceSearchParams(nextParams);
    }, debounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [
    debounceMs,
    initialQuery,
    normalizedQuery,
    replaceSearchParams,
    searchParams,
  ]);

  function updateFilter(name: string, value: string) {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (value) {
      nextParams.set(name, value);
    } else {
      nextParams.delete(name);
    }

    nextParams.delete("page");
    replaceSearchParams(nextParams);
  }

  function clearFilters() {
    const nextParams = new URLSearchParams(searchParams.toString());

    nextParams.delete("q");
    nextParams.delete("page");

    for (const filter of filters) {
      nextParams.delete(filter.name);
    }

    setQuery("");
    replaceSearchParams(nextParams);
  }

  return (
    <section
      className="rounded-(--radius-card) border border-border bg-surface p-4 shadow-(--shadow-soft) sm:p-5"
      aria-label="Búsqueda y filtros"
      aria-busy={isSearching}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="list-search"
            className="block text-sm font-semibold text-text-primary"
          >
            {searchLabel}
          </label>
          <input
            id="list-search"
            type="search"
            value={query}
            maxLength={120}
            placeholder={searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm text-text-primary transition-colors duration-200 placeholder:text-text-muted hover:border-brand-primary focus:border-brand-primary"
          />
        </div>

        {filters.map((filter) => (
          <div key={filter.name} className="lg:w-52">
            <label
              htmlFor={`list-filter-${filter.name}`}
              className="block text-sm font-semibold text-text-primary"
            >
              {filter.label}
            </label>
            <select
              id={`list-filter-${filter.name}`}
              value={filter.value}
              onChange={(event) =>
                updateFilter(filter.name, event.target.value)
              }
              className="mt-2 min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm text-text-primary transition-colors duration-200 hover:border-brand-primary focus:border-brand-primary"
            >
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-brand-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft"
          >
            {clearLabel}
          </button>
        ) : null}
      </div>

      <p
        className="mt-2 min-h-5 text-xs text-text-muted"
        role="status"
        aria-live="polite"
      >
        {isSearching ? "Buscando..." : ""}
      </p>
    </section>
  );
}
