import { notFound } from "next/navigation";
import { InternalPedidoDetail } from "@/components/pedidos/InternalPedidoDetail";
import { PedidoCommentsSection } from "@/components/pedidos/PedidoCommentsSection";
import { PedidoHistorySection } from "@/components/pedidos/PedidoHistorySection";
import { PedidoTasksSection } from "@/components/pedidos/PedidoTasksSection";
import { PedidoWorkerAssignmentForm } from "@/components/pedidos/PedidoWorkerAssignmentForm";
import { PedidoFilesSection } from "@/components/storage/PedidoFilesSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentProfile } from "@/lib/auth/current-user";
import {
  hasPermission,
} from "@/lib/permissions/permissions";
import {
  EMPTY_PEDIDO_TASKS_PROGRESS,
  getInternalPedidoById,
  listAssignableWorkers,
  listPedidoComments,
  listPedidoHistory,
  listPedidoTasks,
} from "@/lib/pedidos";
import { listPedidoFiles } from "@/lib/storage";

type DashboardPedidoDetallePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DashboardPedidoDetallePage({
  params,
}: DashboardPedidoDetallePageProps) {
  const { id } = await params;
  const result = await getInternalPedidoById(id);

  if (!result.ok) {
    if (result.reason === "invalid_id" || result.reason === "not_found") {
      notFound();
    }

    return (
      <div className="space-y-8">
        <PageHeader
          title="Detalle de pedido"
          description="Consulta interna de la información registrada del pedido."
        />
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-950">
          {result.message}
        </section>
      </div>
    );
  }

  const profile = await getCurrentProfile();
  const canManagePedidos =
    profile !== null && hasPermission(profile.role, "pedidos.manage");
  const workersResult = canManagePedidos ? await listAssignableWorkers() : null;
  const tasksResult = await listPedidoTasks(result.pedido.id);
  const filesResult = await listPedidoFiles(result.pedido.id);
  const commentsResult = await listPedidoComments(result.pedido.id);
  const historyResult = await listPedidoHistory(result.pedido.id);
  return (
    <div className="space-y-8">
      <PageHeader
        title="Detalle de pedido"
        description="Consulta interna de la información registrada del pedido."
      />
      <InternalPedidoDetail
        pedido={result.pedido}
        taskProgress={tasksResult.ok ? tasksResult.progress : undefined}
        tasksLoadError={
          tasksResult.ok
            ? undefined
            : "No se pudieron cargar las tareas del pedido."
        }
        workerAssignmentSection={
          <PedidoWorkerAssignmentForm
            pedidoId={result.pedido.id}
            asignaciones={result.pedido.pedido_trabajadores}
            canManage={canManagePedidos}
            trabajadores={workersResult?.ok ? workersResult.workers : []}
            loadAssignableError={
              canManagePedidos && workersResult && !workersResult.ok
                ? workersResult.message
                : undefined
            }
          />
        }
        tasksSection={
          <PedidoTasksSection
            pedidoId={result.pedido.id}
            pedidoStatus={result.pedido.status}
            tasks={tasksResult.ok ? tasksResult.tasks : []}
            progress={
              tasksResult.ok
                ? tasksResult.progress
                : EMPTY_PEDIDO_TASKS_PROGRESS
            }
            loadError={
              tasksResult.ok
                ? undefined
                : "No se pudieron cargar las tareas del pedido."
            }
          />
        }
        commentsSection={
          <PedidoCommentsSection
            pedidoId={result.pedido.id}
            comments={commentsResult.ok ? commentsResult.comments : []}
            loadError={
              commentsResult.ok ? undefined : commentsResult.message
            }
          />
        }
        historySection={
          <PedidoHistorySection
            history={historyResult.ok ? historyResult.history : []}
            loadError={historyResult.ok ? undefined : historyResult.message}
          />
        }
        filesSection={
          <PedidoFilesSection
            pedidoId={result.pedido.id}
            pedidoStatus={result.pedido.status}
            files={filesResult.ok ? filesResult.files : []}
            canUpload={profile !== null}
            loadError={
              filesResult.ok
                ? undefined
                : "No se pudieron cargar los archivos del pedido."
            }
          />
        }
      />
    </div>
  );
}
