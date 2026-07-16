"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { InternalFormDialog } from "@/components/forms";
import type { TaskTemplateDetail } from "@/lib/task-templates";

import { TaskTemplateForm } from "./TaskTemplateForm";

type TaskTemplateEditDialogButtonProps = {
  template: TaskTemplateDetail;
};

export function TaskTemplateEditDialogButton({
  template,
}: TaskTemplateEditDialogButtonProps) {
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
        aria-label="Editar plantilla"
        title="Editar plantilla"
        onClick={() => setIsOpen(true)}
      >
        <Pencil className="size-5" aria-hidden="true" />
      </button>

      <InternalFormDialog
        isOpen={isOpen}
        title="Editar plantilla"
        description="Actualiza el nombre, descripción y estado de la plantilla."
        onClose={closeDialog}
        hasUnsavedChanges={hasUnsavedChanges}
      >
        {isOpen ? (
          <TaskTemplateForm
            mode="edit"
            layout="inline"
            template={template}
            includeStatus
            compact
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
