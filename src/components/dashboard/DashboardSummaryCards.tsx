export type DashboardSummaryCard = {
  title: string;
  value: number;
  description: string;
};

type DashboardSummaryCardsProps = {
  cards: DashboardSummaryCard[];
};

export function DashboardSummaryCards({ cards }: DashboardSummaryCardsProps) {
  return (
    <section
      aria-label="Resumen operativo"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {cards.map((card) => (
        <article
          key={card.title}
          className="min-h-36 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"
        >
          <p className="text-sm font-medium text-zinc-600">{card.title}</p>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950">
            {card.value.toLocaleString("es")}
          </p>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            {card.description}
          </p>
        </article>
      ))}
    </section>
  );
}
