type PedidoDescriptionPreviewProps = {
  title: string;
  description: string;
  className?: string;
};

export function PedidoDescriptionPreview({
  title,
  description,
  className,
}: PedidoDescriptionPreviewProps) {
  const content = description.trim()
    ? description
    : "Sin descripción registrada.";

  return (
    <section
      aria-labelledby="pedido-description-preview-title"
      className={[
        "flex min-h-0 flex-col rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6 xl:h-full xl:overflow-hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <h2
        id="pedido-description-preview-title"
        className="shrink-0 text-lg font-semibold text-text-primary"
      >
        {title}
      </h2>

      <div className="mt-4 min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain">
        <p className="whitespace-pre-wrap wrap-break-word text-sm leading-7 text-text-secondary">
          {content}
        </p>
      </div>
    </section>
  );
}
