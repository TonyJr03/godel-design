"use client";

import { useActionState, useEffect, useRef } from "react";
import type {
  CreatePedidoCommentActionState,
  PedidoDetailAction,
} from "@/app/(interno)/dashboard/pedidos/[id]/actions";

type PedidoCommentComposerProps = {
  createCommentAction: PedidoDetailAction<CreatePedidoCommentActionState>;
  presentation?: "card" | "panel";
};

const initialState: CreatePedidoCommentActionState = {
  ok: false,
  message: "",
  values: {
    content: "",
  },
};

export function PedidoCommentComposer({
  createCommentAction,
  presentation = "card",
}: PedidoCommentComposerProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [state, formAction, pending] = useActionState(
    createCommentAction,
    initialState,
  );
  const contenidoError = state.fieldErrors?.content;
  const isPanel = presentation === "panel";
  const titleId = isPanel
    ? "pedido-comment-composer-panel-title"
    : "pedido-comment-composer-title";
  const textareaId = isPanel
    ? "pedido-comment-content-panel"
    : "pedido-comment-content";
  const errorId = isPanel
    ? "pedido-comment-content-panel-error"
    : "pedido-comment-content-error";

  function resizeTextarea(textarea: HTMLTextAreaElement) {
    const maxHeight = 144;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    formRef.current?.reset();

    if (isPanel && textareaRef.current) {
      textareaRef.current.style.height = "";
      textareaRef.current.style.overflowY = "hidden";
    }
  }, [state.ok, isPanel]);

  return (
    <section
      aria-labelledby={titleId}
      className={
        isPanel
          ? "min-w-0"
          : "rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
      }
    >
      {isPanel ? (
        <h3
          id={titleId}
          className="text-sm font-semibold text-text-primary"
        >
          Comenta
        </h3>
      ) : (
        <div>
          <h2
            id={titleId}
            className="text-lg font-semibold text-text-primary"
          >
            Agregar comentario
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Registra una nota interna para el equipo que trabaja en este pedido.
          </p>
        </div>
      )}

      <form
        ref={formRef}
        action={formAction}
        aria-busy={pending}
        className={isPanel ? "mt-3" : "mt-5"}
      >
        {state.message ? (
          <div
            className={
              state.ok
                ? "rounded-(--radius-control) border border-success/30 bg-success-soft px-4 py-3 text-sm leading-6 text-success"
                : "rounded-(--radius-control) border border-danger/30 bg-danger-soft px-4 py-3 text-sm leading-6 text-danger"
            }
            role={state.ok ? "status" : "alert"}
            aria-live="polite"
          >
            {state.message}
          </div>
        ) : null}

        <div
          className={[
            state.message || !isPanel ? "mt-4" : "",
            isPanel ? "flex flex-col gap-3 sm:flex-row sm:items-end" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className={isPanel ? "flex-1" : ""}>
            <label
              htmlFor={textareaId}
              className={
                isPanel
                  ? "sr-only"
                  : "text-sm font-medium text-text-primary"
              }
            >
              Comentario
            </label>
            <textarea
              ref={textareaRef}
              id={textareaId}
              name="content"
              rows={isPanel ? 1 : 4}
              maxLength={2000}
              required
              disabled={pending}
              defaultValue={state.values?.content ?? ""}
              onInput={(event) => {
                if (isPanel) {
                  resizeTextarea(event.currentTarget);
                }
              }}
              aria-invalid={Boolean(contenidoError)}
              aria-describedby={contenidoError ? errorId : undefined}
              className={[
                "block w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary shadow-(--shadow-soft) placeholder:text-text-muted disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted",
                isPanel
                  ? "min-h-11 max-h-36 resize-none overflow-hidden"
                  : "mt-2 min-h-28 resize-y",
              ].join(" ")}
            />
            {contenidoError ? (
              <p
                id={errorId}
                className="mt-2 text-sm leading-5 text-danger"
              >
                {contenidoError}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={pending}
            className={[
              "inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto",
              isPanel ? "" : "mt-4",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {pending ? "Agregando..." : "Agregar comentario"}
          </button>
        </div>
      </form>
    </section>
  );
}
