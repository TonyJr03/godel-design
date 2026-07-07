import { notFound } from "next/navigation";

import { InternalClienteDetail } from "@/components/clientes/InternalClienteDetail";
import { Alert, PageHeader } from "@/components/ui";
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
        <Alert variant="danger">{result.message}</Alert>
      </div>
    );
  }

  return <InternalClienteDetail cliente={result.cliente} />;
}
