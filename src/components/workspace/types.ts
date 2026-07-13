import type { ReactNode } from "react";

export type WorkspaceIconName =
  | "estado"
  | "tareas"
  | "archivos"
  | "comentarios"
  | "personal"
  | "pagos"
  | "historial"
  | "informacion"
  | "cliente"
  | "convertir"
  | "alerta"
  | "solicitudes"
  | "entrega"
  | "dashboard";

export type WorkspaceActionTone =
  | "default"
  | "warning"
  | "danger"
  | "success";

type WorkspaceActionBase = {
  id: string;
  label: string;
  icon: WorkspaceIconName;
  badge?: number;
  statusLabel?: string;
  tone?: WorkspaceActionTone;
};

export type WorkspaceAction = WorkspaceActionBase &
  (
    | {
        disabled: true;
        disabledReason: string;
      }
    | {
        disabled?: false;
        disabledReason?: never;
      }
  );

export type WorkspacePanelContentMode = "scroll" | "fill";

export type WorkspacePanel = {
  id: string;
  title: string;
  description?: string;
  contentMode?: WorkspacePanelContentMode;
  content: ReactNode;
};

export type WorkspaceControllerProps = {
  actions: readonly WorkspaceAction[];
  panels: Readonly<Record<string, WorkspacePanel>>;
  primaryActionId?: string;
  tabletActionIds?: readonly string[];
  mobileActionIds?: readonly string[];
  children: ReactNode;
};
