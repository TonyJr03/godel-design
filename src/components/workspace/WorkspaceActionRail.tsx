"use client";

import { WorkspaceIcon } from "./WorkspaceIcon";
import { useWorkspace } from "./workspace-context";
import type { WorkspaceAction } from "./types";

function getRailToneClasses(action: WorkspaceAction, isActive: boolean) {
  if (isActive) {
    return "border-brand-primary bg-brand-primary-soft text-brand-primary";
  }

  if (action.disabled) {
    return "border-border bg-surface-muted text-text-secondary";
  }

  if (action.tone === "warning") {
    return "border-warning bg-warning-soft text-warning hover:bg-surface";
  }

  if (action.tone === "danger") {
    return "border-danger bg-danger-soft text-danger hover:bg-surface";
  }

  if (action.tone === "success") {
    return "border-success bg-success-soft text-success hover:bg-surface";
  }

  return "border-border bg-surface text-text-primary hover:bg-brand-primary-soft hover:text-brand-primary";
}

export function WorkspaceActionRail() {
  const { actions, activePanelId, openAction } = useWorkspace();

  return (
    <aside className="hidden min-w-0 xl:block" aria-label="Acciones del workspace">
      <div className="sticky top-6 grid gap-3">
        {actions.map((action) => {
          const isActive = activePanelId === action.id;

          return (
            <button
              key={action.id}
              type="button"
              aria-current={isActive ? "true" : undefined}
              aria-pressed={isActive}
              className={[
                "flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-(--radius-control) border px-3 py-3 text-left transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-75",
                getRailToneClasses(action, isActive),
              ].join(" ")}
              disabled={action.disabled}
              onClick={(event) => openAction(action.id, event.currentTarget)}
            >
              <WorkspaceIcon
                name={action.icon}
                className="mt-0.5 h-5 w-5 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  <span>{action.label}</span>
                  {typeof action.badge === "number" ? (
                    <span className="rounded-full border border-current px-2 py-0.5 text-xs">
                      {action.badge}
                    </span>
                  ) : null}
                  {isActive ? (
                    <span className="text-xs font-semibold">Activo</span>
                  ) : null}
                </span>
                {action.disabled ? (
                  <span className="mt-1 block text-xs leading-5 text-text-secondary">
                    {action.disabledReason}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
