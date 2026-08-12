"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { InternalFormDialog } from "@/components/forms";
import { Alert } from "@/components/ui";
import type { PedidoPrioridad } from "@/lib/pedidos";
import type { OperationalServiceType } from "@/lib/service-types";

import { PedidoForm } from "./PedidoForm";

type PedidoCreateDialogButtonProps = {
  prioridades: readonly PedidoPrioridad[];
  serviceTypes: OperationalServiceType[];
  serviceTypesLoadError?: string;
};

export function PedidoCreateDialogButton({
  prioridades,
  serviceTypes,
  serviceTypesLoadError,
}: PedidoCreateDialogButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setHasUnsavedChanges(false);
  }, []);

  const handleSuccess = useCallback(() => {
    setHasUnsavedChanges(false);
    setIsOpen(false);
    window.location.assign("/dashboard/pedidos");
  }, []);

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
            {serviceTypesLoadError ? (
              <Alert
                variant="warning"
                title="No se pudo cargar el catálogo de servicios"
              >
                <div className="space-y-3">
                  <p>{serviceTypesLoadError}</p>
                  <Link
                    href="/dashboard/pedidos"
                    className="inline-flex min-h-10 items-center text-sm font-semibold text-brand-primary underline underline-offset-4"
                  >
                    Reintentar
                  </Link>
                </div>
              </Alert>
            ) : serviceTypes.length === 0 ? (
              <Alert
                variant="warning"
                title="Creación temporalmente no disponible"
              >
                No hay servicios disponibles para crear pedidos.
              </Alert>
            ) : (
              <PedidoForm
                prioridades={prioridades}
                serviceTypes={serviceTypes}
                onDirtyChange={setHasUnsavedChanges}
                onSuccess={handleSuccess}
              />
            )}
          </div>
        ) : null}
      </InternalFormDialog>
    </>
  );
}
