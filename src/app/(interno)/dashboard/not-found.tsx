import Link from "next/link";

import { EmptyState } from "@/components/ui/EmptyState";

const primaryLinkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover";

const secondaryLinkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted";

export default function DashboardNotFound() {
  return (
    <div className="space-y-8">
      <EmptyState
        variant="error"
        eyebrow="No encontrado"
        title="No encontramos este recurso interno"
        description="Es posible que el registro haya sido eliminado, que el enlace esté incompleto o que ya no tengas acceso a esta información."
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
