import type { SolicitudHistoryItem } from "@/lib/solicitudes";
import type { Enums } from "@/types/database";

type SolicitudHistorySectionProps = {
  history: SolicitudHistoryItem[];
  loadError?: string;
};

const HISTORY_ACTION_LABELS: Record<
  Enums<"solicitud_historial_action">,
  string
> = {
  solicitud_creada: "Solicitud creada",
  archivos_adjuntados: "Archivos adjuntados",
  estado_cambiado: "Estado cambiado",
  cliente_asociado: "Cliente asociado",
  cliente_creado_desde_solicitud: "Cliente creado desde solicitud",
  convertida_a_pedido: "Convertida a pedido",
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

function getActorName(item: SolicitudHistoryItem): string {
  return item.actor?.full_name?.trim() || "Evento automático";
}

function getActorRole(item: SolicitudHistoryItem): string | null {
  return item.actor?.role ? ROLE_LABELS[item.actor.role] : null;
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
                      {HISTORY_ACTION_LABELS[item.action]}
                    </span>
                    <p className="mt-3 text-sm leading-6 text-zinc-800">
                      {item.resumen}
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
          Todavía no hay eventos registrados en esta solicitud.
        </p>
      ) : null}
    </section>
  );
}
