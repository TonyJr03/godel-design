"use client";

import { Ellipsis } from "lucide-react";

import { WorkspaceIcon } from "./WorkspaceIcon";
import { useWorkspace } from "./workspace-context";
import type { WorkspaceAction } from "./types";

function getDirectActions(
  actions: readonly WorkspaceAction[],
  preferredIds: readonly string[] | undefined,
) {
  const orderedActions =
    preferredIds && preferredIds.length > 0
      ? preferredIds
          .map((actionId) =>
            actions.find((action) => action.id === actionId),
          )
          .filter((action): action is WorkspaceAction => Boolean(action))
      : actions;

  return orderedActions.filter((action) => !action.disabled).slice(0, 3);
}

export function WorkspaceTabletToolbar() {
  const {
    actions,
    activePanelId,
    tabletActionIds,
    isMoreOpen,
    openAction,
    openMore,
  } = useWorkspace();
  const directActions = getDirectActions(actions, tabletActionIds);
  const directActionIds = new Set(directActions.map((action) => action.id));
  const hasMore = actions.some((action) => !directActionIds.has(action.id));

  return (
    <nav
      aria-label="Acciones del workspace"
      className="hidden min-w-0 flex-wrap gap-2 md:flex xl:hidden"
    >
      {directActions.map((action) => {
        const isActive = activePanelId === action.id;

        return (
          <button
            key={action.id}
            type="button"
            aria-current={isActive ? "true" : undefined}
            aria-pressed={isActive}
            className={[
              "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-(--radius-control) border px-3 text-sm font-semibold transition-colors duration-200",
              isActive
                ? "border-brand-primary bg-brand-primary-soft text-brand-primary"
                : "border-border bg-surface text-text-primary hover:bg-brand-primary-soft hover:text-brand-primary",
            ].join(" ")}
            onClick={(event) => openAction(action.id, event.currentTarget)}
          >
            <WorkspaceIcon name={action.icon} className="h-5 w-5" />
            <span>{action.label}</span>
            {typeof action.badge === "number" ? (
              <span className="rounded-full border border-current px-2 py-0.5 text-xs">
                {action.badge}
              </span>
            ) : null}
            {isActive ? <span className="text-xs">Activo</span> : null}
          </button>
        );
      })}

      {hasMore ? (
        <button
          type="button"
          aria-pressed={isMoreOpen}
          className={[
            "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-(--radius-control) border px-3 text-sm font-semibold transition-colors duration-200",
            isMoreOpen
              ? "border-brand-primary bg-brand-primary-soft text-brand-primary"
              : "border-border bg-surface text-text-primary hover:bg-brand-primary-soft hover:text-brand-primary",
          ].join(" ")}
          onClick={(event) => openMore(event.currentTarget, "tablet")}
        >
          <Ellipsis aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
          <span>Más</span>
          {isMoreOpen ? <span className="text-xs">Activo</span> : null}
        </button>
      ) : null}
    </nav>
  );
}
