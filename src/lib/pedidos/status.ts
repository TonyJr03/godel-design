import { Constants, type Enums } from "@/types/database";
import {
  WORKFLOW_TYPES,
  type WorkflowType,
} from "@/lib/workflow-types";

export const PEDIDO_STATUSES = Constants.public.Enums.pedido_estado;
export const PEDIDO_PRIORITIES = Constants.public.Enums.pedido_prioridad;

export type PedidoStatus = Enums<"pedido_estado">;
export type PedidoPriority = Enums<"pedido_prioridad">;
export type PedidoPaymentStatus = Enums<"pedido_pago_estado">;

export type PedidoStatusTransitionContext = {
  hasTasks: boolean;
  isComplete: boolean;
  progressPercentage: number;
};

export type PedidoStatusTransitionOption = {
  status: PedidoStatus;
  isCurrent?: boolean;
  disabled?: boolean;
  reason?: string;
};

export const DELIVERY_PAYMENT_PENDING_REASON =
  "El pedido debe estar completamente pagado antes de marcarlo como entregado.";

export function isPedidoStatus(
  value: string | null | undefined,
): value is PedidoStatus {
  return PEDIDO_STATUSES.includes(value as PedidoStatus);
}

export function isPedidoClosedStatus(status: PedidoStatus): boolean {
  return status === "entregado" || status === "cancelado";
}

export function isPedidoActiveStatus(status: PedidoStatus): boolean {
  return !isPedidoClosedStatus(status);
}

export function canManagePedidoTasksInStatus(status: PedidoStatus): boolean {
  return (
    status === "creado" ||
    status === "solicitud_recibida" ||
    status === "en_revision" ||
    status === "en_produccion"
  );
}

export function getPedidoTaskManagementBlockedReason(
  status: PedidoStatus,
): string | null {
  if (status === "listo_entrega") {
    return "Para modificar tareas, devuelve el pedido a producción.";
  }

  if (status === "entregado") {
    return "No se pueden modificar tareas de un pedido entregado.";
  }

  if (status === "cancelado") {
    return "No se pueden modificar tareas de un pedido cancelado.";
  }

  return null;
}

function buildStatusOption(
  status: PedidoStatus,
  options?: Omit<PedidoStatusTransitionOption, "status">,
): PedidoStatusTransitionOption {
  return {
    status,
    ...options,
  };
}

export function getAllowedPedidoStatusTransitions(
  currentStatus: PedidoStatus,
  progress?: PedidoStatusTransitionContext | null,
  workflowType: WorkflowType = WORKFLOW_TYPES.ENCARGO,
  paymentStatus?: PedidoPaymentStatus,
): PedidoStatusTransitionOption[] {
  const current = buildStatusOption(currentStatus, { isCurrent: true });
  const requiresTasks = workflowType === WORKFLOW_TYPES.ENCARGO;
  const blocksDeliveryByPayment =
    paymentStatus !== undefined && paymentStatus !== "pagado";

  if (isPedidoClosedStatus(currentStatus)) {
    return [current];
  }

  if (currentStatus === "creado") {
    return [
      current,
      buildStatusOption("en_revision"),
      buildStatusOption("cancelado"),
    ];
  }

  if (currentStatus === "solicitud_recibida") {
    return [
      current,
      buildStatusOption("en_revision"),
      buildStatusOption("cancelado"),
    ];
  }

  if (currentStatus === "en_revision") {
    const needsTasks = requiresTasks && progress ? !progress.hasTasks : false;

    return [
      current,
      buildStatusOption("en_produccion", {
        disabled: needsTasks,
        reason: needsTasks
          ? "Agrega al menos una tarea antes de pasar a producción."
          : undefined,
      }),
      buildStatusOption("cancelado"),
    ];
  }

  if (currentStatus === "en_produccion") {
    const needsCompletedTasks =
      requiresTasks && progress
        ? !progress.hasTasks || !progress.isComplete
        : false;

    return [
      current,
      buildStatusOption("listo_entrega", {
        disabled: needsCompletedTasks,
        reason: needsCompletedTasks
          ? "Completa todas las tareas antes de marcar el pedido como listo para entrega."
          : undefined,
      }),
      buildStatusOption("cancelado"),
    ];
  }

  if (currentStatus === "listo_entrega") {
    return [
      current,
      buildStatusOption("entregado", {
        disabled: blocksDeliveryByPayment,
        reason: blocksDeliveryByPayment
          ? DELIVERY_PAYMENT_PENDING_REASON
          : undefined,
      }),
      buildStatusOption("en_produccion", {
        reason: "Puedes volver a producción si hay correcciones pendientes.",
      }),
      buildStatusOption("cancelado"),
    ];
  }

  return [current];
}
