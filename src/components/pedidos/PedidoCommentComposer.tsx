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
  const Heading = isPanel ? "h3" : "h2";

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state.ok]);

  return (
    <section
      aria-labelledby={titleId}
      className={
        isPanel
          ? "min-w-0"
          : "rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
      }
    >
      <div>
        <Heading
          id={titleId}
          className={
            isPanel
              ? "text-base font-semibold text-text-primary"
              : "text-lg font-semibold text-text-primary"
          }
        >
          Agregar comentario
        </Heading>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Registra una nota interna para el equipo que trabaja en este pedido.
        </p>
      </div>

      <form
        ref={formRef}
        action={formAction}
        aria-busy={pending}
        className="mt-5"
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

        <div className="mt-4">
          <label
            htmlFor={textareaId}
            className="text-sm font-medium text-text-primary"
          >
            Comentario
          </label>
          <textarea
            id={textareaId}
            name="content"
            rows={4}
            maxLength={2000}
            required
            disabled={pending}
            defaultValue={state.values?.content ?? ""}
            aria-invalid={Boolean(contenidoError)}
            aria-describedby={
              contenidoError ? errorId : undefined
            }
            className="mt-2 block min-h-28 w-full resize-y rounded-(--radius-control) border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary shadow-(--shadow-soft) placeholder:text-text-muted disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
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
          className="mt-4 inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {pending ? "Agregando..." : "Agregar comentario"}
        </button>
      </form>
    </section>
  );
}
