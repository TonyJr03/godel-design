import Link from "next/link";
import {
  SOLICITUD_STATUS_LABELS,
  type InternalSolicitud,
} from "@/lib/solicitudes";

type InternalSolicitudesListProps = {
  solicitudes: InternalSolicitud[];
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
                Creación
              </th>
              <th scope="col" className="px-4 py-3">
                Deseada
              </th>
              <th scope="col" className="px-4 py-3">
                Cant.
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Acción
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
                  {solicitud.client_name}
                </td>
                <td className="px-4 py-4 text-zinc-700">
                  <div>{solicitud.client_phone}</div>
                  {solicitud.client_email ? (
                    <div className="mt-1 text-xs text-zinc-500">
                      {solicitud.client_email}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-4 text-zinc-700">
                  {solicitud.service_type}
                </td>
                <td className="whitespace-nowrap px-4 py-4">
                  <span className="inline-flex rounded-md bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-700/15">
                    {SOLICITUD_STATUS_LABELS[solicitud.status]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-zinc-700">
                  {formatDate(solicitud.created_at)}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-zinc-700">
                  {formatDate(solicitud.desired_date)}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-zinc-700">
                  {solicitud.quantity ?? "No definida"}
                </td>
                <td className="px-4 py-4 text-right">
                  <Link
                    href={`/dashboard/solicitudes/${solicitud.id}`}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400"
                  >
                    Ver detalle
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
