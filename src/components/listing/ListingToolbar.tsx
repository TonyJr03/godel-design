"use client";

import { useMemo, useTransition } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ActiveFilterChips } from "./ActiveFilterChips";
import type { ActiveListingFilter, ListingFilterConfig } from "./types";

export type ListingToolbarProps = {
  searchLabel: string;
  searchPlaceholder: string;
  initialQuery: string;
  filters?: readonly ListingFilterConfig[];
  clearLabel?: string;
};

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function getFilterValueLabel(filter: ListingFilterConfig): string {
  return (
    filter.options.find((option) => option.value === filter.value)?.label ??
    filter.value
  );
}

export function ListingToolbar({
  searchLabel,
  searchPlaceholder,
  initialQuery,
  filters = [],
  clearLabel = "Limpiar filtros",
}: ListingToolbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const currentQuery = normalizeQuery(searchParams.get("q") ?? "");
  const searchInputKey = `${currentQuery}:${normalizeQuery(initialQuery)}`;

  const activeFilters = useMemo<ActiveListingFilter[]>(() => {
    const nextFilters: ActiveListingFilter[] = [];

    if (currentQuery) {
      nextFilters.push({
        key: "q",
        label: "Búsqueda",
        valueLabel: currentQuery,
      });
    }

    for (const filter of filters) {
      if (!filter.value) {
        continue;
      }

      nextFilters.push({
        key: filter.name,
        label: filter.label,
        valueLabel: getFilterValueLabel(filter),
      });
    }

    return nextFilters;
  }, [currentQuery, filters]);

  const activeFilterCount = activeFilters.length;
  const filtersLabel =
    activeFilterCount > 0 ? `Filtros ${activeFilterCount}` : "Filtros";

  function replaceSearchParams(nextParams: URLSearchParams) {
    const queryString = nextParams.toString();
    const currentQueryString = searchParams.toString();

    if (queryString === currentQueryString) {
      return;
    }

    startTransition(() => {
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    });
  }

  function updateSearch(nextQuery: string) {
    const normalizedQuery = normalizeQuery(nextQuery);
    const nextParams = new URLSearchParams(searchParams.toString());

    if (normalizedQuery) {
      nextParams.set("q", normalizedQuery);
    } else {
      nextParams.delete("q");
    }

    nextParams.delete("page");
    replaceSearchParams(nextParams);
  }

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

  function removeFilter(key: string) {
    if (key === "q") {
      updateSearch("");
      return;
    }

    updateFilter(key, "");
  }

  function clearFilters() {
    const nextParams = new URLSearchParams(searchParams.toString());

    nextParams.delete("q");
    nextParams.delete("page");

    for (const filter of filters) {
      nextParams.delete(filter.name);
    }

    replaceSearchParams(nextParams);
  }

  return (
    <section aria-label="Búsqueda y filtros" aria-busy={isPending}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <form
          className="min-w-0 flex-1"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const nextQuery = String(formData.get("q") ?? "");

            updateSearch(nextQuery);
          }}
        >
          <label htmlFor="listing-search" className="sr-only">
            {searchLabel}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden="true"
            />
            <input
              key={searchInputKey}
              id="listing-search"
              name="q"
              type="search"
              defaultValue={currentQuery}
              maxLength={120}
              placeholder={searchPlaceholder}
              className="min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface py-2 pl-9 pr-3 text-sm text-text-primary transition-colors duration-200 placeholder:text-text-muted hover:border-brand-primary focus:border-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          </div>
        </form>

        {filters.length > 0 ? (
          <details className="group relative sm:w-auto">
            <summary className="inline-flex min-h-11 w-full cursor-pointer list-none items-center justify-center gap-2 rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm font-semibold text-text-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              <span>{filtersLabel}</span>
            </summary>

            <div className="mt-2 w-full rounded-(--radius-card) border border-border bg-surface p-3 shadow-(--shadow-soft) sm:absolute sm:right-0 sm:z-20 sm:w-72">
              <div className="space-y-3">
                {filters.map((filter) => (
                  <div key={filter.name}>
                    <label
                      htmlFor={`listing-filter-${filter.name}`}
                      className="block text-xs font-semibold text-text-secondary"
                    >
                      {filter.label}
                    </label>
                    <select
                      id={`listing-filter-${filter.name}`}
                      value={filter.value}
                      onChange={(event) =>
                        updateFilter(filter.name, event.target.value)
                      }
                      className="mt-1 min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm text-text-primary transition-colors duration-200 hover:border-brand-primary focus:border-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {filter.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3 inline-flex min-h-10 w-full cursor-pointer items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm font-semibold text-brand-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {clearLabel}
                </button>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>

      {activeFilterCount > 0 ? (
        <div className="mt-3">
          <ActiveFilterChips
            filters={activeFilters}
            clearLabel={clearLabel}
            onClear={clearFilters}
            onRemoveFilter={removeFilter}
          />
        </div>
      ) : null}
    </section>
  );
}
