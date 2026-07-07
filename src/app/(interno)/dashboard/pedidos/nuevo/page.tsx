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
            description="Creación manual de encargos e impresiones."
          />
          <Link
            href="/dashboard/pedidos"
            className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted"
          >
            Volver a pedidos
          </Link>
        </div>

        <section className="rounded-(--radius-card) border border-danger/30 bg-danger-soft p-5 text-sm text-danger">
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
          description="Crea manualmente un encargo o una impresión, con cliente registrado o sin cliente asociado."
        />
        <Link
          href="/dashboard/pedidos"
          className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted"
        >
          Volver a pedidos
        </Link>
      </div>

      <section className="max-w-3xl rounded-(--radius-card) border border-warning/30 bg-warning-soft p-4 text-sm leading-6 text-text-primary">
        Este pedido se creará manualmente, no quedará asociado a una solicitud
        y el cliente es opcional. La impresión manual no adjunta archivos desde
        este formulario.
      </section>

      {!clientesResult.ok ? (
        <section className="rounded-(--radius-card) border border-danger/30 bg-danger-soft p-5 text-sm text-danger">
          {clientesResult.message}
        </section>
      ) : null}

      <PedidoForm clientes={clientes} prioridades={PEDIDO_PRIORIDADES} />
    </div>
  );
}
