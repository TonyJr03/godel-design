import { Constants, type Enums } from "@/types/database";

export const PEDIDO_STATUSES = Constants.public.Enums.pedido_estado;
export const PEDIDO_PRIORITIES = Constants.public.Enums.pedido_prioridad;

export type PedidoStatus = Enums<"pedido_estado">;
export type PedidoPriority = Enums<"pedido_prioridad">;

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
): PedidoStatusTransitionOption[] {
  const current = buildStatusOption(currentStatus, { isCurrent: true });

  if (isPedidoClosedStatus(currentStatus)) {
    return [current];
  }

  if (currentStatus === "solicitud_recibida") {
    return [
      current,
      buildStatusOption("en_revision"),
      buildStatusOption("cancelado"),
    ];
  }

  if (currentStatus === "en_revision") {
    const needsTasks = progress ? !progress.hasTasks : false;

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
    const needsCompletedTasks = progress
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
      buildStatusOption("entregado"),
      buildStatusOption("en_produccion", {
        reason: "Puedes volver a producción si hay correcciones pendientes.",
      }),
      buildStatusOption("cancelado"),
    ];
  }

  return [current];
}
