import type { Enums } from "@/types/database";

export type PedidoTaskProgressInput = {
  task_type: Enums<"pedido_tarea_tipo">;
  target_quantity: number | null;
  completed_quantity: number | null;
  is_completed: boolean;
};

export type PedidoTasksProgress = {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  progressPercentage: number;
  hasTasks: boolean;
  isComplete: boolean;
};

function calculateSingleTaskProgress(task: PedidoTaskProgressInput): number {
  if (task.task_type === "simple") {
    return task.is_completed ? 100 : 0;
  }

  if (!task.target_quantity || task.target_quantity <= 0) {
    return 0;
  }

  const completedQuantity = task.completed_quantity ?? 0;
  const rawProgress = (completedQuantity / task.target_quantity) * 100;

  return Math.min(Math.max(rawProgress, 0), 100);
}

export function calculatePedidoTasksProgress(
  tasks: readonly PedidoTaskProgressInput[],
): PedidoTasksProgress {
  const totalTasks = tasks.length;

  if (totalTasks === 0) {
    return {
      totalTasks: 0,
      completedTasks: 0,
      pendingTasks: 0,
      progressPercentage: 0,
      hasTasks: false,
      isComplete: false,
    };
  }

  const completedTasks = tasks.filter((task) => task.is_completed).length;
  const progressSum = tasks.reduce(
    (sum, task) => sum + calculateSingleTaskProgress(task),
    0,
  );
  const progressPercentage = Math.round(progressSum / totalTasks);

  return {
    totalTasks,
    completedTasks,
    pendingTasks: totalTasks - completedTasks,
    progressPercentage,
    hasTasks: true,
    isComplete: completedTasks === totalTasks,
  };
}
