import Link from "next/link";

import { DetailPanel, MetadataGrid, MetadataItem } from "@/components/ui";
import type { InternalClienteDetail } from "@/lib/clientes";
import { formatAppDateTime } from "@/lib/utils";

type InternalClienteDetailProps = {
  cliente: InternalClienteDetail;
};

function formatShortReference(id: string) {
  return id.slice(0, 8).toUpperCase();
}

export function InternalClienteDetail({
  cliente,
}: InternalClienteDetailProps) {
  return (
    <article className="space-y-6">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-brand-primary">
            Cliente {formatShortReference(cliente.id)}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">
            {cliente.name}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-text-secondary">
            Ficha de contacto para consulta y seguimiento operativo.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/dashboard/clientes"
            className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted"
          >
            Volver a clientes
          </Link>
          <Link
            href={`/dashboard/clientes/${cliente.id}/editar`}
            className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover"
          >
            Editar cliente
          </Link>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <DetailPanel
          title="Datos de contacto"
          description="Información disponible para coordinar el trabajo con este cliente."
        >
          <MetadataGrid>
            <MetadataItem label="Teléfono" value={cliente.phone} />
            <MetadataItem
              label="Correo electrónico"
              value={cliente.email ?? "No definido"}
            />
          </MetadataGrid>
        </DetailPanel>

        <DetailPanel
          title="Registro"
          description="Metadata secundaria de la ficha."
          className="lg:row-span-2"
        >
          <MetadataGrid className="sm:grid-cols-1">
            <MetadataItem
              label="Creación"
              value={formatAppDateTime(cliente.created_at, "No definida")}
            />
            <MetadataItem
              label="Última actualización"
              value={formatAppDateTime(cliente.updated_at, "No definida")}
            />
            <MetadataItem
              label="Identificador interno"
              value={
                <span className="break-all font-mono text-xs text-text-secondary">
                  {cliente.id}
                </span>
              }
            />
          </MetadataGrid>
        </DetailPanel>

        <DetailPanel
          title="Notas"
          description="Contexto operativo registrado para este cliente."
        >
          {cliente.notes ? (
            <p className="whitespace-pre-line text-sm leading-7 text-text-primary">
              {cliente.notes}
            </p>
          ) : (
            <p className="text-sm leading-6 text-text-secondary">
              No hay notas registradas para este cliente.
            </p>
          )}
        </DetailPanel>
      </div>
    </article>
  );
}
