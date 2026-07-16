"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { InternalFormDialog } from "@/components/forms";
import { Alert } from "@/components/ui/Alert";
import type { CreatePedidoActionState } from "@/app/(interno)/dashboard/pedidos/nuevo/actions";
import type { PedidoPrioridad } from "@/lib/pedidos";

import { PedidoForm, type PedidoFormCliente } from "./PedidoForm";

type PedidoCreateDialogButtonProps = {
  clientes: PedidoFormCliente[];
  prioridades: readonly PedidoPrioridad[];
  clientesLoadError?: string;
};

export function PedidoCreateDialogButton({
  clientes,
  prioridades,
  clientesLoadError,
}: PedidoCreateDialogButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setHasUnsavedChanges(false);
  }, []);

  const handleSuccess = useCallback(
    (state: CreatePedidoActionState) => {
      setHasUnsavedChanges(false);

      if (state.pedidoId) {
        router.push(`/dashboard/pedidos/${state.pedidoId}`);
        return;
      }

      setIsOpen(false);
      router.refresh();
    },
    [router],
  );

  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-(--radius-control) bg-brand-primary text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Nuevo pedido"
        title="Nuevo pedido"
        onClick={() => setIsOpen(true)}
      >
        <Plus className="size-5" aria-hidden="true" />
      </button>

      <InternalFormDialog
        isOpen={isOpen}
        title="Nuevo pedido"
        description="Crea manualmente un encargo o una impresión."
        onClose={closeDialog}
        hasUnsavedChanges={hasUnsavedChanges}
      >
        {isOpen ? (
          <div className="space-y-4">
            {clientesLoadError ? (
              <Alert variant="warning">{clientesLoadError}</Alert>
            ) : null}
            <PedidoForm
              clientes={clientes}
              prioridades={prioridades}
              compact
              onDirtyChange={setHasUnsavedChanges}
              onSuccess={handleSuccess}
            />
          </div>
        ) : null}
      </InternalFormDialog>
    </>
  );
}
