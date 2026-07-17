import type { HTMLAttributes, ReactNode } from "react";

export type FormSectionProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  description?: ReactNode;
  compact?: boolean;
};

export function FormSection({
  title,
  description,
  compact = false,
  className,
  children,
  ...props
}: FormSectionProps) {
  return (
    <section
      className={[
        compact
          ? "rounded-(--radius-card) border border-border bg-surface p-4 shadow-(--shadow-soft) sm:p-5"
          : "rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-8",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {title ? (
        <div className={compact ? "mb-4" : "mb-6"}>
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
