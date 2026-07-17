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
  files: readonly PedidoFileListItem[];
  filesLoadError?: string;
};

export function PedidoWorkspaceMain({
  pedido,
  tasks,
  taskProgress,
  tasksLoadError,
  files,
  filesLoadError,
}: PedidoWorkspaceMainProps) {
  const isPrintWorkflow =
    pedido.workflow_type === WORKFLOW_TYPES.IMPRESION;

  if (isPrintWorkflow) {
    return (
      <div className="grid min-w-0 gap-5 xl:h-full xl:min-h-0 xl:grid-cols-2">
        <PedidoDescriptionPreview
          title="Descripción y especificaciones"
          description={pedido.description}
        />

        <PedidoFilesPreview
          pedidoId={pedido.id}
          files={files}
          loadError={filesLoadError}
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

      <div className="grid min-w-0 gap-5 lg:grid-cols-2 xl:h-full xl:min-h-0">
        <PedidoTasksPreview
          tasks={tasks}
          progress={taskProgress}
          loadError={tasksLoadError}
        />

        <PedidoFilesPreview
          pedidoId={pedido.id}
          files={files}
          loadError={filesLoadError}
        />
      </div>
    </div>
  );
}
