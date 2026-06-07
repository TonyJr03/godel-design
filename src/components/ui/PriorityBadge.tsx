import type { HTMLAttributes } from "react";

import { PEDIDO_PRIORITY_LABELS } from "@/lib/pedidos/labels";

type PriorityTone = "neutral" | "info" | "warning" | "danger";

export type PriorityBadgeProps = Omit<
  HTMLAttributes<HTMLSpanElement>,
  "children"
> & {
  priority: string;
  label?: string;
};

const priorityTones: Record<string, PriorityTone> = {
  baja: "neutral",
  normal: "info",
  alta: "warning",
  urgente: "danger",
};

const toneClasses: Record<PriorityTone, string> = {
  neutral: "border-border-strong bg-surface-muted text-text-secondary",
  info: "border-info/30 bg-info-soft text-info",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
};

function humanize(value: string) {
  const normalized = value.trim().replace(/[_-]+/g, " ");

  if (!normalized) {
    return "Sin prioridad";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function PriorityBadge({
  priority,
  label,
  className,
  ...props
}: PriorityBadgeProps) {
  const normalizedPriority = priority.trim().toLowerCase();
  const visibleLabel =
    label ??
    PEDIDO_PRIORITY_LABELS[
      normalizedPriority as keyof typeof PEDIDO_PRIORITY_LABELS
    ] ??
    humanize(priority);
  const tone = priorityTones[normalizedPriority] ?? "neutral";

  return (
    <span
      className={[
        "inline-flex items-center rounded-(--radius-control) border px-2.5 py-1 text-xs font-semibold leading-none",
        toneClasses[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {visibleLabel}
    </span>
  );
}
