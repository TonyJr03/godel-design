"use client";

import { useActionState, useEffect, useRef } from "react";
import type {
  CreatePedidoCommentActionState,
  PedidoDetailAction,
} from "@/app/dashboard/pedidos/[id]/actions";
import type { PedidoComment } from "@/lib/pedidos";
import { ROLE_SHORT_LABELS } from "@/lib/permissions";
import { formatAppDateTime } from "@/lib/utils";

type PedidoCommentsSectionProps = {
  createCommentAction: PedidoDetailAction<CreatePedidoCommentActionState>;
  comments: PedidoComment[];
  loadError?: string;
};

const initialState: CreatePedidoCommentActionState = {
  ok: false,
  message: "",
  values: {
    content: "",
  },
};

function getAuthorName(comment: PedidoComment): string {
  return comment.author?.full_name?.trim() || "Usuario interno";
}

function getAuthorRole(comment: PedidoComment): string {
  return comment.author?.role
    ? ROLE_SHORT_LABELS[comment.author.role]
    : "Equipo";
}

export function PedidoCommentsSection({
  createCommentAction,
  comments,
  loadError,
}: PedidoCommentsSectionProps) {
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
    <section className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          Comentarios internos
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Estos comentarios son visibles solo para el equipo interno con acceso
          al pedido.
        </p>
      </div>

      {loadError ? (
        <p className="mt-5 rounded-(--radius-control) border border-danger/30 bg-danger-soft px-4 py-3 text-sm leading-6 text-danger">
          {loadError}
        </p>
      ) : null}

      {comments.length > 0 ? (
        <ul className="mt-5 space-y-4">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-(--radius-control) border border-border bg-surface-muted px-4 py-3"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary">
                    {getAuthorName(comment)}
                  </p>
                  <span className="inline-flex rounded-(--radius-control) border border-border bg-surface px-2 py-1 text-xs font-semibold text-text-secondary">
                    {getAuthorRole(comment)}
                  </span>
                </div>
                <time
                  dateTime={comment.created_at}
                  className="text-xs leading-5 text-text-muted"
                >
                  {formatAppDateTime(comment.created_at)}
                </time>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-text-primary">
                {comment.content}
              </p>
            </li>
          ))}
        </ul>
      ) : !loadError ? (
        <p className="mt-5 rounded-(--radius-control) border border-dashed border-border-strong bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
          Todavía no hay comentarios internos en este pedido.
        </p>
      ) : null}

      <form
        ref={formRef}
        action={formAction}
        aria-busy={pending}
        className="mt-6 border-t border-border pt-5"
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
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {pending ? "Agregando..." : "Agregar comentario"}
        </button>
      </form>
    </section>
  );
}
