import Link from "next/link";
import type { InternalPedido, InternalPedidoEstado } from "@/lib/pedidos";

type InternalPedidosListProps = {
  pedidos: InternalPedido[];
};

const ESTADO_LABELS: Record<InternalPedidoEstado, string> = {
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

function getTrabajadoresLabel(pedido: InternalPedido): string {
  if (pedido.pedido_trabajadores.length === 0) {
    return "Sin asignar";
  }

  const trabajadores = pedido.pedido_trabajadores.map((asignacion) =>
    asignacion.profiles?.full_name?.trim()
      ? asignacion.profiles.full_name
      : "Usuario asignado",
  );

  return trabajadores.join(", ");
}

function getClienteLabel(pedido: InternalPedido): string {
  if (pedido.clientes?.nombre) {
    return pedido.clientes.nombre;
  }

  return pedido.cliente_id ? "Cliente asociado" : "Sin cliente";
}

export function InternalPedidosList({ pedidos }: InternalPedidosListProps) {
  if (pedidos.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">
          No hay pedidos para mostrar
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Cuando existan pedidos internos, aparecerán aquí ordenados por fecha
          de creación.
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
                Pedido
              </th>
              <th scope="col" className="px-4 py-3">
                Cliente
              </th>
              <th scope="col" className="px-4 py-3">
                Solicitud
              </th>
              <th scope="col" className="px-4 py-3">
                Trabajo
              </th>
              <th scope="col" className="px-4 py-3">
                Estado
              </th>
              <th scope="col" className="px-4 py-3">
                Personal
              </th>
              <th scope="col" className="px-4 py-3">
                Creación
              </th>
              <th scope="col" className="px-4 py-3">
                Entrega estimada
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Acción
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white">
            {pedidos.map((pedido) => (
              <tr key={pedido.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-4">
                  <div className="font-semibold text-zinc-950">
                    {pedido.numero_pedido}
                  </div>
                  <div className="mt-1 font-mono text-xs text-zinc-500">
                    {formatShortReference(pedido.id)}
                  </div>
                </td>
                <td className="px-4 py-4 text-zinc-700">
                  {getClienteLabel(pedido)}
                </td>
                <td className="px-4 py-4 text-zinc-700">
                  {pedido.solicitudes ? (
                    <div>
                      <div>{pedido.solicitudes.tipo_servicio}</div>
                      <div className="mt-1 font-mono text-xs text-zinc-500">
                        {formatShortReference(pedido.solicitudes.id)}
                      </div>
                    </div>
                  ) : pedido.solicitud_id ? (
                    <div>
                      <div>Solicitud asociada</div>
                      <div className="mt-1 font-mono text-xs text-zinc-500">
                        {formatShortReference(pedido.solicitud_id)}
                      </div>
                    </div>
                  ) : (
                    "Manual"
                  )}
                </td>
                <td className="min-w-64 px-4 py-4 text-zinc-700">
                  <div className="font-medium text-zinc-950">
                    {pedido.titulo}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">
                    {pedido.descripcion}
                  </p>
                </td>
                <td className="whitespace-nowrap px-4 py-4">
                  <span className="inline-flex rounded-md bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-700/15">
                    {ESTADO_LABELS[pedido.estado]}
                  </span>
                </td>
                <td className="px-4 py-4 text-zinc-700">
                  {getTrabajadoresLabel(pedido)}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-zinc-700">
                  {formatDate(pedido.fecha_creacion)}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-zinc-700">
                  {formatDate(pedido.fecha_entrega_estimada)}
                </td>
                <td className="px-4 py-4 text-right">
                  <Link
                    href={`/dashboard/pedidos/${pedido.id}`}
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
