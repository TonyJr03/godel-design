import Link from "next/link";
import { InternalClientesList } from "@/components/clientes/InternalClientesList";
import { PageHeader } from "@/components/ui/PageHeader";
import { listInternalClientes } from "@/lib/clientes";

type DashboardClientesPageProps = {
  searchParams: Promise<{
    q?: string | string[] | undefined;
  }>;
};

function getSingleSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardClientesPage({
  searchParams,
}: DashboardClientesPageProps) {
  const params = await searchParams;
  const q = getSingleSearchParam(params.q);
  const result = await listInternalClientes({ q });
  const searchValue = result.q ?? q ?? "";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Clientes"
          description="Listado interno de clientes registrados para consulta operativa."
        />
        <Link
          href="/dashboard/clientes/nuevo"
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Nuevo cliente
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-950">
          Buscar clientes
        </h2>
        <form action="/dashboard/clientes" className="flex max-w-2xl gap-3">
          <input
            type="search"
            name="q"
            defaultValue={searchValue}
            placeholder="Nombre, teléfono o email"
            className="min-h-10 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
          />
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Buscar
          </button>
        </form>
      </section>

      {!result.ok ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-950">
          {result.message}
        </section>
      ) : (
        <InternalClientesList clientes={result.clientes} />
      )}
    </div>
  );
}
