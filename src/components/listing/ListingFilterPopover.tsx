"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import type { ListingFilterConfig } from "./types";

export type ListingFilterPopoverProps = {
  filters: readonly ListingFilterConfig[];
  activeFacetCount: number;
  disabled?: boolean;
  idPrefix: string;
  onFilterChange: (name: string, value: string) => void;
};

export function ListingFilterPopover({
  filters,
  activeFacetCount,
  disabled = false,
  idPrefix,
  onFilterChange,
}: ListingFilterPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = `${idPrefix}-filters-panel`;
  const accessibleName =
    activeFacetCount > 0
      ? `Filtros, ${activeFacetCount} ${
          activeFacetCount === 1 ? "activo" : "activos"
        }`
      : "Filtros";

  const closeWithoutRestoringFocus = useCallback(() => {
    setIsOpen(false);
  }, []);

  const closeAndRestoreFocus = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        closeWithoutRestoringFocus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [closeWithoutRestoringFocus, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeAndRestoreFocus, isOpen]);

  return (
    <div ref={containerRef} className="relative shrink-0 overflow-visible">
      <button
        ref={triggerRef}
        type="button"
        aria-label={accessibleName}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-haspopup="dialog"
        title={accessibleName}
        onClick={() => setIsOpen((currentIsOpen) => !currentIsOpen)}
        className="relative inline-flex size-11 shrink-0 cursor-pointer items-center justify-center overflow-visible rounded-(--radius-control) border border-border-strong bg-surface text-text-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        {activeFacetCount > 0 ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-surface bg-brand-primary px-1 text-[0.65rem] font-bold leading-none text-surface"
          >
            {activeFacetCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Filtros"
          className="absolute right-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-(--radius-card) border border-border bg-surface p-2.5 shadow-(--shadow-soft)"
        >
          <div className="space-y-2.5">
            {filters.map((filter) => {
              const filterId = `${idPrefix}-filter-${filter.name}`;

              return (
                <div key={filter.name}>
                  <label
                    htmlFor={filterId}
                    className="block text-xs font-semibold leading-4 text-text-secondary"
                  >
                    {filter.label}
                  </label>
                  <select
                    id={filterId}
                    value={filter.value}
                    disabled={disabled}
                    onChange={(event) =>
                      onFilterChange(filter.name, event.target.value)
                    }
                    className="mt-1 min-h-10 w-full rounded-(--radius-control) border border-border-strong bg-surface px-2.5 text-sm text-text-primary transition-colors duration-200 hover:border-brand-primary focus:border-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
                  >
                    {filter.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
