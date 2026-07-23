import { Constants, type Enums } from "@/types/database";
import {
  WORKFLOW_TYPES,
  type WorkflowType,
} from "@/lib/workflow-types";

export const PEDIDO_STATUSES = Constants.public.Enums.pedido_estado;
export const PEDIDO_PRIORITIES = Constants.public.Enums.pedido_prioridad;
export const PEDIDO_PAYMENT_STATUSES =
  Constants.public.Enums.pedido_pago_estado;

export type PedidoStatus = Enums<"pedido_estado">;
export type PedidoPriority = Enums<"pedido_prioridad">;
export type PedidoPaymentStatus = Enums<"pedido_pago_estado">;

export const PEDIDO_INITIAL_STATUSES = [
  "creado",
  "solicitud_recibida",
] as const satisfies readonly PedidoStatus[];

export const DELIVERY_PAYMENT_PENDING_REASON =
  "El pedido debe estar completamente pagado antes de marcarlo como entregado.";

export const PEDIDO_TASKS_UNAVAILABLE_REASON =
  "No se puede validar este avance mientras las tareas no estén disponibles.";

export const PEDIDO_TASKS_REQUIRED_REASON =
  "Agrega al menos una tarea antes de pasar a producción.";

export const PEDIDO_TASKS_INCOMPLETE_REASON =
  "Completa todas las tareas antes de marcar el pedido como listo para entrega.";

export const PEDIDO_PAYMENT_UNAVAILABLE_REASON =
  "No se puede validar el pago del pedido en este momento.";

export type PedidoInitialStatus = (typeof PEDIDO_INITIAL_STATUSES)[number];

export type PedidoStatusTransitionContext = {
  hasTasks: boolean;
  isComplete: boolean;
  progressPercentage: number;
};

export type PedidoStatusFlowContext = {
  workflowType?: WorkflowType;
  taskProgress?: PedidoStatusTransitionContext | null;
  tasksAvailable?: boolean;
  paymentStatus?: PedidoPaymentStatus;
  paymentAvailable?: boolean;
};

export type PedidoStatusTransitionOption = {
  status: PedidoStatus;
  isCurrent?: boolean;
  disabled?: boolean;
  reason?: string;
};

export type PedidoStatusFlowAction = {
  status: PedidoStatus;
  enabled: boolean;
  blockedReason?: string;
};

export type PedidoStatusFlow = {
  currentStatus: PedidoStatus;
  isInitial: boolean;
  isClosed: boolean;
  automaticAdvance: PedidoStatusFlowAction | null;
  advance: PedidoStatusFlowAction | null;
  backward: PedidoStatusFlowAction | null;
  termination: PedidoStatusFlowAction | null;
};

type NormalizedPedidoStatusFlowContext = {
  workflowType: WorkflowType;
  taskProgress: PedidoStatusTransitionContext | null;
  tasksAvailable: boolean;
  paymentStatus?: PedidoPaymentStatus;
  paymentAvailable: boolean;
};

export function isPedidoStatus(
  value: string | null | undefined,
): value is PedidoStatus {
  return PEDIDO_STATUSES.includes(value as PedidoStatus);
}

export function isPedidoInitialStatus(
  status: PedidoStatus,
): status is PedidoInitialStatus {
  return PEDIDO_INITIAL_STATUSES.includes(status as PedidoInitialStatus);
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

function buildPedidoFlowAction(
  status: PedidoStatus,
  options?: Omit<PedidoStatusFlowAction, "status">,
): PedidoStatusFlowAction {
  return {
    status,
    enabled: options?.enabled ?? true,
    ...(options?.blockedReason ? { blockedReason: options.blockedReason } : {}),
  };
}

function getPedidoReviewAdvanceAction(
  context: NormalizedPedidoStatusFlowContext,
): PedidoStatusFlowAction {
  if (context.workflowType === WORKFLOW_TYPES.IMPRESION) {
    return buildPedidoFlowAction("en_produccion");
  }

  if (!context.tasksAvailable || !context.taskProgress) {
    return buildPedidoFlowAction("en_produccion", {
      enabled: false,
      blockedReason: PEDIDO_TASKS_UNAVAILABLE_REASON,
    });
  }

  if (!context.taskProgress.hasTasks) {
    return buildPedidoFlowAction("en_produccion", {
      enabled: false,
      blockedReason: PEDIDO_TASKS_REQUIRED_REASON,
    });
  }

  return buildPedidoFlowAction("en_produccion");
}

function getPedidoProductionAdvanceAction(
  context: NormalizedPedidoStatusFlowContext,
): PedidoStatusFlowAction {
  if (context.workflowType === WORKFLOW_TYPES.IMPRESION) {
    return buildPedidoFlowAction("listo_entrega");
  }

  if (!context.tasksAvailable || !context.taskProgress) {
    return buildPedidoFlowAction("listo_entrega", {
      enabled: false,
      blockedReason: PEDIDO_TASKS_UNAVAILABLE_REASON,
    });
  }

  if (!context.taskProgress.hasTasks || !context.taskProgress.isComplete) {
    return buildPedidoFlowAction("listo_entrega", {
      enabled: false,
      blockedReason: PEDIDO_TASKS_INCOMPLETE_REASON,
    });
  }

  return buildPedidoFlowAction("listo_entrega");
}

function getPedidoDeliveryAdvanceAction(
  context: NormalizedPedidoStatusFlowContext,
): PedidoStatusFlowAction {
  if (!context.paymentAvailable || context.paymentStatus === undefined) {
    return buildPedidoFlowAction("entregado", {
      enabled: false,
      blockedReason: PEDIDO_PAYMENT_UNAVAILABLE_REASON,
    });
  }

  if (context.paymentStatus !== "pagado") {
    return buildPedidoFlowAction("entregado", {
      enabled: false,
      blockedReason: DELIVERY_PAYMENT_PENDING_REASON,
    });
  }

  return buildPedidoFlowAction("entregado");
}

export function getPedidoStatusFlow(
  currentStatus: PedidoStatus,
  context?: PedidoStatusFlowContext,
): PedidoStatusFlow {
  const flowContext: NormalizedPedidoStatusFlowContext = {
    workflowType: context?.workflowType ?? WORKFLOW_TYPES.ENCARGO,
    taskProgress: context?.taskProgress ?? null,
    tasksAvailable: context?.tasksAvailable ?? true,
    paymentStatus: context?.paymentStatus,
    paymentAvailable: context?.paymentAvailable ?? true,
  };

  const baseFlow: PedidoStatusFlow = {
    currentStatus,
    isInitial: isPedidoInitialStatus(currentStatus),
    isClosed: isPedidoClosedStatus(currentStatus),
    automaticAdvance: null,
    advance: null,
    backward: null,
    termination: null,
  };

  if (baseFlow.isClosed) {
    return baseFlow;
  }

  if (currentStatus === "creado" || currentStatus === "solicitud_recibida") {
    return {
      ...baseFlow,
      automaticAdvance: buildPedidoFlowAction("en_revision"),
      termination: buildPedidoFlowAction("cancelado"),
    };
  }

  if (currentStatus === "en_revision") {
    return {
      ...baseFlow,
      advance: getPedidoReviewAdvanceAction(flowContext),
      termination: buildPedidoFlowAction("cancelado"),
    };
  }

  if (currentStatus === "en_produccion") {
    return {
      ...baseFlow,
      advance: getPedidoProductionAdvanceAction(flowContext),
      termination: buildPedidoFlowAction("cancelado"),
    };
  }

  if (currentStatus === "listo_entrega") {
    return {
      ...baseFlow,
      advance: getPedidoDeliveryAdvanceAction(flowContext),
      backward: buildPedidoFlowAction("en_produccion"),
      termination: buildPedidoFlowAction("cancelado"),
    };
  }

  return baseFlow;
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
