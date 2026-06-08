"use client";

import { useActionState } from "react";
import type {
  SolicitudDetailAction,
  UpdateSolicitudStatusActionState,
} from "@/app/dashboard/solicitudes/[id]/actions";
import {
  getAllowedSolicitudStatusTransitions,
  isSolicitudClosedStatus,
} from "@/lib/solicitudes/status";
import { SOLICITUD_STATUS_LABELS } from "@/lib/solicitudes/labels";
import type { Enums } from "@/types/database";

type SolicitudStatusFormProps = {
  updateStatusAction: SolicitudDetailAction<UpdateSolicitudStatusActionState>;
  currentStatus: Enums<"solicitud_estado">;
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
    <div
      className={
        state.ok
          ? "rounded-(--radius-control) border border-success/30 bg-success-soft px-4 py-3 text-sm leading-6 text-success"
          : "rounded-(--radius-control) border border-danger/30 bg-danger-soft px-4 py-3 text-sm leading-6 text-danger"
      }
      role={state.ok ? "status" : "alert"}
      aria-live="polite"
    >
      {state.message}
    </div>
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
}: SolicitudStatusFormProps) {
  const [state, formAction, pending] = useActionState(
    updateStatusAction,
    initialState,
  );
  const transitionOptions = getAllowedSolicitudStatusTransitions(currentStatus);
  const canManageManually = transitionOptions.length > 0;

  if (isSolicitudClosedStatus(currentStatus)) {
    return (
      <div className="space-y-4">
        <ActionMessage state={state} />
        <p className="rounded-(--radius-control) border border-warning/30 bg-warning-soft px-4 py-3 text-sm leading-6 text-text-primary">
          {getClosedStatusMessage(currentStatus)}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} aria-busy={pending} className="space-y-4">
      <ActionMessage state={state} />

      {currentStatus === "aprobada" ? (
        <p className="rounded-(--radius-control) border border-success/30 bg-success-soft px-4 py-3 text-sm leading-6 text-text-primary">
          Esta solicitud puede convertirse en pedido desde la sección de
          conversión.
        </p>
      ) : null}

      <div className="max-w-sm">
        <label htmlFor="status" className="text-sm font-medium text-text-primary">
          Siguiente estado
        </label>
        <select
          id="status"
          name="status"
          defaultValue={transitionOptions[0]?.status}
          disabled={!canManageManually || pending}
          className="mt-2 min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary shadow-(--shadow-soft) disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
        >
          {transitionOptions.map((option) => (
            <option key={option.status} value={option.status}>
              {SOLICITUD_STATUS_LABELS[option.status]}
            </option>
          ))}
        </select>
        {transitionOptions.some((option) => option.reason) ? (
          <p className="mt-2 text-sm leading-5 text-text-secondary">
            {transitionOptions.find((option) => option.reason)?.reason}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={!canManageManually || pending}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {pending ? "Actualizando..." : "Actualizar estado"}
      </button>
    </form>
  );
}
