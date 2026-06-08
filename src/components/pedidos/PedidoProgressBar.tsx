import type { PedidoTasksProgress } from "@/lib/pedidos";

type PedidoProgressBarProps = Pick<
  PedidoTasksProgress,
  | "progressPercentage"
  | "totalTasks"
  | "completedTasks"
  | "pendingTasks"
  | "hasTasks"
  | "isComplete"
>;

function getTasksSummary({
  totalTasks,
  completedTasks,
  hasTasks,
}: PedidoProgressBarProps): string {
  if (!hasTasks) {
    return "Sin tareas registradas";
  }

  if (totalTasks === 1) {
    return `${completedTasks} de 1 tarea completada`;
  }

  return `${completedTasks} de ${totalTasks} tareas completadas`;
}

export function PedidoProgressBar(props: PedidoProgressBarProps) {
  const safePercentage = Math.min(
    Math.max(Math.round(props.progressPercentage), 0),
    100,
  );

  return (
    <div className="rounded-(--radius-control) border border-border bg-surface-muted p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-text-primary">
            {getTasksSummary(props)}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Progreso: {safePercentage}%
          </p>
        </div>
        {props.hasTasks ? (
          <span
            className={
              props.isComplete
                ? "inline-flex rounded-(--radius-control) border border-success/30 bg-success-soft px-2 py-1 text-xs font-semibold text-success"
                : "inline-flex rounded-(--radius-control) border border-border-strong bg-surface px-2 py-1 text-xs font-semibold text-text-secondary"
            }
          >
            {props.isComplete
              ? "Todas completadas"
              : `${props.pendingTasks} pendientes`}
          </span>
        ) : null}
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-surface ring-1 ring-inset ring-border">
        <div
          className="h-full rounded-full bg-brand-primary transition-all"
          style={{ width: `${safePercentage}%` }}
        />
      </div>
    </div>
  );
}
