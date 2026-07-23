"use client";

import type { ReactNode } from "react";

import type {
  PedidoDetailAction,
  UpdatePedidoStatusActionState,
} from "@/app/(interno)/dashboard/pedidos/[id]/actions";
import { Alert, ReadErrorAlert } from "@/components/ui";
import {
  StatusFlowPanel,
  type StatusFlowPanelTermination,
  type StatusFlowPanelTransition,
} from "@/components/workspace";
import { PEDIDO_STATUS_LABELS } from "@/lib/pedidos/labels";
import type { PedidoStatus, PedidoStatusFlow } from "@/lib/pedidos/status";
import {
  WORKFLOW_TYPES,
  type WorkflowType,
} from "@/lib/workflow-types";

type PedidoStatusFormProps = {
  updateStatusAction: PedidoDetailAction<UpdatePedidoStatusActionState>;
  flow: PedidoStatusFlow;
  workflowType: WorkflowType;
  tasksLoadError?: string;
  tasksLoadRetryable?: boolean;
};

type TransitionCopy = Pick<
  StatusFlowPanelTransition,
  "buttonLabel" | "pendingLabel"
>;

const PRIMARY_TRANSITION_COPY: Partial<Record<PedidoStatus, TransitionCopy>> = {
  en_produccion: {
    buttonLabel: "Pasar a producción",
    pendingLabel: "Pasando a producción...",
  },
  listo_entrega: {
    buttonLabel: "Marcar como listo para entrega",
    pendingLabel: "Marcando como listo...",
  },
  entregado: {
    buttonLabel: "Marcar como entregado",
    pendingLabel: "Marcando como entregado...",
  },
};

function getClosedStatusMessage(flow: PedidoStatusFlow): string | null {
  if (!flow.isClosed) {
    return null;
  }

  if (flow.currentStatus === "entregado") {
    return "Este pedido fue entregado y no admite más cambios de estado.";
  }

  return "Este pedido fue cancelado y no admite más cambios de estado.";
}

function getPrimaryTransition(
  flow: PedidoStatusFlow,
): StatusFlowPanelTransition | undefined {
  if (!flow.advance) {
    return undefined;
  }

  const statusLabel = PEDIDO_STATUS_LABELS[flow.advance.status];
  const copy = PRIMARY_TRANSITION_COPY[flow.advance.status] ?? {
    buttonLabel: `Avanzar a ${statusLabel}`,
    pendingLabel: "Avanzando...",
  };

  return {
    status: flow.advance.status,
    statusLabel,
    buttonLabel: copy.buttonLabel,
    pendingLabel: copy.pendingLabel,
    enabled: flow.advance.enabled,
    blockedReason: flow.advance.blockedReason,
  };
}

function getSecondaryTransition(
  flow: PedidoStatusFlow,
): StatusFlowPanelTransition | undefined {
  if (!flow.backward) {
    return undefined;
  }

  const statusLabel = PEDIDO_STATUS_LABELS[flow.backward.status];

  return {
    status: flow.backward.status,
    statusLabel,
    buttonLabel:
      flow.backward.status === "en_produccion"
        ? "Volver a producción"
        : `Volver a ${statusLabel}`,
    pendingLabel:
      flow.backward.status === "en_produccion"
        ? "Volviendo a producción..."
        : "Volviendo...",
    enabled: flow.backward.enabled,
    blockedReason: flow.backward.blockedReason,
    variant: "secondary",
  };
}

function getTermination(
  flow: PedidoStatusFlow,
): StatusFlowPanelTermination | undefined {
  if (!flow.termination) {
    return undefined;
  }

  return {
    status: flow.termination.status,
    triggerLabel: "Cancelar pedido",
    title: "¿Cancelar este pedido?",
    description:
      "El pedido quedará cerrado y no podrá continuar su producción ni marcarse como entregado.",
    confirmLabel: "Sí, cancelar pedido",
    pendingLabel: "Cancelando pedido...",
  };
}

function getNotice({
  flow,
  workflowType,
  tasksLoadError,
  tasksLoadRetryable,
}: {
  flow: PedidoStatusFlow;
  workflowType: WorkflowType;
  tasksLoadError?: string;
  tasksLoadRetryable: boolean;
}) {
  const notices: ReactNode[] = [];
  const shouldShowTaskLoadError = workflowType !== WORKFLOW_TYPES.IMPRESION;

  if (flow.automaticAdvance && !flow.advance) {
    notices.push(
      <Alert key="automatic-review" variant="info">
        <p>La revisión se inicia automáticamente al abrir este detalle.</p>
      </Alert>,
    );
  }

  if (!flow.isClosed && shouldShowTaskLoadError && tasksLoadError) {
    notices.push(
      <ReadErrorAlert
        key="tasks-load-error"
        title="Progreso de tareas no disponible"
        retryable={tasksLoadRetryable}
      >
        <p>{tasksLoadError}</p>
        <p>
          Los avances dependientes de tareas están deshabilitados temporalmente.
        </p>
      </ReadErrorAlert>,
    );
  }

  if (notices.length === 0) {
    return undefined;
  }

  return <div className="space-y-3">{notices}</div>;
}

export function PedidoStatusForm({
  updateStatusAction,
  flow,
  workflowType,
  tasksLoadError,
  tasksLoadRetryable = false,
}: PedidoStatusFormProps) {
  return (
    <StatusFlowPanel
      action={updateStatusAction}
      currentStatus={flow.currentStatus}
      primaryTransition={getPrimaryTransition(flow)}
      secondaryTransition={getSecondaryTransition(flow)}
      termination={getTermination(flow)}
      notice={getNotice({
        flow,
        workflowType,
        tasksLoadError,
        tasksLoadRetryable,
      })}
      closedMessage={getClosedStatusMessage(flow)}
    />
  );
}
