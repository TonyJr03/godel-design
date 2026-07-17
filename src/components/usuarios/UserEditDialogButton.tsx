"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { InternalFormDialog } from "@/components/forms";
import type { InternalUserDetail } from "@/lib/usuarios";

import { UserEditForm, type UserEditFormAction } from "./UserEditForm";

type UserEditDialogButtonProps = {
  user: InternalUserDetail;
  updateAction: UserEditFormAction;
};

export function UserEditDialogButton({
  user,
  updateAction,
}: UserEditDialogButtonProps) {
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
        className="inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface text-text-primary transition-colors duration-200 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`Editar usuario ${user.full_name}`}
        title="Editar usuario"
        onClick={() => setIsOpen(true)}
      >
        <Pencil className="size-4" aria-hidden="true" />
      </button>

      <InternalFormDialog
        isOpen={isOpen}
        title="Editar usuario"
        description="Actualiza el perfil interno del usuario."
        onClose={closeDialog}
        hasUnsavedChanges={hasUnsavedChanges}
      >
        {isOpen ? (
          <UserEditForm
            user={user}
            updateAction={updateAction}
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
