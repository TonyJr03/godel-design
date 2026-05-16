"use client";

import { useActionState } from "react";
import {
  updateSolicitudStatusAction,
  type UpdateSolicitudStatusActionState,
} from "@/app/dashboard/solicitudes/[id]/actions";
import {
  MANUAL_SOLICITUD_STATUSES,
  SOLICITUD_STATUS_LABELS,
  isManualSolicitudStatus,
} from "@/lib/solicitudes/status";
import type { Enums } from "@/types/database";

type SolicitudStatusFormProps = {
  solicitudId: string;
  currentStatus: Enums<"solicitud_estado">;
};

const initialState: UpdateSolicitudStatusActionState = {
  ok: false,
  message: "",
};

export function SolicitudStatusForm({
  solicitudId,
  currentStatus,
}: SolicitudStatusFormProps) {
  const [state, formAction, pending] = useActionState(
    updateSolicitudStatusAction,
    initialState,
  );
  const canManageManually = isManualSolicitudStatus(currentStatus);

  return (
    <form action={formAction} aria-busy={pending} className="space-y-4">
      <input type="hidden" name="solicitud_id" value={solicitudId} />

      {state.message ? (
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
      ) : null}

      {!canManageManually ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          Esta solicitud esta en un estado reservado y no puede modificarse
          manualmente desde esta vista.
        </p>
      ) : null}

      <div className="max-w-sm">
        <label
          htmlFor="estado"
          className="text-sm font-medium text-zinc-900"
        >
          Estado
        </label>
        <select
          id="estado"
          name="estado"
          defaultValue={canManageManually ? currentStatus : "nueva"}
          disabled={!canManageManually || pending}
          className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
        >
          {MANUAL_SOLICITUD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {SOLICITUD_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
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
