import Link from "next/link";
import { notFound } from "next/navigation";
import { ClienteEditForm } from "@/components/clientes/ClienteEditForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { getInternalClienteById } from "@/lib/clientes";

type EditarClientePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditarClientePage({
  params,
}: EditarClientePageProps) {
  const { id } = await params;
  const result = await getInternalClienteById(id);

  if (!result.ok) {
    if (result.reason === "invalid_id" || result.reason === "not_found") {
      notFound();
    }

    return (
      <div className="space-y-8">
        <PageHeader
          title="Editar cliente"
          description="Actualiza los datos básicos del cliente para uso interno."
        />
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-950">
          {result.message}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Editar cliente"
          description="Actualiza los datos básicos del cliente para uso interno."
        />
        <Link
          href={`/dashboard/clientes/${result.cliente.id}`}
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400"
        >
          Volver al detalle
        </Link>
      </div>

      <ClienteEditForm cliente={result.cliente} />
    </div>
  );
}
