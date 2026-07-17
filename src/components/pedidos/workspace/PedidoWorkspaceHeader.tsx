import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CopyableCode } from "@/components/common/CopyableCode";
import { PriorityBadge, StatusBadge } from "@/components/ui";
import { WorkflowTypeBadge } from "@/components/ui/WorkflowTypeBadge";
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

function BackToPedidosLink({ presentation }: { presentation: "text" | "button" }) {
  if (presentation === "text") {
    return (
      <Link
        href="/dashboard/pedidos"
        className="inline-flex min-h-11 w-fit items-center gap-2 font-mono text-base font-semibold text-brand-primary transition-colors hover:text-brand-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background xl:hidden"
      >
        <ArrowLeft
          aria-hidden="true"
          className="h-4 w-4"
          strokeWidth={1.75}
        />
        Volver a pedidos
      </Link>
    );
  }

  return (
    <Link
      href="/dashboard/pedidos"
      className="hidden min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted xl:inline-flex xl:w-auto"
    >
      <ArrowLeft
        aria-hidden="true"
        className="h-4 w-4"
        strokeWidth={1.75}
      />
      Volver a pedidos
    </Link>
  );
}

type PedidoWorkspaceHeaderProps = {
  pedido: InternalPedidoDetail;
};

export function PedidoWorkspaceHeader({
  pedido,
}: PedidoWorkspaceHeaderProps) {
  const hasActualDeliveryDate =
    pedido.status === "entregado" && Boolean(pedido.actual_delivery_date);
  const deliveryDate = formatDate(
    hasActualDeliveryDate
      ? pedido.actual_delivery_date
      : pedido.estimated_delivery_date,
  );
  const deliveryLabel = hasActualDeliveryDate
    ? "Fecha de entrega"
    : "Entrega estimada";

  return (
    <header className="min-w-0">
      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <BackToPedidosLink presentation="text" />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="inline-flex min-h-11 items-center font-mono text-base font-semibold text-brand-primary">
              {pedido.order_number}
            </p>
            <WorkflowTypeBadge
              workflowType={pedido.workflow_type}
              className="px-3 py-1.5 text-sm"
            />
            <StatusBadge
              status={pedido.status}
              className="px-3 py-1.5 text-sm"
            />
            <PriorityBadge
              priority={pedido.priority}
              className="px-3 py-1.5 text-sm"
            />
            <CopyableCode
              code={pedido.public_reference}
              presentation="inline"
            />
          </div>

          <h1 className="mt-3 wrap-break-word text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            {pedido.title}
          </h1>

          {deliveryDate ? (
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              {deliveryLabel}:{" "}
              <span className="font-semibold text-text-primary">
                {deliveryDate}
              </span>
            </p>
          ) : null}
        </div>

        <BackToPedidosLink presentation="button" />
      </div>
    </header>
  );
}
