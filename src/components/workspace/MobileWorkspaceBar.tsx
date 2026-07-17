"use client";

import { Ellipsis } from "lucide-react";

import { WorkspaceIcon } from "./WorkspaceIcon";
import { useWorkspace } from "./workspace-context";
import {
  getWorkspaceActionAccessibleName,
  getOrderedWorkspaceActions,
  getWorkspaceActionToneClasses,
  getWorkspaceActionVisibleBadge,
} from "./workspace-action-presentation";

const GRID_COLUMN_CLASSES = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
} as const;

export function MobileWorkspaceBar() {
  const {
    actions,
    activePanelId,
    mobileActionIds,
    isMoreOpen,
    openAction,
    openMore,
  } = useWorkspace();
  const orderedActions = getOrderedWorkspaceActions(actions, mobileActionIds);
  const directActions = orderedActions
    .filter((action) => !action.disabled)
    .slice(0, 3);
  const directActionIds = new Set(directActions.map((action) => action.id));
  const hasMore = actions.some(
    (action) => !directActionIds.has(action.id),
  );
  const visibleItemCount = directActions.length + (hasMore ? 1 : 0);

  if (visibleItemCount === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Acciones del workspace"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-raised px-2 pt-2 pb-[env(safe-area-inset-bottom)] shadow-(--shadow-soft) md:hidden"
    >
      <div
        className={[
          "grid min-h-16 gap-1",
          GRID_COLUMN_CLASSES[
            visibleItemCount as keyof typeof GRID_COLUMN_CLASSES
          ],
        ].join(" ")}
      >
        {directActions.map((action) => {
          const isActive = activePanelId === action.id;
          const accessibleName = getWorkspaceActionAccessibleName(action, {
            includeDisabledReason: true,
            activeLabel: isActive ? "Activo" : undefined,
          });
          const visibleBadge = getWorkspaceActionVisibleBadge(action);

          return (
            <button
              key={action.id}
              type="button"
              aria-label={accessibleName}
              aria-current={isActive ? "true" : undefined}
              aria-pressed={isActive}
              className={[
                "relative flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 overflow-visible rounded-(--radius-control) px-2 text-xs font-semibold transition-colors duration-200",
                getWorkspaceActionToneClasses(action, isActive, "mobile"),
              ].join(" ")}
              onClick={(event) => openAction(action.id, event.currentTarget)}
            >
              <WorkspaceIcon name={action.icon} className="h-5 w-5" />
              <span className="text-center leading-tight">{action.label}</span>
              {action.statusLabel ? (
                <span className="sr-only">{action.statusLabel}</span>
              ) : null}
              {visibleBadge ? (
                <span
                  aria-hidden="true"
                  data-workspace-action-badge
                  className="absolute -right-0.5 -top-0.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-surface bg-current px-1 text-[0.65rem] font-bold leading-none"
                >
                  <span className="text-surface">{visibleBadge}</span>
                </span>
              ) : null}
              {isActive ? <span className="sr-only">Activo</span> : null}
            </button>
          );
        })}

        {hasMore ? (
          <button
            type="button"
            aria-label={isMoreOpen ? "Más acciones - Activo" : "Más acciones"}
            aria-pressed={isMoreOpen}
            className={[
              "relative flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 overflow-visible rounded-(--radius-control) px-2 text-xs font-semibold transition-colors duration-200",
              isMoreOpen
                ? "bg-brand-primary-soft text-brand-primary"
                : "text-text-primary hover:bg-brand-primary-soft hover:text-brand-primary",
            ].join(" ")}
            onClick={(event) =>
              openMore(
                event.currentTarget,
                "mobile",
                directActions.map((action) => action.id),
              )
            }
          >
            <Ellipsis
              aria-hidden="true"
              className="h-5 w-5"
              strokeWidth={1.75}
            />
            <span className="text-center leading-tight">Más</span>
            {isMoreOpen ? <span className="sr-only">Activo</span> : null}
          </button>
        ) : null}
      </div>
    </nav>
  );
}
