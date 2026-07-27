"use client";

import { X } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
  useEffect,
  useId,
  useRef,
} from "react";

import type { WorkspacePanelContentMode } from "./types";

type WorkspaceContextDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  isOpen: boolean;
  title: string;
  description?: string;
  contentMode?: WorkspacePanelContentMode;
  showBackButton: boolean;
  children: ReactNode;
  onBack: () => void;
  onRequestClose: () => void;
  onNativeClose: () => void;
  onCancel: (event: SyntheticEvent<HTMLDialogElement, Event>) => void;
};

export function WorkspaceContextDialog({
  dialogRef,
  isOpen,
  title,
  description,
  contentMode = "scroll",
  showBackButton,
  children,
  onBack,
  onRequestClose,
  onNativeClose,
  onCancel,
}: WorkspaceContextDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (dialogRef.current?.open) {
        titleRef.current?.focus({ preventScroll: true });
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [dialogRef, isOpen, title]);

  return (
    <dialog
      ref={dialogRef}
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className="fixed inset-x-0 bottom-0 top-auto m-0 hidden max-h-[min(88dvh,42rem)] w-full max-w-none flex-col overflow-hidden rounded-t-(--radius-card) border border-border bg-surface p-0 text-text-primary shadow-(--shadow-soft) backdrop:bg-text-primary/35 open:flex md:inset-y-0 md:left-auto md:right-0 md:my-0 md:ml-auto md:mr-0 md:h-dvh md:max-h-dvh md:w-[min(30rem,calc(100vw-2rem))] md:rounded-l-(--radius-card) md:rounded-tr-none md:border-y-0 md:border-r-0"
      onCancel={onCancel}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onRequestClose();
        }
      }}
      onClose={onNativeClose}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-border bg-surface-raised px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {showBackButton ? (
                <button
                  type="button"
                  className="mb-3 inline-flex min-h-11 cursor-pointer items-center rounded-(--radius-control) border border-border bg-surface px-3 text-sm font-semibold text-brand-primary transition-colors duration-200 hover:bg-brand-primary-soft"
                  onClick={onBack}
                >
                  Volver
                </button>
              ) : null}
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
              className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm font-semibold text-text-primary transition-colors duration-200 hover:bg-surface-muted"
              onClick={onRequestClose}
            >
              Cerrar
              <X aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </header>

        <div
          className={
            contentMode === "fill"
              ? "flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-5 sm:px-5"
              : "min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5"
          }
        >
          <div
            className={
              contentMode === "fill" ? "min-h-0 flex-1" : "min-w-0"
            }
          >
            {children}
          </div>
        </div>
      </div>
    </dialog>
  );
}
