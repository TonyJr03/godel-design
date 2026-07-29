import type {
  InternalPedidoDetail,
  PedidoTask,
  PedidoTasksProgress,
} from "@/lib/pedidos";
import type { PedidoFileListItem } from "@/lib/storage";
import { WORKFLOW_TYPES } from "@/lib/workflow-types";

import { PedidoDescriptionPreview } from "./PedidoDescriptionPreview";
import { PedidoFilesPreview } from "./PedidoFilesPreview";
import { PedidoTasksPreview } from "./PedidoTasksPreview";

type PedidoWorkspaceMainProps = {
  pedido: InternalPedidoDetail;
  tasks: readonly PedidoTask[];
  taskProgress: PedidoTasksProgress;
  tasksLoadError?: string;
  tasksLoadRetryable?: boolean;
  files: readonly PedidoFileListItem[];
  filesLoadError?: string;
  filesLoadRetryable?: boolean;
};

export function PedidoWorkspaceMain({
  pedido,
  tasks,
  taskProgress,
  tasksLoadError,
  tasksLoadRetryable = false,
  files,
  filesLoadError,
  filesLoadRetryable = false,
}: PedidoWorkspaceMainProps) {
  const isPrintWorkflow =
    pedido.workflow_type === WORKFLOW_TYPES.IMPRESION;

  if (isPrintWorkflow) {
    return (
      <div className="grid min-w-0 gap-5 xl:h-full xl:min-h-0 xl:grid-cols-2 xl:grid-rows-[minmax(0,1fr)]">
        <PedidoDescriptionPreview
          title="Descripción y especificaciones"
          description={pedido.description}
        />

        <PedidoFilesPreview
          pedidoId={pedido.id}
          files={files}
          loadError={filesLoadError}
          loadErrorRetryable={filesLoadRetryable}
        />
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-5 xl:h-full xl:min-h-0 xl:grid-rows-[minmax(8rem,10rem)_minmax(0,1fr)]">
      <PedidoDescriptionPreview
        title="Trabajo solicitado"
        description={pedido.description}
      />

      <div className="grid min-w-0 gap-5 lg:grid-cols-2 xl:h-full xl:min-h-0 xl:grid-rows-[minmax(0,1fr)]">
        <PedidoTasksPreview
          tasks={tasks}
          progress={taskProgress}
          loadError={tasksLoadError}
          loadErrorRetryable={tasksLoadRetryable}
        />

        <PedidoFilesPreview
          pedidoId={pedido.id}
          files={files}
          loadError={filesLoadError}
          loadErrorRetryable={filesLoadRetryable}
        />
      </div>
    </div>
  );
}
