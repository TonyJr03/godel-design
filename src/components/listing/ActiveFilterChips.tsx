"use client";

import { BrushCleaning, LoaderCircle, X } from "lucide-react";

import type { ActiveListingFilter } from "./types";

export type ActiveFilterChipsProps = {
  filters: readonly ActiveListingFilter[];
  clearLabel?: string;
  disabled?: boolean;
  isPending?: boolean;
  onClear?: () => void;
  onRemoveFilter?: (key: string) => void;
};

export function ActiveFilterChips({
  filters,
  clearLabel = "Limpiar filtros",
  disabled = false,
  isPending = false,
  onClear,
  onRemoveFilter,
}: ActiveFilterChipsProps) {
  if (filters.length === 0) {
    return null;
  }

  const clearActionLabel = isPending ? "Actualizando resultados" : clearLabel;

  return (
    <div
      className="flex min-w-0 items-center gap-1.5"
      aria-label="Filtros activos"
    >
      <div
        role="list"
        aria-label="Criterios activos"
        className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto overscroll-x-contain scrollbar-none [&::-webkit-scrollbar]:hidden"
      >
        {filters.map((filter) => {
          const label = `${filter.label}: ${filter.valueLabel}`;

          return (
            <span
              key={filter.key}
              role="listitem"
              className="inline-flex min-h-8 max-w-64 shrink-0 items-center gap-1.5 rounded-(--radius-control) border border-border bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text-secondary"
            >
              <span className="min-w-0 truncate">{label}</span>
              {onRemoveFilter ? (
                <button
                  type="button"
                  onClick={() => onRemoveFilter(filter.key)}
                  disabled={disabled}
                  className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-(--radius-control) text-text-muted transition-colors duration-200 hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Quitar ${label}`}
                  title={`Quitar ${label}`}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </span>
          );
        })}
      </div>

      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          aria-busy={isPending}
          className={[
            "inline-flex size-9 shrink-0 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface text-brand-primary transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isPending
              ? "cursor-wait"
              : "cursor-pointer hover:border-brand-primary hover:bg-brand-primary-soft disabled:cursor-not-allowed disabled:opacity-50",
          ].join(" ")}
          aria-label={clearActionLabel}
          title={clearActionLabel}
        >
          {isPending ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <BrushCleaning className="size-4" aria-hidden="true" />
          )}
        </button>
      ) : null}
    </div>
  );
}
