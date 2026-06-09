import type { HTMLAttributes, ReactNode } from "react";

export type FormSectionProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  description?: ReactNode;
};

export function FormSection({
  title,
  description,
  className,
  children,
  ...props
}: FormSectionProps) {
  return (
    <section
      className={[
        "rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-8",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {title ? (
        <div className="mb-6">
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
