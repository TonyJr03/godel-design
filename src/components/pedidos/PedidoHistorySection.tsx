import {
  PEDIDO_HISTORY_ACTION_LABELS,
  PEDIDO_STATUS_LABELS,
  type PedidoHistoryItem,
} from "@/lib/pedidos";
import { ROLE_SHORT_LABELS } from "@/lib/permissions";
import { formatAppDateTime } from "@/lib/utils";

type PedidoHistorySectionProps = {
  history: PedidoHistoryItem[];
  loadError?: string;
};

function formatHistoryValue(value: string | null): string {
  if (!value) {
    return "sin dato";
  }

  return PEDIDO_STATUS_LABELS[value as keyof typeof PEDIDO_STATUS_LABELS] ?? value;
}

function getHistoryMetadataString(
  metadata: PedidoHistoryItem["metadata"],
  key: string,
): string | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function getHistoryTaskTitle(
  item: PedidoHistoryItem,
  fallback: string | null,
): string | null {
  return getHistoryMetadataString(item.metadata, "title") ?? fallback;
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

  if (item.action === "tarea_creada") {
    const taskTitle = getHistoryTaskTitle(item, item.new_value);

    return taskTitle ? `Tarea creada: ${taskTitle}.` : "Tarea creada.";
  }

  if (item.action === "tarea_actualizada") {
    const taskTitle = getHistoryTaskTitle(item, item.new_value);

    return taskTitle
      ? `Tarea actualizada: ${taskTitle}.`
      : item.summary || "Tarea actualizada.";
  }

  if (item.action === "tarea_eliminada") {
    const taskTitle = getHistoryTaskTitle(item, item.old_value);

    return taskTitle
      ? `Tarea eliminada: ${taskTitle}.`
      : "Tarea eliminada.";
  }

  if (item.action === "tarea_completada") {
    const taskTitle = getHistoryTaskTitle(item, item.new_value);

    return taskTitle
      ? `Tarea completada: ${taskTitle}.`
      : "Tarea completada.";
  }

  if (item.action === "tarea_reabierta") {
    const taskTitle = getHistoryTaskTitle(item, item.new_value);

    return taskTitle
      ? `Tarea reabierta: ${taskTitle}.`
      : "Tarea reabierta.";
  }

  if (item.action === "tarea_progreso_actualizado") {
    const taskTitle = getHistoryMetadataString(item.metadata, "title");

    return taskTitle
      ? `Progreso de tarea ${taskTitle} actualizado de ${formatHistoryValue(item.old_value)} a ${formatHistoryValue(item.new_value)}.`
      : `Progreso de tarea actualizado de ${formatHistoryValue(item.old_value)} a ${formatHistoryValue(item.new_value)}.`;
  }

  return item.summary || "Evento registrado en el pedido.";
}

function getActorName(item: PedidoHistoryItem): string {
  return item.actor?.full_name?.trim() || "Evento automático";
}

function getActorRole(item: PedidoHistoryItem): string | null {
  return item.actor?.role ? ROLE_SHORT_LABELS[item.actor.role] : null;
}

export function PedidoHistorySection({
  history,
  loadError,
}: PedidoHistorySectionProps) {
  return (
    <section className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          Historial del pedido
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Este historial registra eventos relevantes del pedido.
        </p>
      </div>

      {loadError ? (
        <p className="mt-5 rounded-(--radius-control) border border-danger/30 bg-danger-soft px-4 py-3 text-sm leading-6 text-danger">
          {loadError}
        </p>
      ) : null}

      {history.length > 0 ? (
        <ol className="relative mt-5 space-y-5 border-l border-border pl-5">
          {history.map((item) => {
            const actorRole = getActorRole(item);

            return (
              <li
                key={item.id}
                className="relative rounded-(--radius-control) border border-border bg-surface-muted px-4 py-3 before:absolute before:left-[-1.72rem] before:top-4 before:size-3 before:rounded-full before:border-2 before:border-surface before:bg-brand-primary"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <span className="inline-flex rounded-(--radius-control) border border-border bg-surface px-2 py-1 text-xs font-semibold text-text-secondary">
                      {PEDIDO_HISTORY_ACTION_LABELS[item.action]}
                    </span>
                    <p className="mt-3 text-sm leading-6 text-text-primary">
                      {getHistorySummary(item)}
                    </p>
                  </div>
                  <time
                    dateTime={item.created_at}
                    className="text-xs leading-5 text-text-muted"
                  >
                    {formatAppDateTime(item.created_at)}
                  </time>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  <span>{getActorName(item)}</span>
                  {actorRole ? (
                    <span className="inline-flex rounded-(--radius-control) border border-border bg-surface px-2 py-1 font-semibold text-text-secondary">
                      {actorRole}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : !loadError ? (
        <p className="mt-5 rounded-(--radius-control) border border-dashed border-border-strong bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
          Todavía no hay eventos registrados en este pedido.
        </p>
      ) : null}
    </section>
  );
}
