import { notFound } from "next/navigation";

import { SolicitudClienteForm } from "@/components/solicitudes/SolicitudClienteForm";
import { SolicitudCommentsSection } from "@/components/solicitudes/SolicitudCommentsSection";
import { SolicitudConvertPedidoForm } from "@/components/solicitudes/SolicitudConvertPedidoForm";
import { InternalSolicitudDetail } from "@/components/solicitudes/InternalSolicitudDetail";
import { SolicitudFilesSection } from "@/components/storage/SolicitudFilesSection";
import { getInternalClienteById, listInternalClientes } from "@/lib/clientes";
import {
  getInternalSolicitudById,
  listSolicitudComments,
} from "@/lib/solicitudes";
import { listSolicitudFiles } from "@/lib/storage";

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
  const filesResult = await listSolicitudFiles(result.solicitud.id);
  const commentsResult = await listSolicitudComments(result.solicitud.id);
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
        conversionSection={
          <SolicitudConvertPedidoForm
            solicitudId={result.solicitud.id}
            estado={result.solicitud.estado}
            clienteId={result.solicitud.cliente_id}
            convertedOrderId={result.solicitud.converted_order_id}
          />
        }
        filesSection={
          <SolicitudFilesSection
            solicitudId={result.solicitud.id}
            files={filesResult.ok ? filesResult.files : []}
            loadError={
              filesResult.ok
                ? undefined
                : "No se pudieron cargar los archivos de la solicitud."
            }
          />
        }
        commentsSection={
          <SolicitudCommentsSection
            solicitudId={result.solicitud.id}
            comments={commentsResult.ok ? commentsResult.comments : []}
            loadError={commentsResult.ok ? undefined : commentsResult.message}
          />
        }
      />
    </div>
  );
}
