import Link from "next/link";
import type { InternalCliente } from "@/lib/clientes";

type InternalClientesListProps = {
  clientes: InternalCliente[];
};

const DATE_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string | null): string {
  if (!value) {
    return "No definida";
  }

  return DATE_FORMATTER.format(new Date(value));
}

export function InternalClientesList({ clientes }: InternalClientesListProps) {
  if (clientes.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">
          No hay clientes para mostrar
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Cuando existan clientes registrados, aparecerán aquí para consulta
          interna.
        </p>
      </section>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-100 text-left text-xs font-semibold uppercase text-zinc-600">
            <tr>
              <th scope="col" className="px-4 py-3">
                Cliente
              </th>
              <th scope="col" className="px-4 py-3">
                Teléfono
              </th>
              <th scope="col" className="px-4 py-3">
                Correo electrónico
              </th>
              <th scope="col" className="px-4 py-3">
                Creación
              </th>
              <th scope="col" className="px-4 py-3">
                Actualización
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Acción
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white">
            {clientes.map((cliente) => (
              <tr key={cliente.id} className="align-top">
                <td className="px-4 py-4 font-medium text-zinc-950">
                  {cliente.nombre}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-zinc-700">
                  {cliente.telefono}
                </td>
                <td className="px-4 py-4 text-zinc-700">
                  {cliente.email ?? "No definido"}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-zinc-700">
                  {formatDate(cliente.created_at)}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-zinc-700">
                  {formatDate(cliente.updated_at)}
                </td>
                <td className="px-4 py-4 text-right">
                  <Link
                    href={`/dashboard/clientes/${cliente.id}`}
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
