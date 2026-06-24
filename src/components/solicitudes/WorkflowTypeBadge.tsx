import type { HTMLAttributes } from "react";

import {
  WORKFLOW_TYPES,
  WORKFLOW_TYPE_LABELS,
  type WorkflowType,
} from "@/lib/workflow-types";

type WorkflowTypeBadgeProps = Omit<
  HTMLAttributes<HTMLSpanElement>,
  "children"
> & {
  workflowType: WorkflowType;
};

const toneClasses: Record<WorkflowType, string> = {
  [WORKFLOW_TYPES.ENCARGO]:
    "border-info/30 bg-info-soft text-info",
  [WORKFLOW_TYPES.IMPRESION]:
    "border-brand-accent/30 bg-brand-accent-soft text-brand-accent",
};

export function WorkflowTypeBadge({
  workflowType,
  className,
  ...props
}: WorkflowTypeBadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-(--radius-control) border px-2.5 py-1 text-xs font-semibold leading-none",
        toneClasses[workflowType],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {WORKFLOW_TYPE_LABELS[workflowType]}
    </span>
  );
}
