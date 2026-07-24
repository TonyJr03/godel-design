"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type {
  ApplyTaskTemplateActionState,
  CreatePedidoTaskActionState,
  PedidoDetailAction,
} from "@/app/(interno)/dashboard/pedidos/[id]/actions";
import {
  canManagePedidoTasksInStatus,
  getPedidoTaskManagementBlockedReason,
  type PedidoStatus,
} from "@/lib/pedidos/status";
import type { PedidoTask } from "@/lib/pedidos/list-pedido-tasks";
import type { PedidoTasksProgress } from "@/lib/pedidos/task-progress";
import { Alert, Button, ReadErrorAlert } from "@/components/ui";
import { ApplyTaskTemplateForm } from "./ApplyTaskTemplateForm";
import { PedidoProgressBar } from "./PedidoProgressBar";
import {
  PedidoTaskItem,
  type PedidoTaskItemActions,
} from "./PedidoTaskItem";

type PedidoTasksSectionProps = {
  pedidoId: string;
  applyTaskTemplateAction?: PedidoDetailAction<ApplyTaskTemplateActionState>;
  createTaskAction: PedidoDetailAction<CreatePedidoTaskActionState>;
  taskActions: PedidoTaskItemActions;
  pedidoStatus: PedidoStatus;
  tasks: PedidoTask[];
  progress: PedidoTasksProgress;
  loadError?: string;
  loadErrorRetryable?: boolean;
  presentation?: "card" | "panel";
};

const createInitialState: CreatePedidoTaskActionState = {
  ok: false,
  message: "",
  values: {
    title: "",
  },
};

export function PedidoTasksSection({
  pedidoId,
  applyTaskTemplateAction,
  createTaskAction,
  taskActions,
  pedidoStatus,
  tasks,
  progress,
  loadError,
  loadErrorRetryable = false,
  presentation = "card",
}: PedidoTasksSectionProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    createTaskAction,
    createInitialState,
  );
  const [deleteFeedback, setDeleteFeedback] = useState("");
  const titleError = state.fieldErrors?.title;
  const canManageTasks = canManagePedidoTasksInStatus(pedidoStatus);
  const blockedReason = getPedidoTaskManagementBlockedReason(pedidoStatus);
  const isPanelPresentation = presentation === "panel";

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state.ok]);

  if (loadError) {
    return (
      <section
        className={
          isPanelPresentation
            ? "min-w-0"
            : "rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
        }
      >
        {!isPanelPresentation ? (
          <h2 className="text-lg font-semibold text-text-primary">
            Tareas del pedido
          </h2>
        ) : null}
        <ReadErrorAlert
          variant="warning"
          title="No se pudieron cargar las tareas"
          retryable={loadErrorRetryable}
          className={isPanelPresentation ? "" : "mt-5"}
        >
          <p>{loadError}</p>
        </ReadErrorAlert>
      </section>
    );
  }

  return (
    <section
      className={
        isPanelPresentation
          ? "min-w-0"
          : "rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
      }
    >
      {!isPanelPresentation ? (
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Tareas del pedido
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Escribe cada paso del trabajo como una tarea. Si incluyes una
            cantidad, el sistema la detectará automáticamente.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-text-secondary">
            <span className="rounded-(--radius-control) bg-surface-muted px-2 py-1">
              Diseñar el logo
            </span>
            <span className="rounded-(--radius-control) bg-surface-muted px-2 py-1">
              Imprimir 40 páginas
            </span>
            <span className="rounded-(--radius-control) bg-surface-muted px-2 py-1">
              Encuadernar 2 libretas
            </span>
          </div>
        </div>
      ) : null}

      {canManageTasks ? (
        <div
          className={[
            isPanelPresentation ? "" : "mt-6",
            "space-y-6",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {applyTaskTemplateAction ? (
            <ApplyTaskTemplateForm
              pedidoId={pedidoId}
              action={applyTaskTemplateAction}
              presentation={isPanelPresentation ? "panel" : "card"}
            />
          ) : null}

          <section aria-labelledby="pedido-create-task-title">
            <h3
              id="pedido-create-task-title"
              className="text-base font-semibold text-text-primary"
            >
              Nueva tarea
            </h3>

            <form
              ref={formRef}
              action={formAction}
              aria-busy={pending}
              className="mt-4"
            >
              {state.message ? (
                <Alert
                  variant={state.ok ? "success" : "danger"}
                  title={state.ok ? "Tarea creada" : "No se pudo crear la tarea"}
                  aria-live="polite"
                >
                  <p>{state.message}</p>
                </Alert>
              ) : null}

              <div
                className={[
                  state.message ? "mt-4" : "",
                  "flex flex-col gap-3 lg:flex-row lg:items-end",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="flex-1">
                  <label
                    htmlFor="pedido-task-title"
                    className={
                      isPanelPresentation
                        ? "sr-only"
                        : "text-sm font-medium text-text-primary"
                    }
                  >
                    Nueva tarea
                  </label>
                  <input
                    id="pedido-task-title"
                    name="title"
                    type="text"
                    maxLength={160}
                    required
                    disabled={pending}
                    defaultValue={state.values?.title ?? ""}
                    aria-invalid={Boolean(titleError)}
                    aria-describedby={
                      titleError ? "pedido-task-title-error" : undefined
                    }
                    className={[
                      "min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary shadow-(--shadow-soft) placeholder:text-text-muted disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted",
                      isPanelPresentation ? "" : "mt-2",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                  {titleError ? (
                    <p
                      id="pedido-task-title-error"
                      className="mt-2 text-sm leading-5 text-danger"
                    >
                      {titleError}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  disabled={pending}
                  className="w-full lg:w-auto"
                >
                  {pending ? "Creando tarea..." : "Crear tarea"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section
        aria-labelledby="pedido-registered-tasks-title"
        className="mt-6 border-t border-border pt-5"
      >
        <h3
          id="pedido-registered-tasks-title"
          className="text-base font-semibold text-text-primary"
        >
          Tareas registradas
        </h3>

        {deleteFeedback ? (
          <Alert variant="success" title="Tarea eliminada" className="mt-4">
            <p>{deleteFeedback}</p>
          </Alert>
        ) : null}

        <div className="mt-4">
          <PedidoProgressBar {...progress} />
        </div>

        {tasks.length > 0 ? (
          <ul
            className="mt-5 divide-y divide-border overflow-hidden rounded-(--radius-card) border border-border bg-surface"
            aria-label="Tareas del pedido"
          >
            {tasks.map((task) => (
              <PedidoTaskItem
                key={task.id}
                task={task}
                canManage={canManageTasks}
                actions={taskActions}
                onDeleteIntent={() => setDeleteFeedback("")}
                onDeleteSuccess={setDeleteFeedback}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-(--radius-control) border border-dashed border-border-strong bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
            Este pedido todavía no tiene tareas registradas.
          </p>
        )}
      </section>

      {!canManageTasks ? (
        <div className="mt-6 border-t border-border pt-5">
          <p className="rounded-(--radius-control) border border-warning/30 bg-warning-soft px-4 py-3 text-sm leading-6 text-text-primary">
            {blockedReason}
          </p>
        </div>
      ) : null}
    </section>
  );
}
