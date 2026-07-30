"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { InternalFormDialog } from "@/components/forms";

import {
  UserCreateForm,
  type UserCreateFormAction,
} from "./UserCreateForm";

type UserCreateDialogButtonProps = {
  createAction: UserCreateFormAction;
};

export function UserCreateDialogButton({
  createAction,
}: UserCreateDialogButtonProps) {
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
        aria-label="Nuevo usuario"
        title="Nuevo usuario"
        onClick={() => setIsOpen(true)}
      >
        <Plus className="size-5" aria-hidden="true" />
      </button>

      <InternalFormDialog
        isOpen={isOpen}
        title="Nuevo usuario"
        description="Crea el acceso del usuario y su perfil interno con una contraseña temporal."
        onClose={closeDialog}
        hasUnsavedChanges={hasUnsavedChanges}
      >
        {isOpen ? (
          <UserCreateForm
            createAction={createAction}
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
