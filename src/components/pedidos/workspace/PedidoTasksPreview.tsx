import { PedidoProgressBar } from "@/components/pedidos/PedidoProgressBar";
import { Alert } from "@/components/ui";
import type { PedidoTask, PedidoTasksProgress } from "@/lib/pedidos";

type PedidoTasksPreviewProps = {
  tasks: readonly PedidoTask[];
  progress: PedidoTasksProgress;
  loadError?: string;
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
}: PedidoTasksPreviewProps) {
  const previewTasks = getPreviewTasks(tasks);

  return (
    <section
      aria-labelledby="pedido-tasks-preview-title"
      className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
    >
      <div>
        <h2
          id="pedido-tasks-preview-title"
          className="text-lg font-semibold text-text-primary"
        >
          Tareas próximas
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Lectura rápida del avance del encargo.
        </p>
      </div>

      {loadError ? (
        <Alert variant="danger" className="mt-5">
          {loadError}
        </Alert>
      ) : (
        <>
          <div className="mt-5">
            <PedidoProgressBar {...progress} />
          </div>

          {previewTasks.length > 0 ? (
            <ul className="mt-5 divide-y divide-border">
              {previewTasks.map((task) => (
                <li
                  key={task.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
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
          ) : (
            <p className="mt-5 rounded-(--radius-control) border border-dashed border-border-strong bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
              Este encargo todavía no tiene tareas registradas.
            </p>
          )}
        </>
      )}
    </section>
  );
}
