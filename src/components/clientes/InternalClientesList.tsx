import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { InternalCliente } from "@/lib/clientes";

type InternalClientesListProps = {
  clientes: InternalCliente[];
  emptyMessage?: string;
  hasActiveFilters?: boolean;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const actionLinkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-brand-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft";

function formatDate(value: string | null): string {
  if (!value) {
    return "No definida";
  }

  return DATE_FORMATTER.format(new Date(value));
}

export function InternalClientesList({
  clientes,
  emptyMessage = "Cuando existan clientes registrados, aparecerán aquí para consulta interna.",
  hasActiveFilters = false,
}: InternalClientesListProps) {
  if (clientes.length === 0) {
    return (
      <EmptyState
        variant={hasActiveFilters ? "search" : "default"}
        title={
          hasActiveFilters
            ? "Sin resultados para esta búsqueda"
            : "No hay clientes para mostrar"
        }
        description={emptyMessage}
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 lg:hidden" aria-label="Clientes">
        {clientes.map((cliente) => (
          <Card
            as="article"
            key={cliente.id}
            padding="sm"
            className="shadow-(--shadow-soft)"
          >
            <h2 className="text-lg font-semibold text-text-primary">
              {cliente.name}
            </h2>

            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Teléfono
                </dt>
                <dd className="mt-1 text-text-primary">{cliente.phone}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Correo electrónico
                </dt>
                <dd className="mt-1 wrap-break-word text-text-primary">
                  {cliente.email ?? "No definido"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Actualización
                </dt>
                <dd className="mt-1 text-text-primary">
                  {formatDate(cliente.updated_at)}
                </dd>
              </div>
            </dl>

            <div className="mt-4 border-t border-border pt-4">
              <Link
                href={`/dashboard/clientes/${cliente.id}`}
                className={`${actionLinkClasses} w-full`}
              >
                Ver cliente
              </Link>
            </div>
          </Card>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-(--radius-card) border border-border bg-surface shadow-(--shadow-soft) lg:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Cliente
                </th>
                <th scope="col" className="px-4 py-3">
                  Teléfono
                </th>
                <th scope="col" className="px-4 py-3">
                  Correo electrónico
                </th>
                <th scope="col" className="px-4 py-3">
                  Creación
                </th>
                <th scope="col" className="px-4 py-3">
                  Actualización
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {clientes.map((cliente) => (
                <tr
                  key={cliente.id}
                  className="align-top transition-colors duration-200 hover:bg-brand-primary-soft/50"
                >
                  <td className="px-4 py-4 font-semibold text-text-primary">
                    {cliente.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    {cliente.phone}
                  </td>
                  <td className="px-4 py-4 text-text-secondary">
                    {cliente.email ?? "No definido"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    {formatDate(cliente.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    {formatDate(cliente.updated_at)}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link
                      href={`/dashboard/clientes/${cliente.id}`}
                      className={actionLinkClasses}
                    >
                      Ver cliente
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
