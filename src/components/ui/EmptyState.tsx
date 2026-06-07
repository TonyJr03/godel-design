import type { HTMLAttributes, ReactNode } from "react";

export type EmptyStateVariant =
  | "default"
  | "search"
  | "permission"
  | "error";

export type EmptyStateProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
  variant?: EmptyStateVariant;
};

const variantClasses: Record<EmptyStateVariant, string> = {
  default: "border-dashed border-border-strong bg-surface-raised",
  search: "border-dashed border-border bg-surface-muted",
  permission: "border-solid border-warning/35 bg-warning-soft",
  error: "border-solid border-danger/35 bg-danger-soft",
};

const eyebrowClasses: Record<EmptyStateVariant, string> = {
  default: "text-brand-accent",
  search: "text-brand-primary",
  permission: "text-warning",
  error: "text-danger",
};

export function EmptyState({
  title,
  description,
  action,
  eyebrow,
  variant = "default",
  className,
  ...props
}: EmptyStateProps) {
  return (
    <section
      className={[
        "rounded-(--radius-card) border p-6 shadow-(--shadow-soft)",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {eyebrow ? (
        <p
          className={[
            "text-sm font-semibold uppercase tracking-wide",
            eyebrowClasses[variant],
          ].join(" ")}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={[
          "text-xl font-semibold text-text-primary",
          eyebrow ? "mt-3" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {title}
      </h2>
      <div className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
        {description}
      </div>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}
