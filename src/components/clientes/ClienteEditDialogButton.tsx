"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { InternalFormDialog } from "@/components/forms";
import type { InternalClienteDetail } from "@/lib/clientes";

import { ClienteEditForm } from "./ClienteEditForm";

type ClienteEditDialogButtonProps = {
  cliente: InternalClienteDetail;
};

export function ClienteEditDialogButton({
  cliente,
}: ClienteEditDialogButtonProps) {
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
        className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-(--radius-control) bg-brand-primary text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Editar cliente"
        title="Editar cliente"
        onClick={() => setIsOpen(true)}
      >
        <Pencil className="size-5" aria-hidden="true" />
      </button>

      <InternalFormDialog
        isOpen={isOpen}
        title="Editar cliente"
        description="Actualiza los datos básicos del cliente."
        onClose={closeDialog}
        hasUnsavedChanges={hasUnsavedChanges}
      >
        {isOpen ? (
          <ClienteEditForm
            cliente={cliente}
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
