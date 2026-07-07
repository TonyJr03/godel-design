import Link from "next/link";
import { ClienteForm } from "@/components/clientes/ClienteForm";
import { PageHeader } from "@/components/ui/PageHeader";

export default function NuevoClientePage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Nuevo cliente"
          description="Registra un cliente para uso interno del equipo operativo."
        />
        <Link
          href="/dashboard/clientes"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400"
        >
          Volver a clientes
        </Link>
      </div>

      <ClienteForm />
    </div>
  );
}
