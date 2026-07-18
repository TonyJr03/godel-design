"use client";

import Link from "next/link";

import { Alert, Button, Card } from "@/components/ui";

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

const linkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";

export default function DashboardError({ reset }: DashboardErrorProps) {
  return (
    <section aria-labelledby="dashboard-error-title" className="space-y-8">
      <header className="min-w-0 border-b border-border pb-5">
        <p className="text-sm font-semibold uppercase text-brand-primary">
          Workspace operativo
        </p>
        <h1
          id="dashboard-error-title"
          className="mt-2 text-3xl font-semibold text-text-primary"
        >
          No pudimos mostrar el dashboard
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-text-secondary">
          La vista encontró un problema temporal antes de completar el render.
        </p>
      </header>

      <Card as="section" variant="raised" padding="lg" className="max-w-3xl">
        <Alert variant="danger" title="Vista no disponible por ahora">
          <p className="leading-6">
            Intenta cargar el dashboard nuevamente. Si el problema continúa,
            vuelve al inicio del área operativa y repite la acción más tarde.
          </p>
        </Alert>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            onClick={() => reset()}
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            Reintentar
          </Button>
          <Link href="/dashboard" className={linkClasses}>
            Volver al dashboard
          </Link>
        </div>
      </Card>
    </section>
  );
}
