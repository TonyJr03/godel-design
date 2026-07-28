import type { ReactNode } from "react";

type InformationPanelSectionProps = {
  title: string;
  children: ReactNode;
};

export function InformationPanelSection({
  title,
  children,
}: InformationPanelSectionProps) {
  return (
    <section className="border-t border-border pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      <div className="mt-4 rounded-(--radius-control) border border-border bg-surface-muted p-4">
        {children}
      </div>
    </section>
  );
}
