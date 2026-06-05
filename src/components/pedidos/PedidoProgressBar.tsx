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
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-950">
            {getTasksSummary(props)}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Progreso: {safePercentage}%
          </p>
        </div>
        {props.hasTasks ? (
          <span
            className={
              props.isComplete
                ? "inline-flex rounded-md bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-700/15"
                : "inline-flex rounded-md bg-white px-2 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200"
            }
          >
            {props.isComplete
              ? "Todas completadas"
              : `${props.pendingTasks} pendientes`}
          </span>
        ) : null}
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-zinc-200">
        <div
          className="h-full rounded-full bg-teal-700 transition-all"
          style={{ width: `${safePercentage}%` }}
        />
      </div>
    </div>
  );
}
