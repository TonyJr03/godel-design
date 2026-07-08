import type {
  InternalPedidoDetail,
  PedidoTasksProgress,
} from "@/lib/pedidos";
import { isPedidoClosedStatus } from "@/lib/pedidos/status";
import { WORKFLOW_TYPES } from "@/lib/workflow-types";

export type PedidoPrimaryWorkspaceAction =
  | {
      id: "estado" | "tareas" | "pagos";
      label: string;
    }
  | null;

type GetPedidoPrimaryWorkspaceActionInput = {
  pedido: InternalPedidoDetail;
  taskProgress?: PedidoTasksProgress | null;
  tasksLoadError?: string;
};

export function getPedidoPrimaryWorkspaceAction({
  pedido,
  taskProgress,
  tasksLoadError,
}: GetPedidoPrimaryWorkspaceActionInput): PedidoPrimaryWorkspaceAction {
  if (isPedidoClosedStatus(pedido.status)) {
    return null;
  }

  if (pedido.status === "creado" || pedido.status === "solicitud_recibida") {
    return {
      id: "estado",
      label: "Revisar estado",
    };
  }

  if (pedido.status === "en_revision") {
    if (pedido.workflow_type === WORKFLOW_TYPES.IMPRESION) {
      return {
        id: "estado",
        label: "Avanzar pedido",
      };
    }

    if (tasksLoadError) {
      return {
        id: "tareas",
        label: "Revisar tareas",
      };
    }

    if (!taskProgress?.hasTasks) {
      return {
        id: "tareas",
        label: "Crear tareas",
      };
    }

    return {
      id: "estado",
      label: "Avanzar pedido",
    };
  }

  if (pedido.status === "en_produccion") {
    if (pedido.workflow_type === WORKFLOW_TYPES.IMPRESION) {
      return {
        id: "estado",
        label: "Actualizar estado",
      };
    }

    if (tasksLoadError || !taskProgress?.isComplete) {
      return {
        id: "tareas",
        label: "Actualizar tareas",
      };
    }

    return {
      id: "estado",
      label: "Avanzar pedido",
    };
  }

  if (pedido.status === "listo_entrega") {
    if (
      !pedido.payment.isAvailable ||
      pedido.payment.paymentStatus !== "pagado"
    ) {
      return {
        id: "pagos",
        label: "Revisar pago",
      };
    }

    return {
      id: "estado",
      label: "Completar entrega",
    };
  }

  return {
    id: "estado",
    label: "Actualizar estado",
  };
}
