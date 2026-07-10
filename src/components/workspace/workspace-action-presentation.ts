import type { WorkspaceAction, WorkspaceActionTone } from "./types";

type WorkspaceActionToneState = "active" | "disabled" | WorkspaceActionTone;

export type WorkspaceActionSurface = "rail" | "tablet" | "mobile" | "trigger";

function getWorkspaceActionToneState(
  action: WorkspaceAction,
  isActive: boolean,
): WorkspaceActionToneState {
  if (isActive) {
    return "active";
  }

  if (action.disabled) {
    return "disabled";
  }

  return action.tone ?? "default";
}

export function getWorkspaceActionVisibleBadge(action: WorkspaceAction) {
  if (typeof action.badge !== "number") {
    return null;
  }

  return action.badge > 99 ? "99+" : String(action.badge);
}

export function getWorkspaceActionAccessibleName(
  action: WorkspaceAction,
  options: { includeDisabledReason?: boolean; activeLabel?: string } = {},
) {
  const disabledReason =
    options.includeDisabledReason &&
    action.disabled &&
    action.disabledReason !== action.statusLabel
      ? action.disabledReason
      : null;
  const badge =
    typeof action.badge === "number" ? String(action.badge) : null;

  return [
    action.label,
    action.statusLabel,
    disabledReason,
    badge,
    options.activeLabel,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" - ");
}

export function getOrderedWorkspaceActions(
  actions: readonly WorkspaceAction[],
  preferredIds?: readonly string[],
): WorkspaceAction[] {
  if (!preferredIds?.length) {
    return [...actions];
  }

  const preferredActions = preferredIds
    .map((actionId) => actions.find((action) => action.id === actionId))
    .filter((action): action is WorkspaceAction => Boolean(action));
  const preferredSet = new Set(
    preferredActions.map((action) => action.id),
  );

  return [
    ...preferredActions,
    ...actions.filter((action) => !preferredSet.has(action.id)),
  ];
}

export function getWorkspaceActionToneClasses(
  action: WorkspaceAction,
  isActive: boolean,
  surface: WorkspaceActionSurface,
) {
  const tone = getWorkspaceActionToneState(action, isActive);

  if (tone === "active") {
    return surface === "mobile"
      ? "bg-brand-primary-soft text-brand-primary ring-1 ring-inset ring-brand-primary"
      : "border-brand-primary bg-brand-primary-soft text-brand-primary";
  }

  if (tone === "disabled") {
    return surface === "mobile"
      ? "bg-surface-muted text-text-secondary"
      : "border-border bg-surface-muted text-text-secondary";
  }

  if (tone === "warning") {
    return surface === "mobile"
      ? "bg-warning-soft text-warning hover:bg-surface-muted"
      : "border-warning bg-warning-soft text-warning hover:bg-surface";
  }

  if (tone === "danger") {
    return surface === "mobile"
      ? "bg-danger-soft text-danger hover:bg-surface-muted"
      : "border-danger bg-danger-soft text-danger hover:bg-surface";
  }

  if (tone === "success") {
    return surface === "mobile"
      ? "bg-success-soft text-success hover:bg-surface-muted"
      : "border-success bg-success-soft text-success hover:bg-surface";
  }

  if (surface === "trigger") {
    return "border-border-strong bg-surface text-text-primary hover:bg-brand-primary-soft hover:text-brand-primary";
  }

  return surface === "mobile"
    ? "text-text-primary hover:bg-brand-primary-soft hover:text-brand-primary"
    : "border-border bg-surface text-text-primary hover:bg-brand-primary-soft hover:text-brand-primary";
}
