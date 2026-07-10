import type { ReactNode } from "react";

import type {
  SolicitudDetailAction,
  UpdateSolicitudStatusActionState,
} from "@/app/(interno)/dashboard/solicitudes/[id]/actions";
import {
  WorkspaceController,
  WorkspaceShell,
  type WorkspaceAction,
  type WorkspacePanel,
} from "@/components/workspace";
import type {
  InternalSolicitudDetail as InternalSolicitudDetailData,
  SolicitudComment,
  SolicitudHistoryItem,
} from "@/lib/solicitudes";
import type { SolicitudFileListItem } from "@/lib/storage";

import { SolicitudStatusForm } from "./SolicitudStatusForm";
import {
  SolicitudInformationPanel,
  SolicitudWorkspaceHeader,
  SolicitudWorkspaceMain,
} from "./workspace";

type InternalSolicitudDetailProps = {
  solicitud: InternalSolicitudDetailData;
  updateStatusAction: SolicitudDetailAction<UpdateSolicitudStatusActionState>;
  clientePanelContent: ReactNode;
  conversionPanelContent: ReactNode;
  filesPanelContent: ReactNode;
  commentsPanelContent: ReactNode;
  historyPanelContent: ReactNode;
  files: readonly SolicitudFileListItem[];
  filesLoadError?: string;
  comments: readonly SolicitudComment[];
  commentsLoadError?: string;
  history: readonly SolicitudHistoryItem[];
  historyLoadError?: string;
  clienteLoadError?: string;
};

type WorkspaceActionState = Pick<WorkspaceAction, "tone" | "statusLabel">;

function getStatusActionState(
  status: InternalSolicitudDetailData["status"],
): WorkspaceActionState {
  if (status === "nueva") {
    return {
      tone: "warning",
      statusLabel: "Pendiente de revisión",
    };
  }

  if (status === "en_revision") {
    return {
      statusLabel: "En revisión",
    };
  }

  if (status === "contactada") {
    return {
      statusLabel: "Cliente contactado",
    };
  }

  if (status === "aprobada") {
    return {
      tone: "success",
      statusLabel: "Solicitud aprobada",
    };
  }

  if (status === "rechazada") {
    return {
      tone: "danger",
      statusLabel: "Solicitud rechazada",
    };
  }

  return {
    tone: "success",
    statusLabel: "Solicitud convertida",
  };
}

function getClienteActionState({
  solicitud,
  clienteLoadError,
}: {
  solicitud: InternalSolicitudDetailData;
  clienteLoadError?: string;
}): WorkspaceActionState {
  if (clienteLoadError) {
    return {
      tone: "danger",
      statusLabel: "No se pudo cargar el cliente",
    };
  }

  if (solicitud.cliente_id) {
    return {
      statusLabel: "Cliente asociado",
    };
  }

  if (solicitud.status === "aprobada") {
    return {
      tone: "warning",
      statusLabel: "Falta asociar cliente",
    };
  }

  return {};
}

function getConversionActionState(
  solicitud: InternalSolicitudDetailData,
): WorkspaceActionState {
  if (solicitud.converted_order_id) {
    return {
      tone: "success",
      statusLabel: "Pedido creado",
    };
  }

  if (solicitud.status === "aprobada" && solicitud.cliente_id) {
    return {
      tone: "warning",
      statusLabel: "Lista para convertir",
    };
  }

  if (solicitud.status === "aprobada" && !solicitud.cliente_id) {
    return {
      tone: "warning",
      statusLabel: "Falta asociar cliente",
    };
  }

  if (solicitud.status === "rechazada") {
    return {
      statusLabel: "Conversión no disponible",
    };
  }

  return {
    statusLabel: "Requiere aprobación",
  };
}

export function InternalSolicitudDetail({
  solicitud,
  updateStatusAction,
  clientePanelContent,
  conversionPanelContent,
  filesPanelContent,
  commentsPanelContent,
  historyPanelContent,
  files,
  filesLoadError,
  comments,
  commentsLoadError,
  history,
  historyLoadError,
  clienteLoadError,
}: InternalSolicitudDetailProps) {
  const compactActionIds = ["estado", "cliente", "conversion"];
  const filesActionState: WorkspaceActionState = filesLoadError
    ? {
        tone: "danger",
        statusLabel: "No se pudieron cargar los archivos",
      }
    : {};
  const commentsActionState: WorkspaceActionState = commentsLoadError
    ? {
        tone: "danger",
        statusLabel: "No se pudieron cargar los comentarios",
      }
    : {};
  const historyActionState: WorkspaceActionState = historyLoadError
    ? {
        tone: "danger",
        statusLabel: "No se pudo cargar el historial",
      }
    : {};
  const workspaceActions: readonly WorkspaceAction[] = [
    {
      id: "estado",
      label: "Estado",
      icon: "estado",
      ...getStatusActionState(solicitud.status),
    },
    {
      id: "cliente",
      label: "Cliente",
      icon: "cliente",
      ...getClienteActionState({ solicitud, clienteLoadError }),
    },
    {
      id: "conversion",
      label: "Conversión",
      icon: "convertir",
      ...getConversionActionState(solicitud),
    },
    {
      id: "archivos",
      label: "Archivos",
      icon: "archivos",
      ...filesActionState,
      badge: files.length > 0 ? files.length : undefined,
    },
    {
      id: "comentarios",
      label: "Comentarios",
      icon: "comentarios",
      ...commentsActionState,
      badge: comments.length > 0 ? comments.length : undefined,
    },
    {
      id: "historial",
      label: "Historial",
      icon: "historial",
      ...historyActionState,
      badge: history.length > 0 ? history.length : undefined,
    },
    {
      id: "informacion",
      label: "Información",
      icon: "informacion",
    },
  ];
  const workspacePanels: Readonly<Record<string, WorkspacePanel>> = {
    estado: {
      id: "estado",
      title: "Estado",
      description:
        "Consulta el estado actual y aplica una transición permitida.",
      content: (
        <SolicitudStatusForm
          updateStatusAction={updateStatusAction}
          currentStatus={solicitud.status}
        />
      ),
    },
    cliente: {
      id: "cliente",
      title: "Cliente",
      description:
        "Consulta y administra el cliente interno asociado a esta solicitud.",
      content: clientePanelContent,
    },
    conversion: {
      id: "conversion",
      title: "Conversión",
      description:
        "Crea un pedido desde la solicitud cuando las reglas lo permitan.",
      content: conversionPanelContent,
    },
    archivos: {
      id: "archivos",
      title: "Archivos",
      description:
        "Consulta los archivos privados enviados con esta solicitud.",
      content: filesPanelContent,
    },
    comentarios: {
      id: "comentarios",
      title: "Comentarios",
      description:
        "Consulta y registra comentarios internos para el equipo.",
      content: commentsPanelContent,
    },
    historial: {
      id: "historial",
      title: "Historial",
      description: "Eventos operativos registrados para esta solicitud.",
      content: historyPanelContent,
    },
    informacion: {
      id: "informacion",
      title: "Información",
      description:
        "Datos completos de la solicitud y su metadata secundaria.",
      content: <SolicitudInformationPanel solicitud={solicitud} />,
    },
  };

  return (
    <WorkspaceController
      actions={workspaceActions}
      panels={workspacePanels}
      tabletActionIds={compactActionIds}
      mobileActionIds={compactActionIds}
    >
      <article>
        <WorkspaceShell
          hasActions
          desktopMode="contained"
          railPresentation="icons"
          header={<SolicitudWorkspaceHeader solicitud={solicitud} />}
          main={
            <SolicitudWorkspaceMain
              solicitud={solicitud}
              files={files}
              filesLoadError={filesLoadError}
            />
          }
        />
      </article>
    </WorkspaceController>
  );
}
