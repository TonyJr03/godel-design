"use client";

import { useActionState } from "react";
import {
  updateSolicitudStatusAction,
  type UpdateSolicitudStatusActionState,
} from "@/app/dashboard/solicitudes/[id]/actions";
import {
  getAllowedSolicitudStatusTransitions,
  isSolicitudClosedStatus,
} from "@/lib/solicitudes/status";
import { SOLICITUD_STATUS_LABELS } from "@/lib/solicitudes/labels";
import type { Enums } from "@/types/database";

type SolicitudStatusFormProps = {
  solicitudId: string;
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
          ? "rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-900"
          : "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900"
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
  solicitudId,
  currentStatus,
}: SolicitudStatusFormProps) {
  const [state, formAction, pending] = useActionState(
    updateSolicitudStatusAction,
    initialState,
  );
  const transitionOptions = getAllowedSolicitudStatusTransitions(currentStatus);
  const canManageManually = transitionOptions.length > 0;

  if (isSolicitudClosedStatus(currentStatus)) {
    return (
      <div className="space-y-4">
        <ActionMessage state={state} />
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          {getClosedStatusMessage(currentStatus)}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} aria-busy={pending} className="space-y-4">
      <input type="hidden" name="solicitud_id" value={solicitudId} />

      <ActionMessage state={state} />

      {currentStatus === "aprobada" ? (
        <p className="rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-950">
          Esta solicitud puede convertirse en pedido desde la sección de
          conversión.
        </p>
      ) : null}

      <div className="max-w-sm">
        <label htmlFor="status" className="text-sm font-medium text-zinc-900">
          Siguiente estado
        </label>
        <select
          id="status"
          name="status"
          defaultValue={transitionOptions[0]?.status}
          disabled={!canManageManually || pending}
          className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
        >
          {transitionOptions.map((option) => (
            <option key={option.status} value={option.status}>
              {SOLICITUD_STATUS_LABELS[option.status]}
            </option>
          ))}
        </select>
        {transitionOptions.some((option) => option.reason) ? (
          <p className="mt-2 text-sm leading-5 text-zinc-500">
            {transitionOptions.find((option) => option.reason)?.reason}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={!canManageManually || pending}
        className="inline-flex min-h-10 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {pending ? "Actualizando..." : "Actualizar estado"}
      </button>
    </form>
  );
}
