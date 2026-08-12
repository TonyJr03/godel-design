"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import type { ExpiredUploadsCleanupActionState } from "@/app/(interno)/dashboard/configuracion/mantenimiento/actions";
import { InternalFormDialog } from "@/components/forms";
import { Alert, Button } from "@/components/ui";

const INITIAL_STATE: ExpiredUploadsCleanupActionState = {
  ok: false,
  message: "",
};

type ExpiredUploadsCleanupActionProps = {
  cleanupAction: (
    previousState: ExpiredUploadsCleanupActionState,
    formData: FormData,
  ) => Promise<ExpiredUploadsCleanupActionState>;
};

const countLabels = [
  ["expiredSessions", "Sesiones expiradas"],
  ["partialSessions", "Sesiones parciales"],
  ["completedSessions", "Sesiones completadas defensivamente"],
  ["expiredItems", "Items expirados"],
  ["candidatesFound", "Archivos temporales detectados"],
  ["objectsDeleted", "Archivos eliminados"],
] as const;

export function ExpiredUploadsCleanupAction({
  cleanupAction,
}: ExpiredUploadsCleanupActionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    cleanupAction,
    INITIAL_STATE,
  );

  const hasCounts = countLabels.some(
    ([key]) => typeof state[key] === "number",
  );

  return (
    <>
      <Button
        type="button"
        variant="danger"
        onClick={() => setIsOpen(true)}
      >
        <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
        Limpiar cargas expiradas
      </Button>

      <InternalFormDialog
        isOpen={isOpen}
        title="Confirmar mantenimiento"
        description="Esta operación elimina archivos temporales que ya no son necesarios."
        onClose={() => {
          if (!pending) {
            setIsOpen(false);
          }
        }}
      >
        <form action={formAction} aria-busy={pending} className="space-y-5">
          <p className="text-sm leading-6 text-text-secondary">
            Confirma que deseas ejecutar la limpieza manual de cargas expiradas.
          </p>

          {state.message ? (
            <Alert
              variant={state.ok ? "success" : "danger"}
              title={state.ok ? "Resultado" : "No se pudo completar"}
            >
              <p>{state.message}</p>
            </Alert>
          ) : null}

          {hasCounts ? (
            <dl className="grid gap-3 rounded-(--radius-control) border border-border bg-surface-muted p-4 sm:grid-cols-2">
              {countLabels.map(([key, label]) => (
                <div key={key} className="flex items-baseline justify-between gap-4">
                  <dt className="text-sm text-text-secondary">{label}</dt>
                  <dd className="text-lg font-semibold text-text-primary">
                    {state[key] ?? 0}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setIsOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Ejecutando mantenimiento..." : "Confirmar mantenimiento"}
            </Button>
          </div>
        </form>
      </InternalFormDialog>
    </>
  );
}
