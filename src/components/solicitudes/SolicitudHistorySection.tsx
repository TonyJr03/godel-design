import { ROLE_SHORT_LABELS } from "@/lib/permissions";
import {
  SOLICITUD_HISTORY_ACTION_LABELS,
  SOLICITUD_STATUS_LABELS,
  type SolicitudHistoryItem,
} from "@/lib/solicitudes";
import { formatAppDateTime } from "@/lib/utils";

type SolicitudHistorySectionProps = {
  history: SolicitudHistoryItem[];
  loadError?: string;
};

function getActorName(item: SolicitudHistoryItem): string {
  return item.actor?.full_name?.trim() || "Evento automático";
}

function getActorRole(item: SolicitudHistoryItem): string | null {
  return item.actor?.role ? ROLE_SHORT_LABELS[item.actor.role] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getMetadataString(
  item: SolicitudHistoryItem,
  key: string,
): string | null {
  if (!isRecord(item.metadata)) {
    return null;
  }

  const value = item.metadata[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function getMetadataNumber(
  item: SolicitudHistoryItem,
  key: string,
): number | null {
  if (!isRecord(item.metadata)) {
    return null;
  }

  const value = item.metadata[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatEstado(value: string | null): string {
  if (!value) {
    return "sin dato";
  }

  return SOLICITUD_STATUS_LABELS[value as keyof typeof SOLICITUD_STATUS_LABELS] ?? value;
}

function formatFileSize(value: number | null): string | null {
  if (!value || value <= 0) {
    return null;
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatShortId(value: string | null): string | null {
  return value ? value.slice(0, 8).toUpperCase() : null;
}

function getClienteName(item: SolicitudHistoryItem): string | null {
  return (
    item.related.cliente?.name ??
    getMetadataString(item, "client_name") ??
    formatShortId(getMetadataString(item, "cliente_id"))
  );
}

function getPedidoLabel(item: SolicitudHistoryItem): string | null {
  const pedido = item.related.pedido;

  if (pedido) {
    return `${pedido.order_number} - ${pedido.title}`;
  }

  const numeroPedido = getMetadataString(item, "order_number");
  const title = getMetadataString(item, "title");

  if (numeroPedido && title) {
    return `${numeroPedido} - ${title}`;
  }

  return numeroPedido ?? formatShortId(getMetadataString(item, "pedido_id"));
}

function getHistorySummary(item: SolicitudHistoryItem): string {
  if (item.action === "solicitud_creada") {
    const tipoServicio = getMetadataString(item, "service_type");
    const quantity = getMetadataNumber(item, "quantity");

    if (tipoServicio && quantity) {
      return `Solicitud registrada: ${tipoServicio} (${quantity} unidades).`;
    }

    if (tipoServicio) {
      return `Solicitud registrada: ${tipoServicio}.`;
    }
  }

  if (item.action === "archivos_adjuntados") {
    const fileName = getMetadataString(item, "file_name");
    const fileSize = formatFileSize(getMetadataNumber(item, "file_size"));

    if (fileName && fileSize) {
      return `Archivo adjuntado a la solicitud: ${fileName} (${fileSize}).`;
    }

    if (fileName) {
      return `Archivo adjuntado a la solicitud: ${fileName}.`;
    }
  }

  if (item.action === "estado_cambiado") {
    return `Estado cambiado de ${formatEstado(
      item.old_value,
    )} a ${formatEstado(item.new_value)}.`;
  }

  if (item.action === "cliente_asociado") {
    const clienteName = getClienteName(item);

    if (clienteName) {
      return `Cliente asociado a la solicitud: ${clienteName}.`;
    }
  }

  if (item.action === "cliente_creado_desde_solicitud") {
    const clienteName = getClienteName(item);

    if (clienteName) {
      return `Cliente creado desde la solicitud: ${clienteName}.`;
    }
  }

  if (item.action === "convertida_a_pedido") {
    const pedidoLabel = getPedidoLabel(item);

    if (pedidoLabel) {
      return `Solicitud convertida a pedido: ${pedidoLabel}.`;
    }
  }

  return item.summary;
}

export function SolicitudHistorySection({
  history,
  loadError,
}: SolicitudHistorySectionProps) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-zinc-950">
          Historial de la solicitud
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Este historial registra eventos relevantes de la solicitud.
        </p>
      </div>

      {loadError ? (
        <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900">
          {loadError}
        </p>
      ) : null}

      {history.length > 0 ? (
        <ol className="mt-5 space-y-4">
          {history.map((item) => {
            const actorRole = getActorRole(item);

            return (
              <li
                key={item.id}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <span className="inline-flex rounded-md bg-white px-2 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200">
                      {SOLICITUD_HISTORY_ACTION_LABELS[item.action]}
                    </span>
                    <p className="mt-3 text-sm leading-6 text-zinc-800">
                      {getHistorySummary(item)}
                    </p>
                  </div>
                  <time
                    dateTime={item.created_at}
                    className="text-xs leading-5 text-zinc-500"
                  >
                    {formatAppDateTime(item.created_at)}
                  </time>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span>{getActorName(item)}</span>
                  {actorRole ? (
                    <span className="inline-flex rounded-md bg-white px-2 py-1 font-semibold text-zinc-600 ring-1 ring-inset ring-zinc-200">
                      {actorRole}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : !loadError ? (
        <p className="mt-5 rounded-md border border-dashed border-zinc-300 px-4 py-3 text-sm leading-6 text-zinc-600">
          Todavía no hay eventos registrados en esta solicitud.
        </p>
      ) : null}
    </section>
  );
}
