import type { HTMLAttributes } from "react";

import { PEDIDO_STATUS_LABELS } from "@/lib/pedidos/labels";
import { SOLICITUD_STATUS_LABELS } from "@/lib/solicitudes/labels";

type BadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent";

export type StatusBadgeProps = Omit<
  HTMLAttributes<HTMLSpanElement>,
  "children"
> & {
  status: string;
  label?: string;
};

const statusLabels: Record<string, string> = {
  ...SOLICITUD_STATUS_LABELS,
  ...PEDIDO_STATUS_LABELS,
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completada: "Completada",
  completado: "Completado",
};

const statusTones: Record<string, BadgeTone> = {
  nueva: "info",
  solicitud_recibida: "info",
  creado: "neutral",
  pendiente: "warning",
  en_revision: "warning",
  contactada: "accent",
  en_progreso: "accent",
  en_produccion: "accent",
  aprobada: "success",
  convertida: "success",
  listo_entrega: "success",
  entregado: "success",
  completada: "success",
  completado: "success",
  rechazada: "danger",
  cancelado: "danger",
};

const toneClasses: Record<BadgeTone, string> = {
  neutral: "border-border-strong bg-surface-muted text-text-secondary",
  info: "border-info/30 bg-info-soft text-info",
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
  accent: "border-brand-accent/30 bg-brand-accent-soft text-brand-accent",
};

function humanize(value: string) {
  const normalized = value.trim().replace(/[_-]+/g, " ");

  if (!normalized) {
    return "Sin estado";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function StatusBadge({
  status,
  label,
  className,
  ...props
}: StatusBadgeProps) {
  const normalizedStatus = status.trim().toLowerCase();
  const visibleLabel =
    label ?? statusLabels[normalizedStatus] ?? humanize(status);
  const tone = statusTones[normalizedStatus] ?? "neutral";

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
