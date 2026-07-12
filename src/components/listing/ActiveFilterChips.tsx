"use client";

import { X } from "lucide-react";

import type { ActiveListingFilter } from "./types";

export type ActiveFilterChipsProps = {
  filters: readonly ActiveListingFilter[];
  clearLabel?: string;
  onClear?: () => void;
  onRemoveFilter?: (key: string) => void;
};

export function ActiveFilterChips({
  filters,
  clearLabel = "Limpiar filtros",
  onClear,
  onRemoveFilter,
}: ActiveFilterChipsProps) {
  if (filters.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label="Filtros activos"
    >
      {filters.map((filter) => {
        const label = `${filter.label}: ${filter.valueLabel}`;

        return (
          <span
            key={filter.key}
            className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-(--radius-control) border border-border bg-surface-muted px-2.5 py-1 text-xs font-semibold text-text-secondary"
          >
            <span className="min-w-0 truncate">{label}</span>
            {onRemoveFilter ? (
              <button
                type="button"
                onClick={() => onRemoveFilter(filter.key)}
                className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-(--radius-control) text-text-muted transition-colors duration-200 hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={`Quitar ${label}`}
                title={`Quitar ${label}`}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </span>
        );
      })}

      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-3 py-1 text-xs font-semibold text-brand-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {clearLabel}
        </button>
      ) : null}
    </div>
  );
}
