type PlaceholderCardProps = {
  title: string;
  description: string;
};

export function PlaceholderCard({ title, description }: PlaceholderCardProps) {
  return (
    <section className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
        Pendiente
      </p>
      <h2 className="mt-3 text-xl font-semibold text-zinc-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
    </section>
  );
}
