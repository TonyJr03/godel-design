import { notFound } from "next/navigation";

import { SolicitudClienteForm } from "@/components/solicitudes/SolicitudClienteForm";
import { SolicitudConvertPedidoForm } from "@/components/solicitudes/SolicitudConvertPedidoForm";
import { InternalSolicitudDetail } from "@/components/solicitudes/InternalSolicitudDetail";
import { Alert, ReadErrorAlert } from "@/components/ui";
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
  const clienteDetailLoadError =
    clienteAsociadoResult && !clienteAsociadoResult.ok
      ? clienteAsociadoResult.message
      : undefined;
  const clienteDetailLoadRetryable =
    clienteAsociadoResult !== null &&
    !clienteAsociadoResult.ok &&
    clienteAsociadoResult.reason === "error";
  const clientesListLoadError = clientesResult.ok
    ? undefined
    : clientesResult.message;
  const clientesListLoadRetryable =
    !clientesResult.ok && clientesResult.reason === "error";
  const files = filesResult.ok ? filesResult.files : [];
  const comments = commentsResult.ok ? commentsResult.comments : [];
  const history = historyResult.ok ? historyResult.history : [];
  const filesLoadRetryable = !filesResult.ok && filesResult.reason === "error";
  const commentsLoadRetryable =
    !commentsResult.ok && commentsResult.reason === "error";
  const historyLoadRetryable =
    !historyResult.ok && historyResult.reason === "error";
  const filesLoadError = filesResult.ok
    ? undefined
    : "No se pudieron cargar los archivos de la solicitud.";
  const commentsLoadError = commentsResult.ok
    ? undefined
    : commentsResult.message;
  const historyLoadError = historyResult.ok ? undefined : historyResult.message;
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
    <InternalSolicitudDetail
      solicitud={result.solicitud}
      updateStatusAction={updateStatusAction}
      createCommentAction={createCommentAction}
      clientePanelContent={
        clienteDetailLoadError ? (
          <ReadErrorAlert
            variant="warning"
            title="No se pudo cargar el cliente asociado"
            retryable={clienteDetailLoadRetryable}
          >
            <p>{clienteDetailLoadError}</p>
          </ReadErrorAlert>
        ) : (
          <SolicitudClienteForm
            associateClienteAction={associateClienteAction}
            createClienteAction={createClienteAction}
            clienteAsociado={clienteAsociado}
            clientesDisponibles={clientesResult.ok ? clientesResult.clientes : []}
            clientesLoadError={clientesListLoadError}
            clientesLoadRetryable={clientesListLoadRetryable}
            presentation="panel"
          />
        )
      }
      conversionPanelContent={
        <SolicitudConvertPedidoForm
          convertAction={convertAction}
          status={result.solicitud.status}
          clienteId={result.solicitud.cliente_id}
          convertedOrderId={result.solicitud.converted_order_id}
          workflowType={result.solicitud.workflow_type}
          serviceType={result.solicitud.service_type}
          solicitudDescription={result.solicitud.description}
          solicitudDesiredDate={result.solicitud.desired_date}
          presentation="panel"
        />
      }
      files={files}
      filesLoadError={filesLoadError}
      filesLoadRetryable={filesLoadRetryable}
      comments={comments}
      commentsLoadError={commentsLoadError}
      commentsLoadRetryable={commentsLoadRetryable}
      history={history}
      historyLoadError={historyLoadError}
      historyLoadRetryable={historyLoadRetryable}
      clienteDetailLoadError={clienteDetailLoadError}
      clientesListLoadError={clientesListLoadError}
    />
  );
}
