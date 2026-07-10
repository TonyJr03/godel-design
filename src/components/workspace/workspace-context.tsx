"use client";

import { createContext, useContext } from "react";

import type { WorkspaceAction } from "./types";

export type WorkspacePanelOrigin = "direct" | "more";
export type WorkspaceMoreScope = "tablet" | "mobile";

export type WorkspaceContextValue = {
  actions: readonly WorkspaceAction[];
  activePanelId: string | null;
  primaryActionId?: string;
  tabletActionIds?: readonly string[];
  mobileActionIds?: readonly string[];
  openAction: (
    actionId: string,
    trigger?: HTMLElement | null,
    origin?: WorkspacePanelOrigin,
  ) => void;
  openMore: (
    trigger?: HTMLElement | null,
    scope?: WorkspaceMoreScope,
    directActionIds?: readonly string[],
  ) => void;
  closePanel: () => void;
  returnToMore: () => void;
  isMoreOpen: boolean;
};

export const WorkspaceContext =
  createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const context = useContext(WorkspaceContext);

  if (!context) {
    throw new Error(
      "useWorkspace debe usarse dentro de WorkspaceController.",
    );
  }

  return context;
}
