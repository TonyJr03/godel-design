"use client";

import { useActionState } from "react";
import {
  assignPedidoWorkerAction,
  removePedidoWorkerAction,
  type AssignPedidoWorkerActionState,
  type RemovePedidoWorkerActionState,
} from "@/app/dashboard/pedidos/[id]/actions";
import type { InternalPedidoDetailTrabajador } from "@/lib/pedidos";
import type { AssignableWorker } from "@/lib/pedidos/list-assignable-workers";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatAppDateTime } from "@/lib/utils";

type PedidoWorkerAssignmentFormProps = {
  pedidoId: string;
  asignaciones: InternalPedidoDetailTrabajador[];
  canManage: boolean;
  trabajadores: AssignableWorker[];
  loadAssignableError?: string;
};

const initialAssignState: AssignPedidoWorkerActionState = {
  ok: false,
  message: "",
};

const initialRemoveState: RemovePedidoWorkerActionState = {
  ok: false,
  message: "",
};

function getAssignedUserName(
  asignacion: InternalPedidoDetailTrabajador,
): string {
  if (asignacion.profiles?.full_name?.trim()) {
    return asignacion.profiles.full_name;
  }

  return "Usuario asignado";
}

export function PedidoWorkerAssignmentForm({
  pedidoId,
  asignaciones,
  canManage,
  trabajadores,
  loadAssignableError,
}: PedidoWorkerAssignmentFormProps) {
  const [assignState, assignFormAction, assigning] = useActionState(
    assignPedidoWorkerAction,
    initialAssignState,
  );
  const [removeState, removeFormAction, removing] = useActionState(
    removePedidoWorkerAction,
    initialRemoveState,
  );
  const trabajadorError = assignState.fieldErrors?.trabajador_id;
  const assignedIds = new Set(
    asignaciones.map((asignacion) => asignacion.trabajador_id),
  );
  const availableWorkers = trabajadores.filter(
    (trabajador) => !assignedIds.has(trabajador.id),
  );

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold text-zinc-950">
          Personal asignado
        </h3>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Usuarios internos que participan operativamente en este pedido.
        </p>
      </div>

      {assignState.message ? (
        <div
          className={
            assignState.ok
              ? "mt-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-900"
              : "mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900"
          }
          role={assignState.ok ? "status" : "alert"}
          aria-live="polite"
        >
          {assignState.message}
        </div>
      ) : null}

      {removeState.message ? (
        <div
          className={
            removeState.ok
              ? "mt-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-900"
              : "mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900"
          }
          role={removeState.ok ? "status" : "alert"}
          aria-live="polite"
        >
          {removeState.message}
        </div>
      ) : null}

      {asignaciones.length > 0 ? (
        <ul className="mt-5 divide-y divide-zinc-100">
          {asignaciones.map((asignacion) => {
            const role = asignacion.profiles?.role;

            return (
              <li
                key={asignacion.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-zinc-950">
                      {getAssignedUserName(asignacion)}
                    </span>
                    {role ? (
                      <span className="inline-flex rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200">
                        {ROLE_LABELS[role]}
                      </span>
                    ) : null}
                    {asignacion.profiles?.is_active === false ? (
                      <span className="inline-flex rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 ring-1 ring-inset ring-amber-200">
                        Inactivo
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    Asignado el{" "}
                    {formatAppDateTime(asignacion.assigned_at, "No definida")}
                  </p>
                </div>

                {canManage ? (
                  <form action={removeFormAction}>
                    <input type="hidden" name="pedido_id" value={pedidoId} />
                    <input
                      type="hidden"
                      name="trabajador_id"
                      value={asignacion.trabajador_id}
                    />
                    <button
                      type="submit"
                      disabled={removing}
                      className="inline-flex min-h-9 items-center justify-center rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
                    >
                      Quitar
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-5 rounded-md border border-dashed border-zinc-300 px-4 py-3 text-sm leading-6 text-zinc-600">
          No hay personal asignado a este pedido.
        </p>
      )}

      {canManage ? (
        <form
          action={assignFormAction}
          aria-busy={assigning}
          className="mt-6 border-t border-zinc-200 pt-5"
        >
          <input type="hidden" name="pedido_id" value={pedidoId} />

          {loadAssignableError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900">
              {loadAssignableError}
            </p>
          ) : availableWorkers.length === 0 ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
              No hay más usuarios disponibles para asignar.
            </p>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="w-full max-w-sm">
                <label
                  htmlFor="trabajador_id"
                  className="text-sm font-medium text-zinc-900"
                >
                  Asignar personal
                </label>
                <select
                  id="trabajador_id"
                  name="trabajador_id"
                  defaultValue=""
                  disabled={assigning}
                  required
                  aria-invalid={Boolean(trabajadorError)}
                  aria-describedby={
                    trabajadorError ? "trabajador-id-error" : undefined
                  }
                  className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
                >
                  <option value="" disabled>
                    Selecciona un usuario
                  </option>
                  {availableWorkers.map((trabajador) => (
                    <option key={trabajador.id} value={trabajador.id}>
                      {trabajador.full_name} · {ROLE_LABELS[trabajador.role]}
                    </option>
                  ))}
                </select>
                {trabajadorError ? (
                  <p
                    id="trabajador-id-error"
                    className="mt-2 text-sm leading-5 text-red-700"
                  >
                    {trabajadorError}
                  </p>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={assigning}
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
              >
                {assigning ? "Asignando..." : "Asignar personal"}
              </button>
            </div>
          )}
        </form>
      ) : null}
    </section>
  );
}
