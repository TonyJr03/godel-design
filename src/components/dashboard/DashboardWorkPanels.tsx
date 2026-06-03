import Link from "next/link";
import type {
  DashboardPedidoWorkItem,
  DashboardPendingSolicitudItem,
  GetDashboardWorkItemsResult,
} from "@/lib/dashboard";
import { PEDIDO_PRIORITY_LABELS, PEDIDO_STATUS_LABELS } from "@/lib/pedidos";
import { SOLICITUD_STATUS_LABELS } from "@/lib/solicitudes";

type DashboardWorkPanelsProps = {
  result: GetDashboardWorkItemsResult;
};

function formatDate(value: string | null): string {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function getSolicitudReference(id: string): string {
  return `Solicitud ${id.slice(0, 8)}`;
}

function getPedidoAttentionLabel(item: DashboardPedidoWorkItem): string | null {
  if (item.attention.isOverdue) {
    return "Atrasado";
  }

  if (item.attention.isDueSoon) {
    return "Próximo";
  }

  return null;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-600">
      {message}
    </div>
  );
}

function WorkPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
      {children}
    </section>
  );
}

function SolicitudesList({
  solicitudes,
}: {
  solicitudes: DashboardPendingSolicitudItem[];
}) {
  if (solicitudes.length === 0) {
    return <EmptyState message="No hay solicitudes pendientes por revisar." />;
  }

  return (
    <div className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      {solicitudes.map((solicitud) => (
        <Link
          key={solicitud.id}
          href={solicitud.href}
          className="block p-4 transition hover:bg-zinc-50"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-950">
                {getSolicitudReference(solicitud.id)}
              </p>
              <p className="mt-1 truncate text-sm text-zinc-700">
                {solicitud.clienteNombre}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {solicitud.tipoServicio} · {solicitud.clienteTelefono}
              </p>
            </div>
            <div className="shrink-0 text-left sm:text-right">
              <p className="text-sm font-medium text-teal-700">
                {SOLICITUD_STATUS_LABELS[solicitud.status]}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Deseada: {formatDate(solicitud.fechaDeseada)}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Creada: {formatDate(solicitud.createdAt)}
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function PedidosList({
  pedidos,
  emptyMessage,
}: {
  pedidos: DashboardPedidoWorkItem[];
  emptyMessage: string;
}) {
  if (pedidos.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <div className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      {pedidos.map((pedido) => {
        const attentionLabel = getPedidoAttentionLabel(pedido);

        return (
          <Link
            key={pedido.id}
            href={pedido.href}
            className="block p-4 transition hover:bg-zinc-50"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-zinc-950">
                    {pedido.numeroPedido}
                  </p>
                  {attentionLabel ? (
                    <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                      {attentionLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-sm text-zinc-700">
                  {pedido.title}
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  {pedido.clienteNombre ?? "Cliente no disponible"}
                </p>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <p className="text-sm font-medium text-teal-700">
                  {PEDIDO_STATUS_LABELS[pedido.status]}
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  Prioridad: {PEDIDO_PRIORITY_LABELS[pedido.priority]}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Entrega: {formatDate(pedido.fechaEntregaEstimada)}
                </p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export function DashboardWorkPanels({ result }: DashboardWorkPanelsProps) {
  if (!result.ok) {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        <h2 className="font-semibold">
          No se pudieron cargar los paneles operativos.
        </h2>
        <p className="mt-2 leading-6">
          Intenta recargar la página o contacta al administrador si el problema
          continúa.
        </p>
      </section>
    );
  }

  if (result.workItems.kind === "worker") {
    return (
      <WorkPanel title="Mis pedidos asignados">
        <PedidosList
          pedidos={result.workItems.pedidosAsignados}
          emptyMessage="No tienes pedidos asignados que requieran atención."
        />
      </WorkPanel>
    );
  }

  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <WorkPanel title="Solicitudes pendientes">
        <SolicitudesList solicitudes={result.workItems.solicitudesPendientes} />
      </WorkPanel>
      <WorkPanel title="Pedidos que requieren atención">
        <PedidosList
          pedidos={result.workItems.pedidosAtencion}
          emptyMessage="No hay pedidos que requieran atención inmediata."
        />
      </WorkPanel>
    </div>
  );
}
