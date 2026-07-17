import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CopyableCode } from "@/components/common/CopyableCode";
import { StatusBadge } from "@/components/ui";
import { WorkflowTypeBadge } from "@/components/ui/WorkflowTypeBadge";
import type { InternalSolicitudDetail } from "@/lib/solicitudes";
import { getSolicitudServiceTypeLabel } from "@/lib/solicitudes";

const DATE_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string | null): string {
  return value ? DATE_FORMATTER.format(new Date(value)) : "No definida";
}

function BackToSolicitudesLink({
  presentation,
}: {
  presentation: "text" | "button";
}) {
  if (presentation === "text") {
    return (
      <Link
        href="/dashboard/solicitudes"
        className="inline-flex min-h-11 w-fit items-center gap-2 font-mono text-base font-semibold text-brand-primary transition-colors hover:text-brand-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background xl:hidden"
      >
        <ArrowLeft
          aria-hidden="true"
          className="h-4 w-4"
          strokeWidth={1.75}
        />
        Volver a solicitudes
      </Link>
    );
  }

  return (
    <Link
      href="/dashboard/solicitudes"
      className="hidden min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted xl:inline-flex xl:w-auto"
    >
      <ArrowLeft
        aria-hidden="true"
        className="h-4 w-4"
        strokeWidth={1.75}
      />
      Volver a solicitudes
    </Link>
  );
}

type SolicitudWorkspaceHeaderProps = {
  solicitud: InternalSolicitudDetail;
};

export function SolicitudWorkspaceHeader({
  solicitud,
}: SolicitudWorkspaceHeaderProps) {
  const serviceTypeLabel = getSolicitudServiceTypeLabel(
    solicitud.service_type,
  );

  return (
    <header className="min-w-0">
      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <BackToSolicitudesLink presentation="text" />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <CopyableCode
              code={solicitud.public_reference}
              presentation="inline"
            />
            <WorkflowTypeBadge
              workflowType={solicitud.workflow_type}
              className="px-3 py-1.5 text-sm"
            />
            <StatusBadge
              status={solicitud.status}
              className="px-3 py-1.5 text-sm"
            />
            <span className="inline-flex rounded-(--radius-control) border border-border bg-surface-muted px-3 py-1.5 text-sm font-semibold leading-none text-text-secondary">
              {serviceTypeLabel}
            </span>
          </div>

          <h1 className="mt-3 wrap-break-word text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            Solicitud de {solicitud.client_name}
          </h1>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm leading-6 text-text-secondary">
            <p>
              Recibida:{" "}
              <span className="font-semibold text-text-primary">
                {formatDate(solicitud.created_at)}
              </span>
            </p>
            <p>
              Fecha deseada:{" "}
              <span className="font-semibold text-text-primary">
                {formatDate(solicitud.desired_date)}
              </span>
            </p>
          </div>
        </div>

        <BackToSolicitudesLink presentation="button" />
      </div>
    </header>
  );
}
