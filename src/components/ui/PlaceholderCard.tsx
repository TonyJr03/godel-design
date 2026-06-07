type PlaceholderCardProps = {
  title: string;
  description: string;
};

export function PlaceholderCard({ title, description }: PlaceholderCardProps) {
  return (
    <section className="rounded-(--radius-card) border border-dashed border-border-strong bg-surface-raised p-6 shadow-(--shadow-soft)">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-accent">
        Pendiente
      </p>
      <h2 className="mt-3 text-xl font-semibold text-text-primary">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        {description}
      </p>
    </section>
  );
}
