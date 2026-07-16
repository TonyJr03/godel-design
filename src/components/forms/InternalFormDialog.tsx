"use client";

import { X } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
} from "react";

export type InternalFormDialogProps = {
  isOpen: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  hasUnsavedChanges?: boolean;
};

function shouldCloseWithUnsavedChanges(hasUnsavedChanges?: boolean) {
  if (!hasUnsavedChanges) {
    return true;
  }

  return window.confirm(
    "Hay cambios sin guardar. ¿Quieres cerrar de todos modos?",
  );
}

export function InternalFormDialog({
  isOpen,
  title,
  description,
  children,
  onClose,
  closeLabel = "Cerrar",
  initialFocusRef,
  hasUnsavedChanges = false,
}: InternalFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const bodyOverflowRef = useRef<string | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const requestClose = useCallback(() => {
    if (!shouldCloseWithUnsavedChanges(hasUnsavedChanges)) {
      return;
    }

    onClose();
  }, [hasUnsavedChanges, onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (isOpen && !dialog.open) {
      const activeElement = document.activeElement;
      returnFocusRef.current =
        activeElement instanceof HTMLElement ? activeElement : null;
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      if (bodyOverflowRef.current !== null) {
        document.body.style.overflow = bodyOverflowRef.current;
        bodyOverflowRef.current = null;
      }

      return;
    }

    bodyOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frameId = window.requestAnimationFrame(() => {
      const focusTarget = initialFocusRef?.current ?? titleRef.current;
      focusTarget?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frameId);

      if (bodyOverflowRef.current !== null) {
        document.body.style.overflow = bodyOverflowRef.current;
        bodyOverflowRef.current = null;
      }

      const returnTarget = returnFocusRef.current;
      returnFocusRef.current = null;
      returnTarget?.focus({ preventScroll: true });
    };
  }, [initialFocusRef, isOpen]);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement, Event>) {
    event.preventDefault();
    requestClose();
  }

  function handleNativeClose() {
    if (isOpen) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className="fixed inset-0 m-auto hidden max-h-[min(92dvh,42rem)] w-[min(calc(100vw-1.5rem),40rem)] max-w-none overflow-hidden whitespace-normal rounded-(--radius-card) border border-border bg-surface p-0 text-left text-text-primary shadow-(--shadow-soft) backdrop:bg-text-primary/35 open:flex"
      onCancel={handleCancel}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
      onClose={handleNativeClose}
    >
      <div className="flex min-h-0 w-full flex-col whitespace-normal text-left">
        <header className="shrink-0 border-b border-border bg-surface-raised px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                ref={titleRef}
                id={titleId}
                tabIndex={-1}
                className="text-lg font-semibold text-text-primary outline-none"
              >
                {title}
              </h2>
              {description ? (
                <p
                  id={descriptionId}
                  className="mt-1 text-sm leading-6 text-text-secondary"
                >
                  {description}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm font-semibold text-text-primary transition-colors duration-200 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
              onClick={requestClose}
            >
              {closeLabel}
              <X aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </dialog>
  );
}
