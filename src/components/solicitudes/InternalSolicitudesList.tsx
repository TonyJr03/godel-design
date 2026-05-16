import type { InternalSolicitud } from "@/lib/solicitudes";

type InternalSolicitudesListProps = {
  solicitudes: InternalSolicitud[];
};

const ESTADO_LABELS: Record<InternalSolicitud["estado"], string> = {
  nueva: "Nueva",
  en_revision: "En revision",
  contactada: "Contactada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  convertida: "Convertida",
};

const DATE_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatShortReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function formatDate(value: string | null): string {
  if (!value) {
    return "No definida";
  }

  return DATE_FORMATTER.format(new Date(value));
}

export function InternalSolicitudesList({
  solicitudes,
}: InternalSolicitudesListProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-100 text-left text-xs font-semibold uppercase text-zinc-600">
            <tr>
              <th scope="col" className="px-4 py-3">
                Ref.
              </th>
              <th scope="col" className="px-4 py-3">
                Cliente
              </th>
              <th scope="col" className="px-4 py-3">
                Contacto
              </th>
              <th scope="col" className="px-4 py-3">
                Servicio
              </th>
              <th scope="col" className="px-4 py-3">
                Estado
              </th>
              <th scope="col" className="px-4 py-3">
                Creacion
              </th>
              <th scope="col" className="px-4 py-3">
                Deseada
              </th>
              <th scope="col" className="px-4 py-3">
                Cant.
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Accion
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white">
            {solicitudes.map((solicitud) => (
              <tr key={solicitud.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-4 font-mono text-xs font-semibold text-zinc-700">
                  {formatShortReference(solicitud.id)}
                </td>
                <td className="px-4 py-4 font-medium text-zinc-950">
                  {solicitud.cliente_nombre}
                </td>
                <td className="px-4 py-4 text-zinc-700">
                  <div>{solicitud.cliente_telefono}</div>
                  {solicitud.cliente_email ? (
                    <div className="mt-1 text-xs text-zinc-500">
                      {solicitud.cliente_email}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-4 text-zinc-700">
                  {solicitud.tipo_servicio}
                </td>
                <td className="whitespace-nowrap px-4 py-4">
                  <span className="inline-flex rounded-md bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-700/15">
                    {ESTADO_LABELS[solicitud.estado]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-zinc-700">
                  {formatDate(solicitud.created_at)}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-zinc-700">
                  {formatDate(solicitud.fecha_deseada)}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-zinc-700">
                  {solicitud.cantidad ?? "No definida"}
                </td>
                <td className="px-4 py-4 text-right">
                  <button
                    type="button"
                    disabled
                    className="inline-flex h-9 cursor-not-allowed items-center justify-center rounded-md border border-zinc-200 px-3 text-xs font-semibold text-zinc-400"
                  >
                    Ver detalle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
