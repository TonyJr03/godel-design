import type { ReactNode } from "react";

import type {
  CreateSolicitudCommentActionState,
  SolicitudDetailAction,
  UpdateSolicitudStatusActionState,
} from "@/app/(interno)/dashboard/solicitudes/[id]/actions";
import {
  WorkspaceController,
  WorkspaceShell,
  type WorkspaceAction,
  type WorkspacePanel,
} from "@/components/workspace";
import {
  getSolicitudStatusFlow,
  SOLICITUD_STATUS_LABELS,
  type SolicitudStatusFlow,
} from "@/lib/solicitudes";
import type {
  InternalSolicitudDetail as InternalSolicitudDetailData,
  SolicitudComment,
  SolicitudHistoryItem,
} from "@/lib/solicitudes";
import type { SolicitudFileListItem } from "@/lib/storage";

import { SolicitudCommentComposer } from "./SolicitudCommentComposer";
import { SolicitudStatusForm } from "./SolicitudStatusForm";
import {
  SolicitudCommentsPanel,
  SolicitudFilesPanel,
  SolicitudHistoryTimeline,
  SolicitudInformationPanel,
  SolicitudWorkspaceHeader,
  SolicitudWorkspaceMain,
} from "./workspace";

type InternalSolicitudDetailProps = {
  solicitud: InternalSolicitudDetailData;
  updateStatusAction: SolicitudDetailAction<UpdateSolicitudStatusActionState>;
  createCommentAction: SolicitudDetailAction<CreateSolicitudCommentActionState>;
  clientePanelContent: ReactNode;
  conversionPanelContent: ReactNode;
  files: readonly SolicitudFileListItem[];
  filesLoadError?: string;
  filesLoadRetryable?: boolean;
  comments: readonly SolicitudComment[];
  commentsLoadError?: string;
  commentsLoadRetryable?: boolean;
  history: readonly SolicitudHistoryItem[];
  historyLoadError?: string;
  historyLoadRetryable?: boolean;
  clienteDetailLoadError?: string;
  statusSuccessNavigationHref?: string;
};

type WorkspaceActionState = Pick<WorkspaceAction, "tone" | "statusLabel">;

function getStatusActionState(flow: SolicitudStatusFlow): WorkspaceActionState {
  if (flow.isInitial) {
    return {
      tone: "warning",
      statusLabel: "Iniciando revisión",
    };
  }

  if (flow.advance?.enabled) {
    return {
      tone: "warning",
      statusLabel: `Puede avanzar a ${
        SOLICITUD_STATUS_LABELS[flow.advance.status]
      }`,
    };
  }

  if (flow.externalNextStep) {
    return {
      tone: "success",
      statusLabel: "Lista para convertir",
    };
  }

  if (flow.currentStatus === "rechazada") {
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
  clienteDetailLoadError,
}: {
  solicitud: InternalSolicitudDetailData;
  clienteDetailLoadError?: string;
}): WorkspaceActionState {
  if (clienteDetailLoadError) {
    return {
      tone: "danger",
      statusLabel: "No se pudo cargar el cliente",
    };
  }

  if (solicitud.cliente_id) {
    return {
      tone: "success",
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

  if (solicitud.status === "rechazada" || solicitud.status === "convertida") {
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
  createCommentAction,
  clientePanelContent,
  conversionPanelContent,
  files,
  filesLoadError,
  filesLoadRetryable = false,
  comments,
  commentsLoadError,
  commentsLoadRetryable = false,
  history,
  historyLoadError,
  historyLoadRetryable = false,
  clienteDetailLoadError,
  statusSuccessNavigationHref,
}: InternalSolicitudDetailProps) {
  const compactActionIds = ["estado", "cliente", "conversion"];
  const statusFlow = getSolicitudStatusFlow(solicitud.status);
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
      ...getStatusActionState(statusFlow),
    },
    {
      id: "cliente",
      label: "Cliente",
      icon: "cliente",
      ...getClienteActionState({
        solicitud,
        clienteDetailLoadError,
      }),
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
        "Consulta el estado actual y avanza el flujo mediante las acciones disponibles.",
      content: (
        <SolicitudStatusForm
          updateStatusAction={updateStatusAction}
          flow={statusFlow}
          presentation="panel"
          successNavigationHref={statusSuccessNavigationHref}
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
      content: (
        <SolicitudFilesPanel
          solicitudId={solicitud.id}
          files={files}
          loadError={filesLoadError}
          loadErrorRetryable={filesLoadRetryable}
        />
      ),
    },
    comentarios: {
      id: "comentarios",
      title: "Comentarios",
      description:
        "Consulta y registra comentarios internos para el equipo.",
      contentMode: "fill",
      content: (
        <div className="flex h-full min-h-0 flex-col">
          <section
            aria-labelledby="solicitud-comments-list-title"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
          >
            <h3
              id="solicitud-comments-list-title"
              className="text-base font-semibold text-text-primary"
            >
              Conversación interna
            </h3>
            <div className="mt-4">
              <SolicitudCommentsPanel
                comments={comments}
                loadError={commentsLoadError}
                loadErrorRetryable={commentsLoadRetryable}
              />
            </div>
          </section>
          <div className="mt-4 shrink-0 border-t border-border pt-4">
            <SolicitudCommentComposer
              createCommentAction={createCommentAction}
              presentation="panel"
            />
          </div>
        </div>
      ),
    },
    historial: {
      id: "historial",
      title: "Historial",
      description: "Eventos operativos registrados para esta solicitud.",
      content: (
        <SolicitudHistoryTimeline
          history={history}
          loadError={historyLoadError}
          loadErrorRetryable={historyLoadRetryable}
        />
      ),
    },
    informacion: {
      id: "informacion",
      title: "Información",
      description:
        "Datos completos de la solicitud y su metadata secundaria.",
      content: (
        <SolicitudInformationPanel solicitud={solicitud} />
      ),
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
              filesLoadRetryable={filesLoadRetryable}
            />
          }
        />
      </article>
    </WorkspaceController>
  );
}
