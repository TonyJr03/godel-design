import { DetailPanel } from "@/components/ui";
import type {
  InternalPedidoDetail,
  PedidoTask,
  PedidoTasksProgress,
} from "@/lib/pedidos";
import type { PedidoFileListItem } from "@/lib/storage";
import { WORKFLOW_TYPES } from "@/lib/workflow-types";

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
  const description = pedido.description.trim()
    ? pedido.description
    : "Sin descripción registrada.";

  return (
    <div className="min-w-0 space-y-6">
      <DetailPanel
        title={
          isPrintWorkflow
            ? "Descripción y especificaciones"
            : "Trabajo solicitado"
        }
        description={
          isPrintWorkflow
            ? "Información registrada para preparar este pedido de impresión."
            : "Descripción operativa del encargo."
        }
      >
        <p className="whitespace-pre-wrap text-sm leading-7 text-text-secondary">
          {description}
        </p>
      </DetailPanel>

      {isPrintWorkflow ? (
        <section className="rounded-(--radius-card) border border-brand-accent/30 bg-brand-accent-soft p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-text-primary">
            Flujo directo de impresión
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Este tipo de pedido no requiere tareas para avanzar. La operación se
            concentra en las especificaciones, los archivos y la entrega.
          </p>
        </section>
      ) : (
        <PedidoTasksPreview
          tasks={tasks}
          progress={taskProgress}
          loadError={tasksLoadError}
        />
      )}

      <PedidoFilesPreview
        pedidoId={pedido.id}
        files={files}
        loadError={filesLoadError}
      />
    </div>
  );
}
