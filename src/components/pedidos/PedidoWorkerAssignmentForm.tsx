"use client";

import { useActionState, type ReactNode } from "react";
import type {
  AssignPedidoWorkerActionState,
  PedidoDetailAction,
  RemovePedidoWorkerActionState,
} from "@/app/(interno)/dashboard/pedidos/[id]/actions";
import { Alert, Button, FormField, Select } from "@/components/ui";
import type { InternalPedidoDetailTrabajador } from "@/lib/pedidos";
import type { AssignableWorker } from "@/lib/pedidos/list-assignable-workers";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatAppDateTime } from "@/lib/utils";

type PedidoWorkerAssignmentBaseProps = {
  asignaciones: InternalPedidoDetailTrabajador[];
  presentation?: "card" | "panel";
};

type PedidoWorkerAssignmentManageProps = PedidoWorkerAssignmentBaseProps & {
  canManage: true;
  assignWorkerAction: PedidoDetailAction<AssignPedidoWorkerActionState>;
  removeWorkerAction: PedidoDetailAction<RemovePedidoWorkerActionState>;
  trabajadores: AssignableWorker[];
  loadAssignableError?: string;
};

type PedidoWorkerAssignmentReadOnlyProps = PedidoWorkerAssignmentBaseProps & {
  canManage: false;
  assignWorkerAction?: never;
  removeWorkerAction?: never;
  trabajadores?: never;
  loadAssignableError?: never;
};

type PedidoWorkerAssignmentFormProps =
  | PedidoWorkerAssignmentManageProps
  | PedidoWorkerAssignmentReadOnlyProps;

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

function AssignmentMessage({
  ok,
  message,
}: {
  ok: boolean;
  message: string;
}) {
  return (
    <Alert
      variant={ok ? "success" : "danger"}
      aria-live="polite"
    >
      {message}
    </Alert>
  );
}

function AssignmentList({
  asignaciones,
  canManage,
  removeFormAction,
  removing,
}: {
  asignaciones: InternalPedidoDetailTrabajador[];
  canManage: boolean;
  removeFormAction?: (payload: FormData) => void;
  removing?: boolean;
}) {
  if (asignaciones.length === 0) {
    return (
      <p className="mt-5 rounded-(--radius-control) border border-dashed border-border-strong bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
        No hay personal asignado a este pedido.
      </p>
    );
  }

  return (
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

            {canManage && removeFormAction ? (
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
  );
}

function AssignmentShell({
  presentation = "card",
  children,
}: {
  presentation?: "card" | "panel";
  children: ReactNode;
}) {
  const isPanelPresentation = presentation === "panel";

  return (
    <section
      className={
        isPanelPresentation
          ? "flex h-full min-h-0 min-w-0 flex-col"
          : "rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
      }
    >
      {!isPanelPresentation ? (
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Personal asignado
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Usuarios internos que participan operativamente en este pedido.
          </p>
        </div>
      ) : null}

      {children}
    </section>
  );
}

function PedidoWorkerAssignmentsReadOnly({
  asignaciones,
  presentation = "card",
}: PedidoWorkerAssignmentReadOnlyProps) {
  const isPanelPresentation = presentation === "panel";

  return (
    <AssignmentShell presentation={presentation}>
      {isPanelPresentation ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <AssignmentList asignaciones={asignaciones} canManage={false} />
        </div>
      ) : (
        <AssignmentList asignaciones={asignaciones} canManage={false} />
      )}
    </AssignmentShell>
  );
}

function ManagedPedidoWorkerAssignmentForm({
  assignWorkerAction,
  removeWorkerAction,
  asignaciones,
  trabajadores,
  loadAssignableError,
  presentation = "card",
}: PedidoWorkerAssignmentManageProps) {
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
  const isPanelPresentation = presentation === "panel";
  const removeMessage = removeState.message ? (
    <AssignmentMessage ok={removeState.ok} message={removeState.message} />
  ) : null;
  const assignMessage = assignState.message ? (
    <AssignmentMessage ok={assignState.ok} message={assignState.message} />
  ) : null;
  const assignmentsContent = (
    <>
      {removeMessage ? (
        <div className={isPanelPresentation ? "" : "mt-5"}>
          {removeMessage}
        </div>
      ) : null}
      <AssignmentList
        asignaciones={asignaciones}
        canManage
        removeFormAction={removeFormAction}
        removing={removing}
      />
    </>
  );
  const assignmentForm = (
    <form action={assignFormAction} aria-busy={assigning}>
      {assignMessage ? (
        <div className={isPanelPresentation ? "mb-4" : "mb-5"}>
          {assignMessage}
        </div>
      ) : null}

      {loadAssignableError ? (
        <Alert variant="danger">
          {loadAssignableError}
        </Alert>
      ) : availableWorkers.length === 0 ? (
        <Alert variant="warning">
          No hay más usuarios disponibles para asignar.
        </Alert>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <FormField
            id="assigned_profile_id"
            label="Asignar personal"
            required
            error={assignedProfileError}
            errorId="assigned-profile-id-error"
            compact
          >
            {({ describedBy, invalid }) => (
              <Select
                id="assigned_profile_id"
                name="assigned_profile_id"
                defaultValue=""
                disabled={assigning}
                required
                invalid={invalid}
                aria-describedby={describedBy}
              >
                <option value="" disabled>
                  Selecciona un usuario
                </option>
                {availableWorkers.map((trabajador) => (
                  <option key={trabajador.id} value={trabajador.id}>
                    {trabajador.full_name} - {ROLE_LABELS[trabajador.role]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <Button
            type="submit"
            disabled={assigning}
            className="w-full sm:w-auto"
          >
            {assigning ? "Asignando..." : "Asignar personal"}
          </Button>
        </div>
      )}
    </form>
  );

  return (
    <AssignmentShell presentation={presentation}>
      {isPanelPresentation ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            {assignmentsContent}
          </div>
          <div className="mt-4 shrink-0 border-t border-border pt-4">
            {assignmentForm}
          </div>
        </>
      ) : (
        <>
          {assignmentsContent}
          <div className="mt-6 border-t border-border pt-5">
            {assignmentForm}
          </div>
        </>
      )}
    </AssignmentShell>
  );
}

export function PedidoWorkerAssignmentForm(
  props: PedidoWorkerAssignmentFormProps,
) {
  if (!props.canManage) {
    return <PedidoWorkerAssignmentsReadOnly {...props} />;
  }

  return <ManagedPedidoWorkerAssignmentForm {...props} />;
}
