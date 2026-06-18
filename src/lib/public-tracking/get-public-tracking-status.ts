import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";
import { WORKFLOW_TYPE_LABELS, type WorkflowType } from "@/lib/workflow-types";
import {
  getPublicTrackingStatusCopy,
  type PublicTrackingKind,
  type PublicTrackingStatus,
} from "./status-labels";

export type PublicTrackingProgress = {
  percentage: number | null;
  label: string;
};

export type PublicTrackingStatusResult = {
  kind: PublicTrackingKind;
  publicReference: string;
  workflowType: WorkflowType;
  workflowLabel: string;
  status: PublicTrackingStatus;
  statusLabel: string;
  statusDescription: string;
  createdAt: string;
  desiredDate: string | null;
  estimatedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  progress: PublicTrackingProgress | null;
};

export type GetPublicTrackingStatusErrorReason =
  | "invalid_reference"
  | "not_found"
  | "error";

export type GetPublicTrackingStatusResult = ServiceResult<
  { trackingStatus: PublicTrackingStatusResult },
  GetPublicTrackingStatusErrorReason
>;

type PublicTrackingRpcRow = {
  actual_delivery_date: string | null;
  created_at: string;
  desired_date: string | null;
  estimated_delivery_date: string | null;
  kind: string;
  progress_label: string | null;
  progress_percentage: number | null;
  public_reference: string;
  status: string;
  workflow_type: Enums<"workflow_type">;
};

const PUBLIC_REFERENCE_PATTERN = /^GD-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const INVALID_REFERENCE_MESSAGE =
  "El código de seguimiento no tiene un formato válido.";
const NOT_FOUND_MESSAGE =
  "No encontramos una solicitud o pedido con ese código. Revisa que esté escrito correctamente.";
const GENERIC_TRACKING_ERROR =
  "No se pudo consultar el estado en este momento. Inténtalo nuevamente.";

export function normalizePublicReference(value: string) {
  return value.trim().toUpperCase();
}

export function isValidPublicReference(value: string) {
  return PUBLIC_REFERENCE_PATTERN.test(value);
}

function isPublicTrackingKind(value: string): value is PublicTrackingKind {
  return value === "solicitud" || value === "pedido";
}

function mapPublicTrackingRow(
  row: PublicTrackingRpcRow,
): PublicTrackingStatusResult | null {
  if (!isPublicTrackingKind(row.kind)) {
    return null;
  }

  const statusCopy = getPublicTrackingStatusCopy(
    row.kind,
    row.status as PublicTrackingStatus,
  );

  return {
    kind: row.kind,
    publicReference: row.public_reference,
    workflowType: row.workflow_type,
    workflowLabel: WORKFLOW_TYPE_LABELS[row.workflow_type],
    status: row.status as PublicTrackingStatus,
    statusLabel: statusCopy.label,
    statusDescription: statusCopy.description,
    createdAt: row.created_at,
    desiredDate: row.desired_date,
    estimatedDeliveryDate: row.estimated_delivery_date,
    actualDeliveryDate: row.actual_delivery_date,
    progress: row.progress_label
      ? {
          percentage: row.progress_percentage,
          label: row.progress_label,
        }
      : null,
  };
}

export async function getPublicTrackingStatus(
  publicReference: string,
): Promise<GetPublicTrackingStatusResult> {
  const normalizedReference = normalizePublicReference(publicReference);

  if (!isValidPublicReference(normalizedReference)) {
    return serviceFailure("invalid_reference", INVALID_REFERENCE_MESSAGE);
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc("consultar_estado_publico", {
      p_public_reference: normalizedReference,
    });

    if (error) {
      console.error("Error consulting public tracking status", error);

      return serviceFailure("error", GENERIC_TRACKING_ERROR);
    }

    const row = data?.[0] as PublicTrackingRpcRow | undefined;

    if (!row) {
      return serviceFailure("not_found", NOT_FOUND_MESSAGE);
    }

    const trackingStatus = mapPublicTrackingRow(row);

    if (!trackingStatus) {
      console.error("Unexpected public tracking status kind", {
        kind: row.kind,
      });

      return serviceFailure("error", GENERIC_TRACKING_ERROR);
    }

    return serviceSuccess({ trackingStatus });
  } catch (error) {
    console.error("Unexpected error consulting public tracking status", error);

    return serviceFailure("error", GENERIC_TRACKING_ERROR);
  }
}
