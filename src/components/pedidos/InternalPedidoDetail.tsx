import Link from "next/link";
import type { ReactNode } from "react";
import {
  PEDIDO_PRIORITY_LABELS,
  PEDIDO_STATUS_LABELS,
  type InternalPedidoDetail,
  type PedidoStatusTransitionContext,
} from "@/lib/pedidos";
import { SOLICITUD_STATUS_LABELS } from "@/lib/solicitudes";
import { formatAppDateTime } from "@/lib/utils";
import { PedidoStatusForm } from "./PedidoStatusForm";

type InternalPedidoDetailProps = {
  pedido: InternalPedidoDetail;
  taskProgress?: PedidoStatusTransitionContext | null;
  tasksLoadError?: string;
  workerAssignmentSection?: ReactNode;
  tasksSection?: ReactNode;
  filesSection?: ReactNode;
  commentsSection?: ReactNode;
  historySection?: ReactNode;
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

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm leading-6 text-zinc-950">{value}</dd>
    </div>
  );
}

function StatusBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-md bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-700/15">
      {children}
    </span>
  );
}

export function InternalPedidoDetail({
  pedido,
  taskProgress,
  tasksLoadError,
  workerAssignmentSection,
  tasksSection,
  filesSection,
  commentsSection,
  historySection,
}: InternalPedidoDetailProps) {
  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/pedidos"
        className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400"
      >
        Volver a pedidos
      </Link>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-zinc-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="font-mono text-xs font-semibold text-zinc-500">
              {pedido.order_number} · {formatShortReference(pedido.id)}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
              {pedido.title}
            </h2>
            <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-6 text-zinc-700">
              {pedido.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge>{PEDIDO_STATUS_LABELS[pedido.status]}</StatusBadge>
            <span className="inline-flex rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200">
              Prioridad {PEDIDO_PRIORITY_LABELS[pedido.priority]}
            </span>
          </div>
        </div>

        <dl className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem
            label="Fecha operativa"
            value={formatAppDateTime(pedido.created_at, "No definida")}
          />
          <DetailItem
            label="Entrega estimada"
            value={formatDate(pedido.estimated_delivery_date)}
          />
          <DetailItem
            label="Entrega real"
            value={formatDate(pedido.actual_delivery_date)}
          />
          <DetailItem
            label="Creado por"
            value={pedido.creador?.full_name ?? "No definido"}
          />
          <DetailItem
            label="Última actualización"
            value={formatAppDateTime(pedido.updated_at, "No definida")}
          />
        </dl>

        <div className="mt-6 border-t border-zinc-200 pt-6">
          <h3 className="text-sm font-semibold text-zinc-950">
            Identificador interno
          </h3>
          <p className="mt-2 break-all font-mono text-xs text-zinc-500">
            {pedido.id}
          </p>
        </div>
      </section>

      <PedidoStatusForm
        pedidoId={pedido.id}
        estadoActual={pedido.status}
        taskProgress={taskProgress}
        tasksLoadError={tasksLoadError}
      />

      {tasksSection}

      {workerAssignmentSection}

      {commentsSection}

      {historySection}

      {filesSection}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-zinc-950">Cliente</h3>
          {pedido.clientes ? (
            <dl className="mt-5 grid gap-5">
              <DetailItem
                label="Nombre"
                value={
                  <Link
                    href={`/dashboard/clientes/${pedido.clientes.id}`}
                    className="font-semibold text-teal-800 hover:text-teal-900"
                  >
                    {pedido.clientes.name}
                  </Link>
                }
              />
              <DetailItem label="Teléfono" value={pedido.clientes.phone} />
              <DetailItem
                label="Correo electrónico"
                value={pedido.clientes.email ?? "No definido"}
              />
            </dl>
          ) : pedido.cliente_id ? (
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Este pedido tiene un cliente asociado, pero no hay datos visibles
              para mostrar.
            </p>
          ) : (
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Sin cliente asociado.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-zinc-950">Solicitud</h3>
          {pedido.solicitudes ? (
            <dl className="mt-5 grid gap-5">
              <DetailItem
                label="Servicio"
                value={
                  <Link
                    href={`/dashboard/solicitudes/${pedido.solicitudes.id}`}
                    className="font-semibold text-teal-800 hover:text-teal-900"
                  >
                    {pedido.solicitudes.service_type}
                  </Link>
                }
              />
              <DetailItem
                label="Cliente capturado"
                value={pedido.solicitudes.client_name}
              />
              <DetailItem
                label="Contacto"
                value={
                  <span>
                    {pedido.solicitudes.client_phone}
                    {pedido.solicitudes.client_email ? (
                      <span className="mt-1 block text-xs text-zinc-500">
                        {pedido.solicitudes.client_email}
                      </span>
                    ) : null}
                  </span>
                }
              />
              <DetailItem
                label="Estado"
                value={SOLICITUD_STATUS_LABELS[pedido.solicitudes.status]}
              />
              <DetailItem
                label="Fecha deseada"
                value={formatDate(pedido.solicitudes.desired_date)}
              />
              <DetailItem
                label="Descripción original"
                value={
                  <span className="whitespace-pre-line">
                    {pedido.solicitudes.description}
                  </span>
                }
              />
            </dl>
          ) : pedido.solicitud_id ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm leading-6 text-zinc-600">
                Este pedido tiene una solicitud asociada, pero no hay datos
                visibles para mostrar.
              </p>
              <p className="font-mono text-xs text-zinc-500">
                {pedido.solicitud_id}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Este pedido fue creado manualmente o aún no tiene solicitud
              asociada.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
