"use client";

import { Pencil } from "lucide-react";
import { useCallback, useState } from "react";

import type {
  PedidoDetailAction,
  UpdatePedidoDataActionState,
} from "@/app/(interno)/dashboard/pedidos/[id]/actions";
import { InternalFormDialog } from "@/components/forms";
import type { InternalPedidoDetail } from "@/lib/pedidos/get-internal-pedido-detail-types";
import type { OperationalServiceType } from "@/lib/service-types";

import { PedidoEditForm } from "./PedidoEditForm";

type PedidoEditDialogButtonProps = {
  pedido: InternalPedidoDetail;
  action: PedidoDetailAction<UpdatePedidoDataActionState>;
  serviceTypes: OperationalServiceType[];
  serviceTypesLoadError?: string;
};

export function PedidoEditDialogButton({
  pedido,
  action,
  serviceTypes,
  serviceTypesLoadError,
}: PedidoEditDialogButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setHasUnsavedChanges(false);
  }, []);

  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-(--radius-control) bg-brand-primary text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Editar pedido"
        title="Editar pedido"
        onClick={() => setIsOpen(true)}
      >
        <Pencil className="size-5" aria-hidden="true" />
      </button>

      <InternalFormDialog
        isOpen={isOpen}
        title="Editar pedido"
        description="Actualiza el servicio, los datos básicos y el precio del pedido."
        onClose={closeDialog}
        hasUnsavedChanges={hasUnsavedChanges}
      >
        {isOpen ? (
          <PedidoEditForm
            pedido={pedido}
            action={action}
            serviceTypes={serviceTypes}
            serviceTypesLoadError={serviceTypesLoadError}
            onDirtyChange={setHasUnsavedChanges}
            onSuccess={() => {
              setHasUnsavedChanges(false);
              setIsOpen(false);
              // TD-NEXT-001: fallback temporal para navegación same-route en self-hosted.
              window.location.assign(`/dashboard/pedidos/${pedido.id}`);
            }}
          />
        ) : null}
      </InternalFormDialog>
    </>
  );
}
