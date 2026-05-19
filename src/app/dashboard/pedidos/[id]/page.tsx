import { notFound } from "next/navigation";
import { InternalPedidoDetail } from "@/components/pedidos/InternalPedidoDetail";
import { PedidoWorkerAssignmentForm } from "@/components/pedidos/PedidoWorkerAssignmentForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { getInternalPedidoById, listAssignableWorkers } from "@/lib/pedidos";

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

  return (
    <div className="space-y-8">
      <PageHeader
        title="Detalle de pedido"
        description="Consulta interna de la información registrada del pedido."
      />
      <InternalPedidoDetail
        pedido={result.pedido}
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
      />
    </div>
  );
}
