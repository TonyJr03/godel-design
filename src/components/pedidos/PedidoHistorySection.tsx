import type { PedidoHistoryItem } from "@/lib/pedidos";
import type { Enums } from "@/types/database";

type PedidoHistorySectionProps = {
  history: PedidoHistoryItem[];
  loadError?: string;
};

const HISTORY_ACTION_LABELS: Record<
  Enums<"pedido_historial_action">,
  string
> = {
  pedido_creado: "Pedido creado",
  estado_cambiado: "Estado cambiado",
  trabajador_asignado: "Personal asignado",
  trabajador_removido: "Personal removido",
  archivo_subido: "Archivo subido",
  nota_agregada: "Nota agregada",
  fecha_entrega_actualizada: "Fecha de entrega actualizada",
  pedido_entregado: "Pedido entregado",
  pedido_cancelado: "Pedido cancelado",
};

const PEDIDO_ESTADO_LABELS: Record<string, string> = {
  solicitud_recibida: "Solicitud recibida",
  en_revision: "En revisión",
  cotizado: "Cotizado",
  aprobado_cliente: "Aprobado por cliente",
  en_diseno: "En diseño",
  en_produccion: "En producción",
  listo_entrega: "Listo para entrega",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

const ROLE_LABELS: Record<Enums<"app_role">, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  trabajador: "Trabajador",
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function formatDateTime(value: string): string {
  return DATE_TIME_FORMATTER.format(new Date(value));
}

function formatHistoryValue(value: string | null): string {
  if (!value) {
    return "sin dato";
  }

  return PEDIDO_ESTADO_LABELS[value] ?? value;
}

function getHistorySummary(item: PedidoHistoryItem): string {
  if (
    item.action === "estado_cambiado" ||
    item.action === "pedido_entregado" ||
    item.action === "pedido_cancelado"
  ) {
    return `Estado cambiado de ${formatHistoryValue(item.old_value)} a ${formatHistoryValue(item.new_value)}.`;
  }

  if (item.action === "pedido_creado") {
    return `Pedido creado en el sistema: ${formatHistoryValue(item.new_value)}.`;
  }

  if (item.action === "trabajador_asignado") {
    return `Personal asignado al pedido: ${formatHistoryValue(item.new_value)}.`;
  }

  if (item.action === "trabajador_removido") {
    return `Personal removido del pedido: ${formatHistoryValue(item.old_value)}.`;
  }

  if (item.action === "archivo_subido") {
    return `Archivo agregado al pedido: ${formatHistoryValue(item.new_value)}.`;
  }

  if (item.action === "nota_agregada") {
    return "Nota interna agregada al pedido.";
  }

  if (item.action === "fecha_entrega_actualizada") {
    return `Fecha de entrega actualizada de ${formatHistoryValue(item.old_value)} a ${formatHistoryValue(item.new_value)}.`;
  }

  return "Evento registrado en el pedido.";
}

function getActorName(item: PedidoHistoryItem): string {
  return item.actor?.full_name?.trim() || "Evento automático";
}

function getActorRole(item: PedidoHistoryItem): string | null {
  return item.actor?.role ? ROLE_LABELS[item.actor.role] : null;
}

export function PedidoHistorySection({
  history,
  loadError,
}: PedidoHistorySectionProps) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold text-zinc-950">
          Historial del pedido
        </h3>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Este historial registra eventos relevantes del pedido.
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
                      {HISTORY_ACTION_LABELS[item.action]}
                    </span>
                    <p className="mt-3 text-sm leading-6 text-zinc-800">
                      {getHistorySummary(item)}
                    </p>
                  </div>
                  <time
                    dateTime={item.created_at}
                    className="text-xs leading-5 text-zinc-500"
                  >
                    {formatDateTime(item.created_at)}
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
          Todavía no hay eventos registrados en este pedido.
        </p>
      ) : null}
    </section>
  );
}
