import Link from "next/link";

import { EmptyState } from "@/components/ui/EmptyState";

const primaryLinkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 motion-reduce:transition-none";

const secondaryLinkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 motion-reduce:transition-none";

export default function DashboardNotFound() {
  return (
    <div className="space-y-8">
      <EmptyState
        variant="error"
        titleAs="h1"
        eyebrow="No encontrado"
        title="No encontramos este recurso interno"
        description="Es posible que el registro haya sido eliminado, que el identificador no sea válido o que el enlace esté incompleto."
        action={
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/dashboard" className={primaryLinkClasses}>
              Volver al dashboard
            </Link>
            <Link href="/dashboard/pedidos" className={secondaryLinkClasses}>
              Ir a pedidos
            </Link>
          </div>
        }
      />
    </div>
  );
}
