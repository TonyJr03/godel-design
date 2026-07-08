"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { WorkspaceContext } from "./workspace-context";
import type {
  WorkspaceMoreScope,
  WorkspacePanelOrigin,
} from "./workspace-context";
import { WorkspaceContextDialog } from "./WorkspaceContextDialog";
import { WorkspaceIcon } from "./WorkspaceIcon";
import type {
  WorkspaceAction,
  WorkspaceControllerProps,
  WorkspacePanel,
} from "./types";

type WorkspaceOpenView =
  | { type: "panel"; panelId: string; origin: WorkspacePanelOrigin }
  | { type: "more"; scope: WorkspaceMoreScope };

type WorkspaceView = WorkspaceOpenView | { type: "closed" };

function getCompactGroups(
  actions: readonly WorkspaceAction[],
  preferredIds: readonly string[] | undefined,
  maxDirectActions: number,
) {
  const orderedActions =
    preferredIds && preferredIds.length > 0
      ? preferredIds
          .map((actionId) =>
            actions.find((action) => action.id === actionId),
          )
          .filter((action): action is WorkspaceAction => Boolean(action))
      : actions;

  const directActions = orderedActions
    .filter((action) => !action.disabled)
    .slice(0, maxDirectActions);
  const directActionIds = new Set(directActions.map((action) => action.id));
  const secondaryActions = actions.filter(
    (action) => !directActionIds.has(action.id),
  );

  return { directActions, secondaryActions };
}

function getActionToneClasses(action: WorkspaceAction) {
  const tone = action.tone ?? "default";

  if (action.disabled) {
    return "border-border bg-surface-muted text-text-secondary";
  }

  if (tone === "warning") {
    return "border-warning bg-warning-soft text-warning hover:bg-surface";
  }

  if (tone === "danger") {
    return "border-danger bg-danger-soft text-danger hover:bg-surface";
  }

  if (tone === "success") {
    return "border-success bg-success-soft text-success hover:bg-surface";
  }

  return "border-border bg-surface text-text-primary hover:bg-brand-primary-soft hover:text-brand-primary";
}

export function WorkspaceController({
  actions,
  panels,
  primaryActionId,
  tabletActionIds,
  mobileActionIds,
  children,
}: WorkspaceControllerProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const bodyOverflowRef = useRef<string | null>(null);
  const [view, setView] = useState<WorkspaceView>({ type: "closed" });
  const [renderedView, setRenderedView] =
    useState<WorkspaceOpenView | null>(null);
  const [lastMoreScope, setLastMoreScope] =
    useState<WorkspaceMoreScope>("mobile");

  const restoreTriggerFocus = useCallback(() => {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    window.requestAnimationFrame(() => {
      trigger.focus({ preventScroll: true });
      triggerRef.current = null;
    });
  }, []);

  const syncClosedState = useCallback(() => {
    setView({ type: "closed" });
    setRenderedView(null);
    restoreTriggerFocus();
  }, [restoreTriggerFocus]);

  const closePanel = useCallback(() => {
    const dialog = dialogRef.current;

    if (dialog?.open) {
      dialog.close();
      return;
    }

    syncClosedState();
  }, [syncClosedState]);

  const openAction = useCallback(
    (
      actionId: string,
      trigger?: HTMLElement | null,
      origin: WorkspacePanelOrigin = "direct",
    ) => {
      const action = actions.find((item) => item.id === actionId);

      if (!action || action.disabled || !panels[actionId]) {
        return;
      }

      if (trigger) {
        triggerRef.current = trigger;
      }

      const nextView: WorkspaceOpenView = {
        type: "panel",
        panelId: actionId,
        origin,
      };

      setRenderedView(nextView);
      setView(nextView);
    },
    [actions, panels],
  );

  const openMore = useCallback(
    (
      trigger?: HTMLElement | null,
      scope: WorkspaceMoreScope = "mobile",
    ) => {
      if (trigger) {
        triggerRef.current = trigger;
      }

      setLastMoreScope(scope);

      const nextView: WorkspaceOpenView = { type: "more", scope };

      setRenderedView(nextView);
      setView(nextView);
    },
    [],
  );

  const returnToMore = useCallback(() => {
    const nextView: WorkspaceOpenView = {
      type: "more",
      scope: lastMoreScope,
    };

    setRenderedView(nextView);
    setView(nextView);
  }, [lastMoreScope]);

  const isDialogOpen = view.type !== "closed";

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog || !isDialogOpen || dialog.open) {
      return;
    }

    dialog.showModal();
  }, [isDialogOpen, renderedView]);

  useEffect(() => {
    if (!isDialogOpen) {
      if (bodyOverflowRef.current !== null) {
        document.body.style.overflow = bodyOverflowRef.current;
        bodyOverflowRef.current = null;
      }

      return;
    }

    if (bodyOverflowRef.current === null) {
      bodyOverflowRef.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    return () => {
      if (bodyOverflowRef.current !== null) {
        document.body.style.overflow = bodyOverflowRef.current;
        bodyOverflowRef.current = null;
      }
    };
  }, [isDialogOpen]);

  useEffect(() => {
    return () => {
      if (bodyOverflowRef.current !== null) {
        document.body.style.overflow = bodyOverflowRef.current;
        bodyOverflowRef.current = null;
      }
    };
  }, []);

  const contextValue = useMemo(
    () => ({
      actions,
      activePanelId: view.type === "panel" ? view.panelId : null,
      primaryActionId,
      tabletActionIds,
      mobileActionIds,
      openAction,
      openMore,
      closePanel,
      returnToMore,
      isMoreOpen: view.type === "more",
    }),
    [
      actions,
      closePanel,
      mobileActionIds,
      openAction,
      openMore,
      primaryActionId,
      returnToMore,
      tabletActionIds,
      view,
    ],
  );

  const renderedPanel =
    renderedView?.type === "panel" ? panels[renderedView.panelId] : null;
  const moreScope =
    renderedView?.type === "more"
      ? renderedView.scope
      : lastMoreScope;
  const moreGroups = getCompactGroups(
    actions,
    moreScope === "tablet" ? tabletActionIds : mobileActionIds,
    3,
  );

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
      <WorkspaceContextDialog
        dialogRef={dialogRef}
        isOpen={isDialogOpen}
        title={getDialogTitle(renderedView, renderedPanel)}
        description={renderedPanel?.description}
        showBackButton={
          renderedView?.type === "panel" && renderedView.origin === "more"
        }
        onBack={returnToMore}
        onCancel={(event) => {
          event.preventDefault();
          closePanel();
        }}
        onNativeClose={syncClosedState}
        onRequestClose={closePanel}
      >
        {renderedView?.type === "more" ? (
          <WorkspaceMoreList
            actions={moreGroups.secondaryActions}
            panels={panels}
            onOpenAction={(actionId) => openAction(actionId, null, "more")}
          />
        ) : (
          renderedPanel?.content ?? null
        )}
      </WorkspaceContextDialog>
    </WorkspaceContext.Provider>
  );
}

function getDialogTitle(
  renderedView: WorkspaceOpenView | null,
  panel: WorkspacePanel | null,
) {
  if (renderedView?.type === "more") {
    return "Más acciones";
  }

  return panel?.title ?? "Panel contextual";
}

function WorkspaceMoreList({
  actions,
  panels,
  onOpenAction,
}: {
  actions: readonly WorkspaceAction[];
  panels: Readonly<Record<string, WorkspacePanel>>;
  onOpenAction: (actionId: string) => void;
}) {
  if (actions.length === 0) {
    return (
      <p className="rounded-(--radius-control) border border-border bg-surface-muted px-4 py-3 text-sm text-text-secondary">
        No hay acciones adicionales.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {actions.map((action) => {
        const hasPanel = Boolean(panels[action.id]);
        const isDisabled = action.disabled || !hasPanel;
        const disabledReason = action.disabledReason ?? "Panel no disponible.";

        return (
          <button
            key={action.id}
            type="button"
            className={[
              "flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-(--radius-control) border px-3 py-3 text-left transition-colors duration-200 disabled:cursor-not-allowed",
              getActionToneClasses(action),
              isDisabled ? "opacity-75" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={isDisabled}
            onClick={() => onOpenAction(action.id)}
          >
            <WorkspaceIcon
              name={action.icon}
              className="mt-0.5 h-5 w-5 shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-semibold">
                <span>{action.label}</span>
                {typeof action.badge === "number" ? (
                  <span className="rounded-full border border-current px-2 py-0.5 text-xs">
                    {action.badge}
                  </span>
                ) : null}
              </span>
              {isDisabled ? (
                <span className="mt-1 block text-xs leading-5 text-text-secondary">
                  {disabledReason}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
