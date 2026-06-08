"use client";

import { useActionState } from "react";
import type {
  AssignPedidoWorkerActionState,
  PedidoDetailAction,
  RemovePedidoWorkerActionState,
} from "@/app/dashboard/pedidos/[id]/actions";
import type { InternalPedidoDetailTrabajador } from "@/lib/pedidos";
import type { AssignableWorker } from "@/lib/pedidos/list-assignable-workers";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatAppDateTime } from "@/lib/utils";

type PedidoWorkerAssignmentFormProps = {
  assignWorkerAction: PedidoDetailAction<AssignPedidoWorkerActionState>;
  removeWorkerAction: PedidoDetailAction<RemovePedidoWorkerActionState>;
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
  if (asignacion.perfiles?.full_name?.trim()) {
    return asignacion.perfiles.full_name;
  }

  return "Usuario asignado";
}

export function PedidoWorkerAssignmentForm({
  assignWorkerAction,
  removeWorkerAction,
  asignaciones,
  canManage,
  trabajadores,
  loadAssignableError,
}: PedidoWorkerAssignmentFormProps) {
  const [assignState, assignFormAction, assigning] = useActionState(
    assignWorkerAction,
    initialAssignState,
  );
  const [removeState, removeFormAction, removing] = useActionState(
    removeWorkerAction,
    initialRemoveState,
  );
  const assignedProfileError = assignState.fieldErrors?.assigned_profile_id;
  const assignedIds = new Set(
    asignaciones.map((asignacion) => asignacion.assigned_profile_id),
  );
  const availableWorkers = trabajadores.filter(
    (trabajador) => !assignedIds.has(trabajador.id),
  );

  return (
    <section className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          Personal asignado
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Usuarios internos que participan operativamente en este pedido.
        </p>
      </div>

      {assignState.message ? (
        <div
          className={
            assignState.ok
              ? "mt-5 rounded-(--radius-control) border border-success/30 bg-success-soft px-4 py-3 text-sm leading-6 text-success"
              : "mt-5 rounded-(--radius-control) border border-danger/30 bg-danger-soft px-4 py-3 text-sm leading-6 text-danger"
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
              ? "mt-5 rounded-(--radius-control) border border-success/30 bg-success-soft px-4 py-3 text-sm leading-6 text-success"
              : "mt-5 rounded-(--radius-control) border border-danger/30 bg-danger-soft px-4 py-3 text-sm leading-6 text-danger"
          }
          role={removeState.ok ? "status" : "alert"}
          aria-live="polite"
        >
          {removeState.message}
        </div>
      ) : null}

      {asignaciones.length > 0 ? (
        <ul className="mt-5 divide-y divide-border">
          {asignaciones.map((asignacion) => {
            const role = asignacion.perfiles?.role;

            return (
              <li
                key={asignacion.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {getAssignedUserName(asignacion)}
                    </span>
                    {role ? (
                      <span className="inline-flex rounded-(--radius-control) border border-border bg-surface-muted px-2 py-1 text-xs font-semibold text-text-secondary">
                        {ROLE_LABELS[role]}
                      </span>
                    ) : null}
                    {asignacion.perfiles?.is_active === false ? (
                      <span className="inline-flex rounded-(--radius-control) border border-warning/30 bg-warning-soft px-2 py-1 text-xs font-semibold text-warning">
                        Inactivo
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    Asignado el{" "}
                    {formatAppDateTime(asignacion.assigned_at, "No definida")}
                  </p>
                </div>

                {canManage ? (
                  <form action={removeFormAction}>
                    <input
                      type="hidden"
                      name="assigned_profile_id"
                      value={asignacion.assigned_profile_id}
                    />
                    <button
                      type="submit"
                      disabled={removing}
                      className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-danger/30 bg-surface px-3 text-xs font-semibold text-danger transition-colors hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"
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
        <p className="mt-5 rounded-(--radius-control) border border-dashed border-border-strong bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
          No hay personal asignado a este pedido.
        </p>
      )}

      {canManage ? (
        <form
          action={assignFormAction}
          aria-busy={assigning}
          className="mt-6 border-t border-border pt-5"
        >
          {loadAssignableError ? (
            <p className="rounded-(--radius-control) border border-danger/30 bg-danger-soft px-4 py-3 text-sm leading-6 text-danger">
              {loadAssignableError}
            </p>
          ) : availableWorkers.length === 0 ? (
            <p className="rounded-(--radius-control) border border-warning/30 bg-warning-soft px-4 py-3 text-sm leading-6 text-text-primary">
              No hay más usuarios disponibles para asignar.
            </p>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="w-full max-w-sm">
                <label
                  htmlFor="assigned_profile_id"
                  className="text-sm font-medium text-text-primary"
                >
                  Asignar personal
                </label>
                <select
                  id="assigned_profile_id"
                  name="assigned_profile_id"
                  defaultValue=""
                  disabled={assigning}
                  required
                  aria-invalid={Boolean(assignedProfileError)}
                  aria-describedby={
                    assignedProfileError ? "assigned-profile-id-error" : undefined
                  }
                  className="mt-2 min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary shadow-(--shadow-soft) disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
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
                {assignedProfileError ? (
                  <p
                    id="assigned-profile-id-error"
                    className="mt-2 text-sm leading-5 text-danger"
                  >
                    {assignedProfileError}
                  </p>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={assigning}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
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
