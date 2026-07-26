"use client";

import { useId, useMemo, useTransition } from "react";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ActiveFilterChips } from "./ActiveFilterChips";
import { ListingFilterPopover } from "./ListingFilterPopover";
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
  const toolbarId = useId();
  const currentQuery = normalizeQuery(searchParams.get("q") ?? "");
  const searchInputKey = `${currentQuery}:${normalizeQuery(initialQuery)}`;
  const searchInputId = `${toolbarId}-search`;

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
  const activeFacetCount = filters.filter((filter) =>
    Boolean(filter.value),
  ).length;

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
    if (isPending) {
      return;
    }

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
    if (isPending) {
      return;
    }

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
      <div className="flex items-start gap-2">
        <form
          className="min-w-0 flex-1"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();

            if (isPending) {
              return;
            }

            const formData = new FormData(event.currentTarget);
            const nextQuery = String(formData.get("q") ?? "");

            updateSearch(nextQuery);
          }}
        >
          <label htmlFor={searchInputId} className="sr-only">
            {searchLabel}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden="true"
            />
            <input
              key={searchInputKey}
              id={searchInputId}
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
          <ListingFilterPopover
            filters={filters}
            activeFacetCount={activeFacetCount}
            disabled={isPending}
            idPrefix={toolbarId}
            onFilterChange={updateFilter}
          />
        ) : null}
      </div>

      {activeFilterCount > 0 ? (
        <div className="mt-2">
          <ActiveFilterChips
            filters={activeFilters}
            clearLabel={clearLabel}
            disabled={isPending}
            isPending={isPending}
            onClear={clearFilters}
            onRemoveFilter={removeFilter}
          />
        </div>
      ) : null}

      <span
        className="sr-only size-0"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {isPending ? "Actualizando resultados..." : ""}
      </span>
    </section>
  );
}
