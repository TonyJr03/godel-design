import {
  ClickableTableRow,
  ListingCardLink,
} from "@/components/listing";
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

function formatDate(value: string | null): string {
  if (!value) {
    return "No definida";
  }

  return DATE_FORMATTER.format(new Date(value));
}

function getClienteHref(cliente: InternalCliente): string {
  return `/dashboard/clientes/${cliente.id}`;
}

function getClienteLabel(cliente: InternalCliente): string {
  return `Abrir cliente ${cliente.name}`;
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
            ? "No encontramos clientes con esta búsqueda."
            : "No hay clientes registrados todavía."
        }
        description={emptyMessage}
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 xl:hidden" aria-label="Clientes">
        {clientes.map((cliente) => (
          <ListingCardLink
            href={getClienteHref(cliente)}
            key={cliente.id}
            aria-label={getClienteLabel(cliente)}
            className="space-y-3 overflow-hidden"
          >
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-text-primary">
                {cliente.name}
              </h2>
              <p className="mt-1 truncate text-sm text-text-secondary">
                {cliente.phone}
              </p>
              <p className="mt-1 truncate text-sm text-text-secondary">
                {cliente.email ?? "No definido"}
              </p>
            </div>

            <p className="text-sm text-text-secondary">
              Actualización: {formatDate(cliente.updated_at)}
            </p>
          </ListingCardLink>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-(--radius-card) border border-border bg-surface shadow-(--shadow-soft) xl:block">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-border text-sm">
            <colgroup>
              <col className="w-[26%]" />
              <col className="w-[16%]" />
              <col className="w-[30%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
            </colgroup>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {clientes.map((cliente) => (
                <ClickableTableRow
                  key={cliente.id}
                  href={getClienteHref(cliente)}
                  label={getClienteLabel(cliente)}
                  className="align-top"
                >
                  <td className="px-4 py-4 font-semibold text-text-primary">
                    <div className="truncate">{cliente.name}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    <div className="truncate">{cliente.phone}</div>
                  </td>
                  <td className="px-4 py-4 text-text-secondary">
                    <div className="truncate">
                      {cliente.email ?? "No definido"}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    {formatDate(cliente.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    {formatDate(cliente.updated_at)}
                  </td>
                </ClickableTableRow>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
