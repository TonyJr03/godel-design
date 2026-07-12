import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";

import { DetailPanel, MetadataGrid, MetadataItem } from "@/components/ui";
import { WorkflowTypeBadge } from "@/components/ui/WorkflowTypeBadge";
import type { InternalClienteDetail } from "@/lib/clientes";
import { formatAppDateTime } from "@/lib/utils";

type InternalClienteDetailProps = {
  cliente: InternalClienteDetail;
};

function formatShortReference(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function BackToClientesLink({
  presentation,
}: {
  presentation: "text" | "button";
}) {
  if (presentation === "text") {
    return (
      <Link
        href="/dashboard/clientes"
        className="inline-flex min-h-11 w-fit items-center gap-2 font-mono text-base font-semibold text-brand-primary transition-colors hover:text-brand-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background xl:hidden"
      >
        <ArrowLeft
          aria-hidden="true"
          className="h-4 w-4"
          strokeWidth={1.75}
        />
        Volver a clientes
      </Link>
    );
  }

  return (
    <Link
      href="/dashboard/clientes"
      className="hidden min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted xl:inline-flex xl:w-auto"
    >
      <ArrowLeft
        aria-hidden="true"
        className="h-4 w-4"
        strokeWidth={1.75}
      />
      Volver a clientes
    </Link>
  );
}

function EditClienteLink({ clienteId }: { clienteId: string }) {
  return (
    <Link
      href={`/dashboard/clientes/${clienteId}/editar`}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-(--radius-control) bg-brand-primary text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label="Editar cliente"
      title="Editar cliente"
    >
      <Pencil className="size-5" aria-hidden="true" />
    </Link>
  );
}

export function InternalClienteDetail({
  cliente,
}: InternalClienteDetailProps) {
  return (
    <article className="space-y-6">
      <header className="min-w-0">
        <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <BackToClientesLink presentation="text" />

            <div className="mt-2 flex min-w-0 items-start justify-between gap-3 xl:block">
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

              <div className="shrink-0 xl:hidden">
                <EditClienteLink clienteId={cliente.id} />
              </div>
            </div>
          </div>

          <div className="hidden shrink-0 items-center gap-2 xl:flex">
            <BackToClientesLink presentation="button" />
            <EditClienteLink clienteId={cliente.id} />
          </div>
        </div>
      </header>

      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="contents lg:block lg:space-y-6">
            <DetailPanel title="Datos de contacto" className="order-1">
              <MetadataGrid>
                <MetadataItem label="Teléfono" value={cliente.phone} />
                <MetadataItem
                  label="Correo electrónico"
                  value={cliente.email ?? "No definido"}
                />
              </MetadataGrid>
            </DetailPanel>

            <DetailPanel title="Notas" className="order-3">
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

          <DetailPanel title="Registro" className="order-2 lg:order-none">
            <MetadataGrid>
              <MetadataItem
                label="Creación"
                value={formatAppDateTime(cliente.created_at, "No definida")}
              />
              <MetadataItem
                label="Actualización"
                value={formatAppDateTime(cliente.updated_at, "No definida")}
              />
              <MetadataItem
                label="Identificador interno"
                className="min-w-0 sm:col-span-2"
                value={
                  <span className="block w-full max-w-full break-all font-mono text-xs leading-6 text-text-secondary">
                    {cliente.id}
                  </span>
                }
              />
            </MetadataGrid>
          </DetailPanel>
        </div>

        <DetailPanel title="Pedidos vinculados">
          {cliente.pedidos.length > 0 ? (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {cliente.pedidos.map((pedido) => (
                <li key={pedido.id}>
                  <Link
                    href={`/dashboard/pedidos/${pedido.id}`}
                    className="flex min-w-0 cursor-pointer items-center gap-2 rounded-(--radius-control) border border-border bg-surface px-3 py-3 text-sm transition-colors hover:border-brand-primary hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <span className="min-w-0 truncate font-semibold text-brand-primary">
                      {pedido.title}
                    </span>
                    <WorkflowTypeBadge
                      workflowType={pedido.workflow_type}
                      className="shrink-0"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm leading-6 text-text-secondary">
              Este cliente todavía no tiene pedidos vinculados.
            </p>
          )}
        </DetailPanel>
      </div>
    </article>
  );
}
