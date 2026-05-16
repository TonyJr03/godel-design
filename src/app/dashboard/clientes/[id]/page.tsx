import { notFound } from "next/navigation";
import { InternalClienteDetail } from "@/components/clientes/InternalClienteDetail";
import { PageHeader } from "@/components/ui/PageHeader";
import { getInternalClienteById } from "@/lib/clientes";

type DashboardClienteDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DashboardClienteDetailPage({
  params,
}: DashboardClienteDetailPageProps) {
  const { id } = await params;
  const result = await getInternalClienteById(id);

  if (!result.ok) {
    if (result.reason === "invalid_id" || result.reason === "not_found") {
      notFound();
    }

    return (
      <div className="space-y-8">
        <PageHeader
          title="Detalle de cliente"
          description="Consulta interna de la información registrada del cliente."
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
        title="Detalle de cliente"
        description="Consulta interna de la información registrada del cliente."
      />
      <InternalClienteDetail cliente={result.cliente} />
    </div>
  );
}
