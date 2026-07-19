"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Alert } from "./Alert";
import { Button } from "./Button";

export type DeleteActionState = {
  ok: boolean;
  message: string;
};

export type DeleteAction = (
  previousState: DeleteActionState,
  formData: FormData,
) => Promise<DeleteActionState>;

export type InlineDeleteConfirmationProps = {
  action: DeleteAction;
  initialState: DeleteActionState;
  title: ReactNode;
  description: ReactNode;
  confirmLabel?: string;
  pendingLabel?: string;
  children: ReactNode;
  className?: string;
  onCancel: () => void;
  onSuccess: (message: string) => void;
};

export function InlineDeleteConfirmation({
  action,
  initialState,
  title,
  description,
  confirmLabel = "Eliminar tarea",
  pendingLabel = "Eliminando tarea...",
  children,
  className,
  onCancel,
  onSuccess,
}: InlineDeleteConfirmationProps) {
  async function submitDeleteAction(
    previousState: DeleteActionState,
    formData: FormData,
  ) {
    const nextState = await action(previousState, formData);

    if (nextState.ok) {
      onSuccess(nextState.message);
    }

    return nextState;
  }

  const [state, formAction, pending] = useActionState(
    submitDeleteAction,
    initialState,
  );
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      cancelButtonRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Escape" || pending) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onCancel();
  }

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className={[
        "rounded-(--radius-control) border border-danger/30 bg-danger-soft p-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onKeyDown={handleKeyDown}
    >
      <fieldset aria-describedby={descriptionId} aria-labelledby={titleId}>
        <legend
          id={titleId}
          className="text-base font-semibold text-text-primary"
        >
          {title}
        </legend>
        <div
          id={descriptionId}
          className="mt-2 text-sm leading-6 text-text-primary"
        >
          {description}
        </div>

        {state.message && !state.ok ? (
          <Alert variant="danger" title="No se pudo eliminar" className="mt-3">
            <p>{state.message}</p>
          </Alert>
        ) : null}

        {children}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-[background-color,border-color,color,filter] duration-200 hover:bg-surface-muted active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
