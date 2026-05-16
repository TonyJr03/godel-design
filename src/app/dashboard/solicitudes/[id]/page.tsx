import { notFound } from "next/navigation";

import { SolicitudClienteForm } from "@/components/solicitudes/SolicitudClienteForm";
import { InternalSolicitudDetail } from "@/components/solicitudes/InternalSolicitudDetail";
import { getInternalClienteById, listInternalClientes } from "@/lib/clientes";
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

  if (!result.ok) {
    return (
      <div className="space-y-8">
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-950">
          {result.message}
        </section>
      </div>
    );
  }

  const [clientesResult, clienteAsociadoResult] = await Promise.all([
    listInternalClientes({ limit: 50 }),
    result.solicitud.cliente_id
      ? getInternalClienteById(result.solicitud.cliente_id)
      : Promise.resolve(null),
  ]);
  const clienteAsociado =
    clienteAsociadoResult && clienteAsociadoResult.ok
      ? clienteAsociadoResult.cliente
      : null;

  return (
    <div className="space-y-8">
      <InternalSolicitudDetail
        solicitud={result.solicitud}
        clienteSection={
          <SolicitudClienteForm
            solicitudId={result.solicitud.id}
            clienteAsociado={clienteAsociado}
            clientesDisponibles={
              clientesResult.ok ? clientesResult.clientes : []
            }
            clientesLoadError={clientesResult.ok ? null : clientesResult.message}
          />
        }
      />
    </div>
  );
}
