import type { ReactNode } from "react";

type DashboardSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function DashboardSection({
  title,
  description,
  children,
  className,
}: DashboardSectionProps) {
  return (
    <section className={className}>
      <div className="max-w-3xl">
        <h2 className="text-xl font-semibold tracking-tight text-text-primary">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            {description}
          </p>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
