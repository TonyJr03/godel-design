"use client";

import { Ellipsis } from "lucide-react";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { WorkspaceIcon } from "./WorkspaceIcon";
import { useWorkspace } from "./workspace-context";
import {
  getOrderedWorkspaceActions,
  getWorkspaceActionAccessibleName,
  getWorkspaceActionToneClasses,
  getWorkspaceActionVisibleBadge,
} from "./workspace-action-presentation";
import type { WorkspaceAction } from "./types";

const ACTION_BUTTON_BASE =
  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-(--radius-control) border px-3 text-sm font-semibold transition-colors duration-200";
const MEASURE_BUTTON_BASE =
  "inline-flex min-h-11 items-center gap-2 rounded-(--radius-control) border px-3 text-sm font-semibold";

function getActionSignature(actions: readonly WorkspaceAction[]) {
  return actions
    .map((action) =>
      [
        action.id,
        action.label,
        action.statusLabel ?? "",
        action.badge ?? "",
        action.disabled ? action.disabledReason : "",
      ].join(":"),
    )
    .join("|");
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
  const orderedActions = useMemo(
    () => getOrderedWorkspaceActions(actions, tabletActionIds),
    [actions, tabletActionIds],
  );
  const enabledOrderedActions = useMemo(
    () => orderedActions.filter((action) => !action.disabled),
    [orderedActions],
  );
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(3, enabledOrderedActions.length),
  );
  const toolbarRef = useRef<HTMLElement | null>(null);
  const measureRowRef = useRef<HTMLDivElement | null>(null);
  const actionMeasureRefs = useRef(new Map<string, HTMLSpanElement>());
  const moreMeasureRef = useRef<HTMLSpanElement | null>(null);
  const directActions = enabledOrderedActions.slice(0, visibleCount);
  const directActionIds = new Set(directActions.map((action) => action.id));
  const hasMore = actions.some((action) => !directActionIds.has(action.id));
  const actionSignature = getActionSignature(actions);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    const measureRow = measureRowRef.current;

    if (!toolbar || !measureRow) {
      return;
    }

    let frameId: number | null = null;

    const measure = () => {
      frameId = null;

      const minimumCount = Math.min(3, enabledOrderedActions.length);

      if (enabledOrderedActions.length === 0) {
        setVisibleCount(0);
        return;
      }

      const availableWidth = toolbar.clientWidth;
      const style = window.getComputedStyle(measureRow);
      const gap = Number.parseFloat(style.columnGap || style.gap || "0") || 0;
      const actionWidths = enabledOrderedActions.map(
        (action) => actionMeasureRefs.current.get(action.id)?.offsetWidth ?? 0,
      );
      const moreWidth = moreMeasureRef.current?.offsetWidth ?? 0;
      let bestCount = minimumCount;

      for (
        let candidateCount = minimumCount;
        candidateCount <= enabledOrderedActions.length;
        candidateCount += 1
      ) {
        const visibleWidth = actionWidths
          .slice(0, candidateCount)
          .reduce((total, width) => total + width, 0);
        const visibleIds = new Set(
          enabledOrderedActions
            .slice(0, candidateCount)
            .map((action) => action.id),
        );
        const candidateHasMore = actions.some(
          (action) => !visibleIds.has(action.id),
        );
        const itemCount = candidateCount + (candidateHasMore ? 1 : 0);
        const totalWidth =
          visibleWidth +
          (candidateHasMore ? moreWidth : 0) +
          Math.max(0, itemCount - 1) * gap;

        if (totalWidth <= availableWidth || candidateCount === minimumCount) {
          bestCount = candidateCount;
        } else {
          break;
        }
      }

      setVisibleCount(bestCount);
    };

    const scheduleMeasure = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(scheduleMeasure);

    observer.observe(toolbar);
    observer.observe(measureRow);
    scheduleMeasure();

    document.fonts?.ready.then(scheduleMeasure).catch(() => undefined);

    return () => {
      observer.disconnect();

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [actionSignature, actions, enabledOrderedActions]);

  return (
    <>
      <div
        ref={measureRowRef}
        aria-hidden="true"
        className="pointer-events-none invisible fixed left-0 top-0 -z-50 flex w-max gap-2"
        style={{ contain: "layout style paint" }}
      >
        {enabledOrderedActions.map((action) => (
          <span
            key={action.id}
            ref={(element) => {
              if (element) {
                actionMeasureRefs.current.set(action.id, element);
              } else {
                actionMeasureRefs.current.delete(action.id);
              }
            }}
            className={[
              MEASURE_BUTTON_BASE,
              getWorkspaceActionToneClasses(action, false, "tablet"),
            ].join(" ")}
          >
            <WorkspaceIcon name={action.icon} className="h-5 w-5" />
            <span>{action.label}</span>
          </span>
        ))}
        <span
          ref={moreMeasureRef}
          className={[
            MEASURE_BUTTON_BASE,
            "border-border bg-surface text-text-primary",
          ].join(" ")}
        >
          <Ellipsis aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
          <span>Mas</span>
        </span>
      </div>

      <nav
        ref={toolbarRef}
        aria-label="Acciones del workspace"
        className="relative hidden min-w-0 overflow-x-auto overflow-y-visible md:flex md:flex-nowrap md:gap-2 xl:hidden"
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
            title={accessibleName}
            className={[
              ACTION_BUTTON_BASE,
              "relative shrink-0 overflow-visible",
              getWorkspaceActionToneClasses(action, isActive, "tablet"),
            ].join(" ")}
            onClick={(event) => openAction(action.id, event.currentTarget)}
          >
            <WorkspaceIcon name={action.icon} className="h-5 w-5" />
            <span>{action.label}</span>
            {visibleBadge ? (
              <span
                aria-hidden="true"
                data-workspace-action-badge
                className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-surface bg-current px-1 text-[0.65rem] font-bold leading-none"
              >
                <span className="text-surface">{visibleBadge}</span>
              </span>
            ) : null}
          </button>
        );
      })}

      {hasMore ? (
        <button
          type="button"
          aria-label={isMoreOpen ? "Más acciones - Activo" : "Más acciones"}
          aria-pressed={isMoreOpen}
          title={isMoreOpen ? "Más acciones - Activo" : "Más acciones"}
          className={[
            ACTION_BUTTON_BASE,
            "shrink-0",
            isMoreOpen
              ? "border-brand-primary bg-brand-primary-soft text-brand-primary"
              : "border-border bg-surface text-text-primary hover:bg-brand-primary-soft hover:text-brand-primary",
          ].join(" ")}
          onClick={(event) =>
            openMore(
              event.currentTarget,
              "tablet",
              directActions.map((action) => action.id),
            )
          }
        >
          <Ellipsis aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
          <span>Más</span>
        </button>
      ) : null}
      </nav>
    </>
  );
}
