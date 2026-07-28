import { WorkflowTypeBadge } from "@/components/ui/WorkflowTypeBadge";
import {
  HIDDEN_SERVICE_LABEL,
  SERVICE_UNAVAILABLE_LABEL,
  getInternalServiceDisplayName,
} from "@/lib/service-types/labels";
import type { InternalServiceReference } from "@/lib/service-types/types";

type InternalServiceDisplayProps = {
  service: InternalServiceReference | null;
  fallback?: string;
  compact?: boolean;
  showWorkflow?: boolean;
};

export function InternalServiceDisplay({
  service,
  fallback = SERVICE_UNAVAILABLE_LABEL,
  compact = false,
  showWorkflow = false,
}: InternalServiceDisplayProps) {
  const serviceName = getInternalServiceDisplayName(service, fallback);

  if (compact) {
    return (
      <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="truncate font-medium text-text-primary">
          {serviceName}
        </span>
        {service && !service.isPubliclyAvailable ? (
          <span className="text-xs font-medium text-text-muted">
            {HIDDEN_SERVICE_LABEL}
          </span>
        ) : null}
        {showWorkflow && service ? (
          <WorkflowTypeBadge workflowType={service.workflowType} />
        ) : null}
      </span>
    );
  }

  return (
    <span className="inline-flex min-w-0 flex-col items-start gap-1">
      <span className="wrap-break-word font-medium text-text-primary">
        {serviceName}
      </span>
      {service && !service.isPubliclyAvailable ? (
        <span className="text-xs font-medium leading-5 text-text-muted">
          {HIDDEN_SERVICE_LABEL}
        </span>
      ) : null}
      {showWorkflow && service ? (
        <WorkflowTypeBadge workflowType={service.workflowType} />
      ) : null}
    </span>
  );
}
