import { notFound } from "next/navigation";

import { InternalSolicitudDetail } from "@/components/solicitudes/InternalSolicitudDetail";
import { getInternalSolicitudById } from "@/lib/solicitudes";

type DashboardSolicitudDetallePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DashboardSolicitudDetallePage({
  params,
}: DashboardSolicitudDetallePageProps) {
  const { id } = await params;
  const result = await getInternalSolicitudById(id);

  if (!result.ok && ["invalid_id", "not_found"].includes(result.reason)) {
    notFound();
  }

  return (
    <div className="space-y-8">
      {!result.ok ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-950">
          {result.message}
        </section>
      ) : (
        <InternalSolicitudDetail solicitud={result.solicitud} />
      )}
    </div>
  );
}
