import {
  ClickableTableRow,
  ListingCardLink,
} from "@/components/listing";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WorkflowTypeBadge } from "@/components/ui/WorkflowTypeBadge";
import { formatMoney } from "@/lib/format/money";
import {
  PEDIDO_PAYMENT_STATUS_LABELS,
  type InternalPedido,
} from "@/lib/pedidos";
import { getInternalServiceDisplayName } from "@/lib/service-types";

type InternalPedidosListProps = {
  pedidos: InternalPedido[];
  emptyMessage?: string;
  hasActiveFilters?: boolean;
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

function getPaymentBadgeClasses(pedido: InternalPedido): string {
  if (!pedido.payment.isAvailable) {
    return "border-warning/30 bg-warning-soft text-text-primary";
  }

  if (pedido.payment.paymentStatus === "pagado") {
    return "border-success/30 bg-success-soft text-success";
  }

  if (pedido.payment.paymentStatus === "parcial") {
    return "border-warning/30 bg-warning-soft text-text-primary";
  }

  return "border-danger/30 bg-danger-soft text-danger";
}

function getPaymentLabel(pedido: InternalPedido): string {
  return pedido.payment.isAvailable
    ? PEDIDO_PAYMENT_STATUS_LABELS[pedido.payment.paymentStatus]
    : "Sin información";
}

function getPaymentPendingLabel(pedido: InternalPedido): string | null {
  if (!pedido.payment.isAvailable || pedido.payment.pendingAmount <= 0) {
    return null;
  }

  return `Pendiente: ${formatMoney(pedido.payment.pendingAmount)}`;
}

function PaymentBadge({
  pedido,
  compact = false,
}: {
  pedido: InternalPedido;
  compact?: boolean;
}) {
  const pendingLabel = compact ? null : getPaymentPendingLabel(pedido);

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <span
        className={[
          "inline-flex rounded-(--radius-control) border px-2.5 py-1 text-xs font-semibold",
          getPaymentBadgeClasses(pedido),
        ].join(" ")}
      >
        {getPaymentLabel(pedido)}
      </span>
      {pendingLabel ? (
        <span className="text-xs leading-5 text-text-muted">
          {pendingLabel}
        </span>
      ) : null}
    </div>
  );
}

function PedidoServiceSummary({ pedido }: { pedido: InternalPedido }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium text-text-primary">
        {getInternalServiceDisplayName(pedido.service)}
      </div>
      {pedido.service ? (
        <div className="mt-2">
          <WorkflowTypeBadge workflowType={pedido.service.workflowType} />
        </div>
      ) : null}
    </div>
  );
}

export function InternalPedidosList({
  pedidos,
  emptyMessage = "Crea el primer pedido para comenzar a gestionar el trabajo.",
  hasActiveFilters = false,
}: InternalPedidosListProps) {
  if (pedidos.length === 0) {
    return (
      <EmptyState
        variant={hasActiveFilters ? "search" : "default"}
        title={
          hasActiveFilters
            ? "No encontramos pedidos con estos filtros."
            : "No hay pedidos registrados todavía."
        }
        description={emptyMessage}
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 xl:hidden" aria-label="Pedidos">
        {pedidos.map((pedido) => (
          <ListingCardLink
            href={`/dashboard/pedidos/${pedido.id}`}
            key={pedido.id}
            aria-label={`Abrir pedido ${pedido.order_number}`}
            className="space-y-3 overflow-hidden"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-brand-primary">
                  {pedido.order_number}
                </p>
                <h2 className="mt-1 line-clamp-2 text-base font-semibold text-text-primary">
                  {pedido.title}
                </h2>
                <div className="mt-2">
                  <PedidoServiceSummary pedido={pedido} />
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <StatusBadge status={pedido.status} />
                <PaymentBadge pedido={pedido} compact />
              </div>
            </div>

            <p className="text-sm text-text-secondary">
              Entrega: {formatDate(pedido.estimated_delivery_date)}
            </p>
          </ListingCardLink>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-(--radius-card) border border-border bg-surface shadow-(--shadow-soft) xl:block">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-border text-sm">
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[38%]" />
              <col className="w-[18%]" />
              <col className="w-[11%]" />
              <col className="w-[12%]" />
              <col className="w-[9%]" />
            </colgroup>
            <thead className="bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Pedido
                </th>
                <th scope="col" className="px-4 py-3">
                  Trabajo
                </th>
                <th scope="col" className="px-4 py-3">
                  Servicio
                </th>
                <th scope="col" className="px-4 py-3">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3">
                  Pago
                </th>
                <th scope="col" className="px-4 py-3">
                  Entrega
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {pedidos.map((pedido) => (
                <ClickableTableRow
                  key={pedido.id}
                  href={`/dashboard/pedidos/${pedido.id}`}
                  label={`Abrir pedido ${pedido.order_number}`}
                  className="align-top"
                >
                  <td className="whitespace-nowrap px-4 py-4">
                    <div className="truncate font-semibold text-text-primary">
                      {pedido.order_number}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-text-secondary">
                    <div className="truncate font-semibold text-text-primary">
                      {pedido.title}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                      {pedido.description}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-text-secondary">
                    <PedidoServiceSummary pedido={pedido} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <StatusBadge status={pedido.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <PaymentBadge pedido={pedido} compact />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    {formatDate(pedido.estimated_delivery_date)}
                  </td>
                </ClickableTableRow>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
