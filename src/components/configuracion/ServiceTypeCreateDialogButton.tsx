"use client";

import { Plus } from "lucide-react";
import { useCallback, useState } from "react";

import { InternalFormDialog } from "@/components/forms";

import { ServiceTypeForm } from "./ServiceTypeForm";

export function ServiceTypeCreateDialogButton() {
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
        aria-label="Nuevo servicio"
        title="Nuevo servicio"
        onClick={() => setIsOpen(true)}
      >
        <Plus className="size-5" aria-hidden="true" />
      </button>

      <InternalFormDialog
        isOpen={isOpen}
        title="Nuevo servicio"
        description="Crea un servicio público o interno para el catálogo."
        onClose={closeDialog}
        hasUnsavedChanges={hasUnsavedChanges}
      >
        {isOpen ? (
          <ServiceTypeForm
            mode="create"
            onDirtyChange={setHasUnsavedChanges}
            onSuccess={() => {
              setHasUnsavedChanges(false);
              setIsOpen(false);
              // TD-NEXT-001: fallback temporal para navegación same-route en self-hosted.
              window.location.assign("/dashboard/configuracion/servicios");
            }}
          />
        ) : null}
      </InternalFormDialog>
    </>
  );
}
