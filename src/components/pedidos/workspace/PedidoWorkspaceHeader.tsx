import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PedidoWorkflowTypeBadge } from "@/components/pedidos/PedidoWorkflowTypeBadge";
import { PriorityBadge, StatusBadge } from "@/components/ui";
import type { InternalPedidoDetail } from "@/lib/pedidos";

const DATE_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string | null): string | null {
  return value ? DATE_FORMATTER.format(new Date(value)) : null;
}

type PedidoWorkspaceHeaderProps = {
  pedido: InternalPedidoDetail;
};

export function PedidoWorkspaceHeader({ pedido }: PedidoWorkspaceHeaderProps) {
  const estimatedDeliveryDate = formatDate(pedido.estimated_delivery_date);

  return (
    <header className="min-w-0 space-y-4">
      <Link
        href="/dashboard/pedidos"
        className="inline-flex min-h-11 items-center gap-2 rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
        Volver a pedidos
      </Link>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="font-mono text-sm font-semibold text-brand-primary">
            {pedido.order_number}
          </p>
          <PedidoWorkflowTypeBadge workflowType={pedido.workflow_type} />
          <StatusBadge status={pedido.status} />
          <PriorityBadge priority={pedido.priority} />
        </div>

        <h1 className="mt-3 wrap-break-word text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          {pedido.title}
        </h1>

        {estimatedDeliveryDate ? (
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            Entrega estimada:{" "}
            <span className="font-semibold text-text-primary">
              {estimatedDeliveryDate}
            </span>
          </p>
        ) : null}
      </div>
    </header>
  );
}
