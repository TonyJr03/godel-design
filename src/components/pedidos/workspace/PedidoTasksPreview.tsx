import { PedidoProgressBar } from "@/components/pedidos/PedidoProgressBar";
import { ReadErrorAlert } from "@/components/ui";
import type { PedidoTask, PedidoTasksProgress } from "@/lib/pedidos";

type PedidoTasksPreviewProps = {
  tasks: readonly PedidoTask[];
  progress: PedidoTasksProgress;
  loadError?: string;
  loadErrorRetryable?: boolean;
};

function getTaskGroup(task: PedidoTask): number {
  if (task.is_completed) {
    return 2;
  }

  if (
    task.target_quantity &&
    task.target_quantity > 0 &&
    (task.completed_quantity ?? 0) > 0
  ) {
    return 1;
  }

  return 0;
}

function getTaskStatusLabel(task: PedidoTask): string {
  if (task.is_completed) {
    return "Completada";
  }

  if (
    task.target_quantity &&
    task.target_quantity > 0 &&
    (task.completed_quantity ?? 0) > 0
  ) {
    return `${task.completed_quantity ?? 0} de ${task.target_quantity}`;
  }

  return "Pendiente";
}

function getPreviewTasks(tasks: readonly PedidoTask[]) {
  return [...tasks]
    .sort((left, right) => {
      const groupDelta = getTaskGroup(left) - getTaskGroup(right);

      if (groupDelta !== 0) {
        return groupDelta;
      }

      return left.sort_order - right.sort_order;
    })
    .slice(0, 5);
}

export function PedidoTasksPreview({
  tasks,
  progress,
  loadError,
  loadErrorRetryable = false,
}: PedidoTasksPreviewProps) {
  const previewTasks = getPreviewTasks(tasks);
  const hiddenTasksCount = Math.max(tasks.length - previewTasks.length, 0);

  return (
    <section
      aria-labelledby="pedido-tasks-preview-title"
      className="flex min-h-0 flex-col rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
    >
      <h2
        id="pedido-tasks-preview-title"
        className="shrink-0 text-lg font-semibold text-text-primary"
      >
        Tareas próximas
      </h2>

      {loadError ? (
        <ReadErrorAlert
          variant="warning"
          title="No se pudieron cargar las tareas"
          retryable={loadErrorRetryable}
          className="mt-5"
        >
          <p>{loadError}</p>
        </ReadErrorAlert>
      ) : (
        <>
          <div className="mt-5 shrink-0">
            <PedidoProgressBar {...progress} />
          </div>

          <div className="mt-5 min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain">
            {previewTasks.length > 0 ? (
              <>
                <ul className="divide-y divide-border">
                  {previewTasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <p className="min-w-0 wrap-break-word text-sm font-semibold text-text-primary">
                        {task.title}
                      </p>
                      <span className="inline-flex w-fit rounded-(--radius-control) border border-border bg-surface-muted px-2.5 py-1 text-xs font-semibold text-text-secondary">
                        {getTaskStatusLabel(task)}
                      </span>
                    </li>
                  ))}
                </ul>

                {hiddenTasksCount > 0 ? (
                  <p className="pt-3 text-xs leading-5 text-text-muted">
                    Mostrando {previewTasks.length} de {tasks.length} tareas.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="rounded-(--radius-control) border border-dashed border-border-strong bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
                Este encargo todavía no tiene tareas registradas.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
