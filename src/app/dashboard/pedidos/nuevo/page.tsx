import Link from "next/link";
import {
  PedidoForm,
  type PedidoFormCliente,
} from "@/components/pedidos/PedidoForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { listInternalClientes } from "@/lib/clientes";
import { hasPermission } from "@/lib/permissions/permissions";
import { PEDIDO_PRIORIDADES } from "@/lib/pedidos";

export default async function DashboardNuevoPedidoPage() {
  const profile = await getCurrentProfile();

  if (!profile || !hasPermission(profile.role, "pedidos.manage")) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <PageHeader
            title="Nuevo pedido"
            description="Creación manual de pedidos internos."
          />
          <Link
            href="/dashboard/pedidos"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400"
          >
            Volver a pedidos
          </Link>
        </div>

        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-950">
          No tienes permiso para crear pedidos.
        </section>
      </div>
    );
  }

  const clientesResult = await listInternalClientes({ limit: 100 });
  const clientes: PedidoFormCliente[] = clientesResult.ok
    ? clientesResult.clientes.map((cliente) => ({
        id: cliente.id,
        name: cliente.name,
      }))
    : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Nuevo pedido"
          description="Crea un pedido manual asociado a un cliente existente."
        />
        <Link
          href="/dashboard/pedidos"
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400"
        >
          Volver a pedidos
        </Link>
      </div>

      <section className="max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        Este pedido se creará manualmente y no quedará asociado a una solicitud.
      </section>

      {!clientesResult.ok ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-950">
          {clientesResult.message}
        </section>
      ) : (
        <PedidoForm clientes={clientes} prioridades={PEDIDO_PRIORIDADES} />
      )}
    </div>
  );
}
