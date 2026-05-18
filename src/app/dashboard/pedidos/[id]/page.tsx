import { notFound } from "next/navigation";
import { InternalPedidoDetail } from "@/components/pedidos/InternalPedidoDetail";
import { PageHeader } from "@/components/ui/PageHeader";
import { getInternalPedidoById } from "@/lib/pedidos";

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

  return (
    <div className="space-y-8">
      <PageHeader
        title="Detalle de pedido"
        description="Consulta interna de la información registrada del pedido."
      />
      <InternalPedidoDetail pedido={result.pedido} />
    </div>
  );
}
