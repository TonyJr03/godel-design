"use client";

import { WorkspaceIcon } from "./WorkspaceIcon";
import { useWorkspace } from "./workspace-context";
import {
  getWorkspaceActionToneClasses,
  getWorkspaceActionVisibleBadge,
} from "./workspace-action-presentation";

type WorkspaceActionTriggerProps = {
  actionId?: string;
  label?: string;
  className?: string;
};

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
  const visibleBadge = getWorkspaceActionVisibleBadge(action);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        aria-current={isActive ? "true" : undefined}
        aria-pressed={isActive}
        className={[
          "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-(--radius-control) border px-4 text-sm font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-70",
          getWorkspaceActionToneClasses(action, isActive, "trigger"),
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={action.disabled}
        onClick={(event) => openAction(action.id, event.currentTarget)}
      >
        <WorkspaceIcon name={action.icon} className="h-5 w-5" />
        <span>{label ?? action.label}</span>
        {visibleBadge ? (
          <span className="rounded-full border border-current px-2 py-0.5 text-xs">
            {visibleBadge}
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
