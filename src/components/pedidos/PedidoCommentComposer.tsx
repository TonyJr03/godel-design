"use client";

import { useActionState, useEffect, useRef } from "react";
import type {
  CreatePedidoCommentActionState,
  PedidoDetailAction,
} from "@/app/(interno)/dashboard/pedidos/[id]/actions";

type PedidoCommentComposerProps = {
  createCommentAction: PedidoDetailAction<CreatePedidoCommentActionState>;
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
}: PedidoCommentComposerProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    createCommentAction,
    initialState,
  );
  const contenidoError = state.fieldErrors?.content;

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state.ok]);

  return (
    <section
      aria-labelledby="pedido-comment-composer-title"
      className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
    >
      <div>
        <h2
          id="pedido-comment-composer-title"
          className="text-lg font-semibold text-text-primary"
        >
          Agregar comentario
        </h2>
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
            htmlFor="pedido-comment-content"
            className="text-sm font-medium text-text-primary"
          >
            Comentario
          </label>
          <textarea
            id="pedido-comment-content"
            name="content"
            rows={4}
            maxLength={2000}
            required
            disabled={pending}
            defaultValue={state.values?.content ?? ""}
            aria-invalid={Boolean(contenidoError)}
            aria-describedby={
              contenidoError ? "pedido-comment-content-error" : undefined
            }
            className="mt-2 block min-h-28 w-full resize-y rounded-(--radius-control) border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary shadow-(--shadow-soft) placeholder:text-text-muted disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
          />
          {contenidoError ? (
            <p
              id="pedido-comment-content-error"
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
