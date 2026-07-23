import { Constants, type Enums } from "@/types/database";

export const SOLICITUD_STATUSES = Constants.public.Enums.solicitud_estado;

export type SolicitudStatus = Enums<"solicitud_estado">;

export const SOLICITUD_INITIAL_STATUSES = [
  "nueva",
] as const satisfies readonly SolicitudStatus[];

export const MANUAL_SOLICITUD_STATUSES = [
  "nueva",
  "en_revision",
  "contactada",
  "aprobada",
  "rechazada",
] as const satisfies readonly Enums<"solicitud_estado">[];

export type SolicitudInitialStatus =
  (typeof SOLICITUD_INITIAL_STATUSES)[number];

export type ManualSolicitudStatus = (typeof MANUAL_SOLICITUD_STATUSES)[number];

export type SolicitudStatusTransitionOption = {
  status: ManualSolicitudStatus;
  reason?: string;
};

export type SolicitudStatusFlowAction = {
  status: SolicitudStatus;
  enabled: boolean;
  blockedReason?: string;
};

export type SolicitudExternalStatusStep = {
  id: "conversion";
  label: string;
};

export type SolicitudStatusFlow = {
  currentStatus: SolicitudStatus;
  isInitial: boolean;
  isClosed: boolean;
  automaticAdvance: SolicitudStatusFlowAction | null;
  advance: SolicitudStatusFlowAction | null;
  backward: SolicitudStatusFlowAction | null;
  termination: SolicitudStatusFlowAction | null;
  externalNextStep: SolicitudExternalStatusStep | null;
};

export function isSolicitudStatus(
  value: string | null | undefined,
): value is SolicitudStatus {
  return SOLICITUD_STATUSES.includes(value as SolicitudStatus);
}

export function isSolicitudInitialStatus(
  status: SolicitudStatus,
): status is SolicitudInitialStatus {
  return SOLICITUD_INITIAL_STATUSES.includes(status as SolicitudInitialStatus);
}

export function isManualSolicitudStatus(
  value: string | null | undefined,
): value is ManualSolicitudStatus {
  return MANUAL_SOLICITUD_STATUSES.includes(value as ManualSolicitudStatus);
}

export function isSolicitudClosedStatus(status: SolicitudStatus): boolean {
  return status === "rechazada" || status === "convertida";
}

function buildSolicitudFlowAction(
  status: SolicitudStatus,
): SolicitudStatusFlowAction {
  return {
    status,
    enabled: true,
  };
}

export function getSolicitudStatusFlow(
  currentStatus: SolicitudStatus,
): SolicitudStatusFlow {
  const baseFlow: SolicitudStatusFlow = {
    currentStatus,
    isInitial: isSolicitudInitialStatus(currentStatus),
    isClosed: isSolicitudClosedStatus(currentStatus),
    automaticAdvance: null,
    advance: null,
    backward: null,
    termination: null,
    externalNextStep: null,
  };

  if (baseFlow.isClosed) {
    return baseFlow;
  }

  if (currentStatus === "nueva") {
    return {
      ...baseFlow,
      automaticAdvance: buildSolicitudFlowAction("en_revision"),
      termination: buildSolicitudFlowAction("rechazada"),
    };
  }

  if (currentStatus === "en_revision") {
    return {
      ...baseFlow,
      advance: buildSolicitudFlowAction("contactada"),
      termination: buildSolicitudFlowAction("rechazada"),
    };
  }

  if (currentStatus === "contactada") {
    return {
      ...baseFlow,
      advance: buildSolicitudFlowAction("aprobada"),
      termination: buildSolicitudFlowAction("rechazada"),
    };
  }

  if (currentStatus === "aprobada") {
    return {
      ...baseFlow,
      termination: buildSolicitudFlowAction("rechazada"),
      externalNextStep: {
        id: "conversion",
        label: "Convertir en pedido",
      },
    };
  }

  return baseFlow;
}

export function getAllowedSolicitudStatusTransitions(
  currentStatus: SolicitudStatus,
): SolicitudStatusTransitionOption[] {
  if (currentStatus === "nueva") {
    return [{ status: "en_revision" }, { status: "rechazada" }];
  }

  if (currentStatus === "en_revision") {
    return [{ status: "contactada" }, { status: "rechazada" }];
  }

  if (currentStatus === "contactada") {
    return [{ status: "aprobada" }, { status: "rechazada" }];
  }

  if (currentStatus === "aprobada") {
    return [
      {
        status: "rechazada",
        reason: "La conversión a pedido se realiza desde la sección correspondiente.",
      },
    ];
  }

  return [];
}
