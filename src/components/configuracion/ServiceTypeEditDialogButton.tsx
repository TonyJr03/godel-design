"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { InternalFormDialog } from "@/components/forms";
import type { InternalServiceType } from "@/lib/service-types";

import { ServiceTypeForm } from "./ServiceTypeForm";

type ServiceTypeEditDialogButtonProps = {
  serviceType: InternalServiceType;
  isLastPublicEncargo?: boolean;
};

export function ServiceTypeEditDialogButton({
  serviceType,
  isLastPublicEncargo = false,
}: ServiceTypeEditDialogButtonProps) {
  const router = useRouter();
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
        className="inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-(--radius-control) bg-brand-primary text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`Editar servicio ${serviceType.name}`}
        title={`Editar servicio ${serviceType.name}`}
        onClick={() => setIsOpen(true)}
      >
        <Pencil className="size-4" aria-hidden="true" />
      </button>

      <InternalFormDialog
        isOpen={isOpen}
        title="Editar servicio"
        description="Actualiza nombre, descripción y disponibilidad pública."
        onClose={closeDialog}
        hasUnsavedChanges={hasUnsavedChanges}
      >
        {isOpen ? (
          <ServiceTypeForm
            mode="edit"
            serviceType={serviceType}
            isLastPublicEncargo={isLastPublicEncargo}
            onDirtyChange={setHasUnsavedChanges}
            onSuccess={() => {
              setHasUnsavedChanges(false);
              setIsOpen(false);
              router.refresh();
            }}
          />
        ) : null}
      </InternalFormDialog>
    </>
  );
}
