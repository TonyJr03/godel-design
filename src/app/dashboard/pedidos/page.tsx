import Link from "next/link";

import { PageHeader } from "@/components/ui/PageHeader";
import { PlaceholderCard } from "@/components/ui/PlaceholderCard";

export default function DashboardPedidosPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Pedidos"
          description="Listado futuro de pedidos creados desde solicitudes o de forma manual."
        />
        <Link
          href="/dashboard/pedidos/nuevo"
          className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
        >
          Nuevo pedido
        </Link>
      </div>
      <PlaceholderCard
        title="Listado de pedidos futuro"
        description="Esta vista reserva el espacio del modulo de pedidos sin implementar flujo real."
      />
    </div>
  );
}
