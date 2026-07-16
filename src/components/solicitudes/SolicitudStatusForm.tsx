"use client";

import { useActionState } from "react";
import type {
  SolicitudDetailAction,
  UpdateSolicitudStatusActionState,
} from "@/app/(interno)/dashboard/solicitudes/[id]/actions";
import { Alert, Button, FormField, Select, StatusBadge } from "@/components/ui";
import { SOLICITUD_STATUS_LABELS } from "@/lib/solicitudes/labels";
import {
  getAllowedSolicitudStatusTransitions,
  isSolicitudClosedStatus,
} from "@/lib/solicitudes/status";
import type { Enums } from "@/types/database";

type SolicitudStatusFormProps = {
  updateStatusAction: SolicitudDetailAction<UpdateSolicitudStatusActionState>;
  currentStatus: Enums<"solicitud_estado">;
  presentation?: "card" | "panel";
};

const initialState: UpdateSolicitudStatusActionState = {
  ok: false,
  message: "",
};

function ActionMessage({ state }: { state: UpdateSolicitudStatusActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <Alert
      variant={state.ok ? "success" : "danger"}
      aria-live="polite"
    >
      {state.message}
    </Alert>
  );
}

function getClosedStatusMessage(status: Enums<"solicitud_estado">): string {
  if (status === "convertida") {
    return "Esta solicitud ya fue convertida en pedido.";
  }

  return "Esta solicitud fue rechazada y no admite cambios de estado.";
}

export function SolicitudStatusForm({
  updateStatusAction,
  currentStatus,
  presentation = "card",
}: SolicitudStatusFormProps) {
  const [state, formAction, pending] = useActionState(
    updateStatusAction,
    initialState,
  );
  const transitionOptions = getAllowedSolicitudStatusTransitions(currentStatus);
  const canManageManually = transitionOptions.length > 0;
  const isPanel = presentation === "panel";
  const transitionReason = transitionOptions.find(
    (option) => option.reason,
  )?.reason;
  const statusSummary = isPanel ? (
    <div className="rounded-(--radius-control) border border-border bg-surface-muted px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Estado actual
      </p>
      <div className="mt-2">
        <StatusBadge status={currentStatus} />
      </div>
    </div>
  ) : null;

  if (isSolicitudClosedStatus(currentStatus)) {
    return (
      <div className="space-y-4">
        {statusSummary}
        <ActionMessage state={state} />
        <Alert variant="warning">
          {getClosedStatusMessage(currentStatus)}
        </Alert>
      </div>
    );
  }

  return (
    <form action={formAction} aria-busy={pending} className="space-y-4">
      {statusSummary}
      <ActionMessage state={state} />

      {currentStatus === "aprobada" ? (
        <Alert variant="success">
          Esta solicitud puede convertirse en pedido desde la sección de
          conversión.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <FormField
          id="status"
          label="Siguiente estado"
          required
          help={transitionReason}
          compact
        >
          {({ describedBy }) => (
            <Select
              id="status"
              name="status"
              defaultValue={transitionOptions[0]?.status}
              disabled={!canManageManually || pending}
              required
              aria-describedby={describedBy}
            >
              {transitionOptions.map((option) => (
                <option key={option.status} value={option.status}>
                  {SOLICITUD_STATUS_LABELS[option.status]}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <Button
          type="submit"
          disabled={!canManageManually || pending}
          className="w-full sm:w-auto"
        >
          {pending ? "Actualizando..." : "Actualizar estado"}
        </Button>
      </div>
    </form>
  );
}
