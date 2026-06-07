import type { HTMLAttributes, ReactNode } from "react";

export type AlertVariant = "info" | "success" | "warning" | "danger";

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  variant?: AlertVariant;
  title?: ReactNode;
};

const variantClasses: Record<AlertVariant, string> = {
  info: "border-info/30 bg-info-soft text-info",
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
};

export function Alert({
  variant = "info",
  title,
  className,
  children,
  role,
  ...props
}: AlertProps) {
  const semanticRole =
    role ??
    (variant === "danger"
      ? "alert"
      : variant === "success"
        ? "status"
        : undefined);

  return (
    <div
      role={semanticRole}
      className={[
        "rounded-(--radius-control) border px-4 py-3 text-sm",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-1 text-text-primary" : "text-text-primary"}>
        {children}
      </div>
    </div>
  );
}
