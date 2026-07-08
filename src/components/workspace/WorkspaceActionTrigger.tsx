"use client";

import { WorkspaceIcon } from "./WorkspaceIcon";
import { useWorkspace } from "./workspace-context";
import type { WorkspaceAction } from "./types";

type WorkspaceActionTriggerProps = {
  actionId?: string;
  label?: string;
  className?: string;
};

function getTriggerToneClasses(action: WorkspaceAction, isActive: boolean) {
  if (action.disabled) {
    return "border-border bg-surface-muted text-text-secondary";
  }

  if (isActive) {
    return "border-brand-primary bg-brand-primary-soft text-brand-primary";
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

  return "border-border-strong bg-surface text-text-primary hover:bg-brand-primary-soft hover:text-brand-primary";
}

export function WorkspaceActionTrigger({
  actionId,
  label,
  className,
}: WorkspaceActionTriggerProps) {
  const { actions, primaryActionId, activePanelId, openAction } =
    useWorkspace();
  const resolvedActionId = actionId ?? primaryActionId;

  if (!resolvedActionId) {
    return null;
  }

  const action = actions.find((item) => item.id === resolvedActionId);

  if (!action) {
    return null;
  }

  const isActive = activePanelId === action.id;

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        aria-current={isActive ? "true" : undefined}
        aria-pressed={isActive}
        className={[
          "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-(--radius-control) border px-4 text-sm font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-70",
          getTriggerToneClasses(action, isActive),
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={action.disabled}
        onClick={(event) => openAction(action.id, event.currentTarget)}
      >
        <WorkspaceIcon name={action.icon} className="h-5 w-5" />
        <span>{label ?? action.label}</span>
        {typeof action.badge === "number" ? (
          <span className="rounded-full border border-current px-2 py-0.5 text-xs">
            {action.badge}
          </span>
        ) : null}
        {isActive ? <span className="text-xs">Activo</span> : null}
      </button>
      {action.disabled ? (
        <span className="text-xs leading-5 text-text-secondary">
          {action.disabledReason}
        </span>
      ) : null}
    </span>
  );
}
