"use client";

import { WorkspaceIcon } from "./WorkspaceIcon";
import { useWorkspace } from "./workspace-context";
import type { WorkspaceAction } from "./types";

type WorkspaceActionRailProps = {
  presentation?: "labeled" | "icons";
  contained?: boolean;
};

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

function getBadgeLabel(action: WorkspaceAction) {
  return typeof action.badge === "number" ? String(action.badge) : null;
}

function getVisibleBadgeValue(action: WorkspaceAction) {
  if (typeof action.badge !== "number") {
    return null;
  }

  return action.badge > 99 ? "99+" : String(action.badge);
}

function getActionAccessibleName(action: WorkspaceAction) {
  const disabledReason =
    action.disabled && action.disabledReason !== action.statusLabel
      ? action.disabledReason
      : null;

  return [
    action.label,
    action.statusLabel,
    disabledReason,
    getBadgeLabel(action),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" — ");
}

export function WorkspaceActionRail({
  presentation = "labeled",
  contained = false,
}: WorkspaceActionRailProps) {
  const { actions, activePanelId, openAction } = useWorkspace();
  const isIconRail = presentation === "icons";
  const asideLayoutClasses = isIconRail
    ? contained
      ? "xl:h-full xl:min-h-0 xl:self-stretch"
      : "xl:sticky xl:top-6 xl:h-[calc(100dvh-3rem)] xl:self-start"
    : "xl:h-full xl:min-h-0";

  return (
    <aside
      className={["hidden min-w-0 xl:block", asideLayoutClasses].join(" ")}
      aria-label="Acciones del workspace"
    >
      <div
        className={
          isIconRail
            ? "flex h-full min-h-0 flex-col items-center gap-2.5 overflow-y-auto overflow-x-hidden px-2 py-1 overscroll-contain"
            : "sticky top-6 grid gap-3"
        }
      >
        {actions.map((action) => {
          const isActive = activePanelId === action.id;
          const accessibleName = getActionAccessibleName(action);
          const visibleBadge = getVisibleBadgeValue(action);

          return (
            <button
              key={action.id}
              type="button"
              aria-label={accessibleName}
              aria-current={isActive ? "true" : undefined}
              aria-pressed={isActive}
              title={isIconRail ? accessibleName : undefined}
              className={[
                isIconRail
                  ? "relative inline-flex h-14 w-14 cursor-pointer items-center justify-center overflow-visible rounded-(--radius-control) border transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-75"
                  : "flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-(--radius-control) border px-3 py-3 text-left transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-75",
                getRailToneClasses(action, isActive),
              ].join(" ")}
              disabled={action.disabled}
              onClick={(event) => openAction(action.id, event.currentTarget)}
            >
              <WorkspaceIcon
                name={action.icon}
                className={
                  isIconRail
                    ? "h-6 w-6 shrink-0"
                    : "mt-0.5 h-5 w-5 shrink-0"
                }
              />
              {isIconRail ? (
                <>
                  {visibleBadge ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-surface bg-current px-1 text-[0.65rem] font-bold leading-none">
                      <span className="text-surface">{visibleBadge}</span>
                    </span>
                  ) : null}
                  {isActive ? (
                    <span className="sr-only">Activo</span>
                  ) : null}
                </>
              ) : (
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
                  {action.statusLabel ? (
                    <span className="mt-1 block text-xs leading-5 text-text-secondary">
                      {action.statusLabel}
                    </span>
                  ) : null}
                  {action.disabled ? (
                    action.disabledReason !== action.statusLabel ? (
                      <span className="mt-1 block text-xs leading-5 text-text-secondary">
                        {action.disabledReason}
                      </span>
                    ) : null
                  ) : null}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
