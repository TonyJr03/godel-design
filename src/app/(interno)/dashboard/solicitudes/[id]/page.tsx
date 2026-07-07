import { notFound } from "next/navigation";

import { SolicitudClienteForm } from "@/components/solicitudes/SolicitudClienteForm";
import { SolicitudCommentsSection } from "@/components/solicitudes/SolicitudCommentsSection";
import { SolicitudConvertPedidoForm } from "@/components/solicitudes/SolicitudConvertPedidoForm";
import { SolicitudHistorySection } from "@/components/solicitudes/SolicitudHistorySection";
import { InternalSolicitudDetail } from "@/components/solicitudes/InternalSolicitudDetail";
import { SolicitudFilesSection } from "@/components/storage/SolicitudFilesSection";
import { Alert } from "@/components/ui";
import { getInternalClienteById, listInternalClientes } from "@/lib/clientes";
import {
  getInternalSolicitudById,
  listSolicitudComments,
  listSolicitudHistory,
} from "@/lib/solicitudes";
import { listSolicitudFiles } from "@/lib/storage";
import {
  associateSolicitudClienteAction,
  convertSolicitudToPedidoAction,
  createClienteFromSolicitudAction,
  createSolicitudCommentAction,
  updateSolicitudStatusAction,
} from "./actions";

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
        <Alert variant="danger">{result.message}</Alert>
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
  const historyResult = await listSolicitudHistory(result.solicitud.id);
  const clienteAsociado =
    clienteAsociadoResult && clienteAsociadoResult.ok
      ? clienteAsociadoResult.cliente
      : null;
  const solicitudId = result.solicitud.id;
  const associateClienteAction = associateSolicitudClienteAction.bind(
    null,
    solicitudId,
  );
  const createClienteAction = createClienteFromSolicitudAction.bind(
    null,
    solicitudId,
  );
  const convertAction = convertSolicitudToPedidoAction.bind(null, solicitudId);
  const createCommentAction = createSolicitudCommentAction.bind(
    null,
    solicitudId,
  );
  const updateStatusAction = updateSolicitudStatusAction.bind(
    null,
    solicitudId,
  );

  return (
    <div className="space-y-8">
      <InternalSolicitudDetail
        solicitud={result.solicitud}
        updateStatusAction={updateStatusAction}
        clienteSection={
          <SolicitudClienteForm
            associateClienteAction={associateClienteAction}
            createClienteAction={createClienteAction}
            clienteAsociado={clienteAsociado}
            clientesDisponibles={
              clientesResult.ok ? clientesResult.clientes : []
            }
            clientesLoadError={clientesResult.ok ? null : clientesResult.message}
          />
        }
        conversionSection={
          <SolicitudConvertPedidoForm
            convertAction={convertAction}
            status={result.solicitud.status}
            clienteId={result.solicitud.cliente_id}
            convertedOrderId={result.solicitud.converted_order_id}
            workflowType={result.solicitud.workflow_type}
            serviceType={result.solicitud.service_type}
            solicitudDescription={result.solicitud.description}
            solicitudDesiredDate={result.solicitud.desired_date}
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
            createCommentAction={createCommentAction}
            comments={commentsResult.ok ? commentsResult.comments : []}
            loadError={commentsResult.ok ? undefined : commentsResult.message}
          />
        }
        historySection={
          <SolicitudHistorySection
            history={historyResult.ok ? historyResult.history : []}
            loadError={historyResult.ok ? undefined : historyResult.message}
          />
        }
      />
    </div>
  );
}
