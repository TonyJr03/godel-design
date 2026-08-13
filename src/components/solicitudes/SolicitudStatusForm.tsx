"use client";

import type {
  SolicitudDetailAction,
  UpdateSolicitudStatusActionState,
} from "@/app/(interno)/dashboard/solicitudes/[id]/actions";
import { Alert } from "@/components/ui";
import {
  StatusFlowPanel,
  type StatusFlowPanelTermination,
  type StatusFlowPanelTransition,
} from "@/components/workspace";
import { SOLICITUD_STATUS_LABELS } from "@/lib/solicitudes/labels";
import type { SolicitudStatusFlow } from "@/lib/solicitudes/status";

type SolicitudStatusFormProps = {
  updateStatusAction: SolicitudDetailAction<UpdateSolicitudStatusActionState>;
  flow: SolicitudStatusFlow;
  presentation?: "card" | "panel";
  successNavigationHref?: string;
};

function getClosedStatusMessage(flow: SolicitudStatusFlow): string | null {
  if (!flow.isClosed) {
    return null;
  }

  if (flow.currentStatus === "convertida") {
    return "Esta solicitud ya fue convertida en pedido.";
  }

  return "Esta solicitud fue rechazada y no admite más cambios de estado.";
}

function getPrimaryTransition(
  flow: SolicitudStatusFlow,
): StatusFlowPanelTransition | undefined {
  if (!flow.advance) {
    return undefined;
  }

  const statusLabel = SOLICITUD_STATUS_LABELS[flow.advance.status];

  return {
    status: flow.advance.status,
    statusLabel,
    buttonLabel: `Avanzar a ${statusLabel}`,
    pendingLabel: "Avanzando...",
    enabled: flow.advance.enabled,
    blockedReason: flow.advance.blockedReason,
  };
}

function getTermination(
  flow: SolicitudStatusFlow,
): StatusFlowPanelTermination | undefined {
  if (!flow.termination) {
    return undefined;
  }

  return {
    status: flow.termination.status,
    triggerLabel: "Rechazar solicitud",
    title: "¿Rechazar esta solicitud?",
    description:
      "La solicitud quedará cerrada y no podrá continuar su flujo ni convertirse en pedido.",
    confirmLabel: "Sí, rechazar solicitud",
    pendingLabel: "Rechazando solicitud...",
  };
}

function getNotice(flow: SolicitudStatusFlow) {
  if (flow.automaticAdvance && !flow.advance) {
    return (
      <Alert variant="info">
        <p>La revisión se inicia automáticamente al abrir este detalle.</p>
      </Alert>
    );
  }

  if (flow.externalNextStep) {
    return (
      <Alert variant="success">
        <p>
          La solicitud está aprobada. El siguiente paso es convertirla en pedido
          desde la sección Conversión.
        </p>
      </Alert>
    );
  }

  return undefined;
}

export function SolicitudStatusForm({
  updateStatusAction,
  flow,
  successNavigationHref,
}: SolicitudStatusFormProps) {
  return (
    <StatusFlowPanel
      action={updateStatusAction}
      currentStatus={flow.currentStatus}
      primaryTransition={getPrimaryTransition(flow)}
      termination={getTermination(flow)}
      notice={getNotice(flow)}
      closedMessage={getClosedStatusMessage(flow)}
      successNavigationHref={successNavigationHref}
    />
  );
}
