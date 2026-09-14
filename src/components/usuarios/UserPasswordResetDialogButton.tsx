"use client";

import { KeyRound } from "lucide-react";
import { useCallback, useState } from "react";

import { InternalFormDialog } from "@/components/forms";
import type { InternalUserDetail } from "@/lib/usuarios";

import {
  UserPasswordResetForm,
  type UserPasswordResetFormAction,
} from "./UserPasswordResetForm";

type UserPasswordResetDialogButtonProps = {
  user: InternalUserDetail;
  resetAction: UserPasswordResetFormAction;
};

export function UserPasswordResetDialogButton({
  user,
  resetAction,
}: UserPasswordResetDialogButtonProps) {
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
        aria-label={`Restablecer contraseña de ${user.full_name}`}
        title="Restablecer contraseña"
        onClick={() => setIsOpen(true)}
      >
        <KeyRound className="size-4" aria-hidden="true" />
      </button>

      <InternalFormDialog
        isOpen={isOpen}
        title="Restablecer contraseña"
        description="Asigna una nueva contraseña temporal a este usuario."
        onClose={closeDialog}
        hasUnsavedChanges={hasUnsavedChanges}
      >
        {isOpen ? (
          <UserPasswordResetForm
            user={user}
            resetAction={resetAction}
            onDirtyChange={setHasUnsavedChanges}
            onSuccess={() => {
              setHasUnsavedChanges(false);
              setIsOpen(false);
              // TD-NEXT-001: fallback temporal para navegación same-route en self-hosted.
              window.location.assign("/dashboard/configuracion/usuarios");
            }}
          />
        ) : null}
      </InternalFormDialog>
    </>
  );
}
