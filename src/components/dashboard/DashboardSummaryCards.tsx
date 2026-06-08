export type DashboardSummaryCard = {
  title: string;
  value: number;
  description: string;
  tone?: "neutral" | "info" | "warning" | "danger" | "success";
};

type DashboardSummaryCardsProps = {
  cards: DashboardSummaryCard[];
};

export function DashboardSummaryCards({ cards }: DashboardSummaryCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => (
        <article
          key={card.title}
          className={[
            "min-h-40 rounded-(--radius-card) border p-5 shadow-(--shadow-soft)",
            toneClasses[card.tone ?? "neutral"],
          ].join(" ")}
        >
          <p className="text-sm font-semibold text-text-secondary">
            {card.title}
          </p>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-text-primary">
            {card.value.toLocaleString("es")}
          </p>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            {card.description}
          </p>
        </article>
      ))}
    </div>
  );
}

const toneClasses = {
  neutral: "border-border bg-surface",
  info: "border-info/25 bg-info-soft",
  warning: "border-warning/25 bg-warning-soft",
  danger: "border-danger/25 bg-danger-soft",
  success: "border-success/25 bg-success-soft",
} as const;
