import Link from "next/link";
import type { ReactNode } from "react";
import type { InternalClienteDetail } from "@/lib/clientes";

type InternalClienteDetailProps = {
  cliente: InternalClienteDetail;
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function formatDateTime(value: string | null): string {
  if (!value) {
    return "No definida";
  }

  return DATE_TIME_FORMATTER.format(new Date(value));
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm leading-6 text-zinc-950">{value}</dd>
    </div>
  );
}

export function InternalClienteDetail({
  cliente,
}: InternalClienteDetailProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/dashboard/clientes"
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400"
        >
          Volver a clientes
        </Link>
        <span className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 px-4 text-sm font-semibold text-zinc-400">
          Editar cliente próximamente
        </span>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="border-b border-zinc-200 pb-5">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
            {cliente.nombre}
          </h2>
          <p className="mt-2 break-all font-mono text-xs text-zinc-500">
            {cliente.id}
          </p>
        </div>

        <dl className="mt-6 grid gap-6 sm:grid-cols-2">
          <DetailItem label="Teléfono" value={cliente.telefono} />
          <DetailItem
            label="Correo electrónico"
            value={cliente.email ?? "No definido"}
          />
          <DetailItem
            label="Creación"
            value={formatDateTime(cliente.created_at)}
          />
          <DetailItem
            label="Última actualización"
            value={formatDateTime(cliente.updated_at)}
          />
        </dl>

        {cliente.notas ? (
          <div className="mt-6 border-t border-zinc-200 pt-6">
            <h3 className="text-sm font-semibold text-zinc-950">Notas</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-700">
              {cliente.notas}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
