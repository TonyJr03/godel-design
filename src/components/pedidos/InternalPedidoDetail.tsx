import Link from "next/link";
import type { ReactNode } from "react";
import type { InternalPedidoDetail } from "@/lib/pedidos";
import { PedidoStatusForm } from "./PedidoStatusForm";

type InternalPedidoDetailProps = {
  pedido: InternalPedidoDetail;
  workerAssignmentSection?: ReactNode;
};

const ESTADO_LABELS: Record<InternalPedidoDetail["estado"], string> = {
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

const PRIORIDAD_LABELS: Record<InternalPedidoDetail["prioridad"], string> = {
  baja: "Baja",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

const SOLICITUD_ESTADO_LABELS: Record<
  NonNullable<InternalPedidoDetail["solicitudes"]>["estado"],
  string
> = {
  nueva: "Nueva",
  en_revision: "En revisión",
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

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
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

function formatDateTime(value: string | null): string {
  if (!value) {
    return "No definida";
  }

  return DATE_TIME_FORMATTER.format(new Date(value));
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

function getTrabajadorName(
  asignacion: InternalPedidoDetail["pedido_trabajadores"][number],
): string {
  if (asignacion.profiles?.full_name?.trim()) {
    return asignacion.profiles.full_name;
  }

  return "Usuario asignado";
}

export function InternalPedidoDetail({
  pedido,
  workerAssignmentSection,
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
              {pedido.numero_pedido} · {formatShortReference(pedido.id)}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
              {pedido.titulo}
            </h2>
            <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-6 text-zinc-700">
              {pedido.descripcion}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge>{ESTADO_LABELS[pedido.estado]}</StatusBadge>
            <span className="inline-flex rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200">
              Prioridad {PRIORIDAD_LABELS[pedido.prioridad]}
            </span>
          </div>
        </div>

        <dl className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem
            label="Fecha operativa"
            value={formatDateTime(pedido.fecha_creacion)}
          />
          <DetailItem
            label="Entrega estimada"
            value={formatDate(pedido.fecha_entrega_estimada)}
          />
          <DetailItem
            label="Entrega real"
            value={formatDate(pedido.fecha_entrega_real)}
          />
          <DetailItem
            label="Creado por"
            value={pedido.creador?.full_name ?? "No definido"}
          />
          <DetailItem
            label="Supervisor"
            value={pedido.supervisor?.full_name ?? "No definido"}
          />
          <DetailItem
            label="Última actualización"
            value={formatDateTime(pedido.updated_at)}
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

      <PedidoStatusForm pedidoId={pedido.id} estadoActual={pedido.estado} />

      {workerAssignmentSection}

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
                    {pedido.clientes.nombre}
                  </Link>
                }
              />
              <DetailItem label="Teléfono" value={pedido.clientes.telefono} />
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
              Este pedido no tiene cliente asociado.
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
                    {pedido.solicitudes.tipo_servicio}
                  </Link>
                }
              />
              <DetailItem
                label="Cliente capturado"
                value={pedido.solicitudes.cliente_nombre}
              />
              <DetailItem
                label="Contacto"
                value={
                  <span>
                    {pedido.solicitudes.cliente_telefono}
                    {pedido.solicitudes.cliente_email ? (
                      <span className="mt-1 block text-xs text-zinc-500">
                        {pedido.solicitudes.cliente_email}
                      </span>
                    ) : null}
                  </span>
                }
              />
              <DetailItem
                label="Estado"
                value={SOLICITUD_ESTADO_LABELS[pedido.solicitudes.estado]}
              />
              <DetailItem
                label="Fecha deseada"
                value={formatDate(pedido.solicitudes.fecha_deseada)}
              />
              <DetailItem
                label="Descripción original"
                value={
                  <span className="whitespace-pre-line">
                    {pedido.solicitudes.descripcion}
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

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-zinc-950">
          Personal asignado
        </h3>
        {pedido.pedido_trabajadores.length > 0 ? (
          <ul className="mt-5 divide-y divide-zinc-100">
            {pedido.pedido_trabajadores.map((asignacion) => (
              <li
                key={asignacion.id}
                className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium text-zinc-950">
                  {getTrabajadorName(asignacion)}
                </span>
                <span className="text-xs text-zinc-500">
                  Asignado el {formatDateTime(asignacion.assigned_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Este pedido aún no tiene personal asignado.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        Las acciones de remoción de personal y archivos se implementarán
        en próximas subfases.
      </section>
    </div>
  );
}
