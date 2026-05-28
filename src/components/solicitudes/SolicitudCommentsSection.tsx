"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  createSolicitudCommentAction,
  type CreateSolicitudCommentActionState,
} from "@/app/dashboard/solicitudes/[id]/actions";
import type { SolicitudComment } from "@/lib/solicitudes";
import { formatAppDateTime } from "@/lib/utils";

type SolicitudCommentsSectionProps = {
  solicitudId: string;
  comments: SolicitudComment[];
  loadError?: string;
};

const initialState: CreateSolicitudCommentActionState = {
  ok: false,
  message: "",
  values: {
    contenido: "",
  },
};

const ROLE_LABELS: Record<
  NonNullable<SolicitudComment["author"]>["role"],
  string
> = {
  admin: "Admin",
  supervisor: "Supervisor",
  trabajador: "Trabajador",
};

function getAuthorName(comment: SolicitudComment): string {
  return comment.author?.full_name?.trim() || "Usuario interno";
}

function getAuthorRole(comment: SolicitudComment): string {
  return comment.author?.role ? ROLE_LABELS[comment.author.role] : "Equipo";
}

export function SolicitudCommentsSection({
  solicitudId,
  comments,
  loadError,
}: SolicitudCommentsSectionProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    createSolicitudCommentAction,
    initialState,
  );
  const contenidoError = state.fieldErrors?.contenido;

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state.ok]);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-zinc-950">
          Comentarios internos
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Estos comentarios son visibles solo para el equipo interno con acceso
          a la solicitud.
        </p>
      </div>

      {loadError ? (
        <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900">
          {loadError}
        </p>
      ) : null}

      {comments.length > 0 ? (
        <ul className="mt-5 space-y-4">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-zinc-950">
                    {getAuthorName(comment)}
                  </p>
                  <span className="inline-flex rounded-md bg-white px-2 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-inset ring-zinc-200">
                    {getAuthorRole(comment)}
                  </span>
                </div>
                <time
                  dateTime={comment.created_at}
                  className="text-xs leading-5 text-zinc-500"
                >
                  {formatAppDateTime(comment.created_at)}
                </time>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-700">
                {comment.contenido}
              </p>
            </li>
          ))}
        </ul>
      ) : !loadError ? (
        <p className="mt-5 rounded-md border border-dashed border-zinc-300 px-4 py-3 text-sm leading-6 text-zinc-600">
          Todavía no hay comentarios internos en esta solicitud.
        </p>
      ) : null}

      <form
        ref={formRef}
        action={formAction}
        aria-busy={pending}
        className="mt-6 border-t border-zinc-200 pt-5"
      >
        <input type="hidden" name="solicitud_id" value={solicitudId} />

        {state.message ? (
          <div
            className={
              state.ok
                ? "rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-900"
                : "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900"
            }
            role={state.ok ? "status" : "alert"}
            aria-live="polite"
          >
            {state.message}
          </div>
        ) : null}

        <div className="mt-4">
          <label
            htmlFor="solicitud-comment-content"
            className="text-sm font-medium text-zinc-900"
          >
            Comentario
          </label>
          <textarea
            id="solicitud-comment-content"
            name="contenido"
            rows={4}
            maxLength={2000}
            required
            disabled={pending}
            defaultValue={state.values?.contenido ?? ""}
            aria-invalid={Boolean(contenidoError)}
            aria-describedby={
              contenidoError ? "solicitud-comment-content-error" : undefined
            }
            className="mt-2 block w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
          />
          {contenidoError ? (
            <p
              id="solicitud-comment-content-error"
              className="mt-2 text-sm leading-5 text-red-700"
            >
              {contenidoError}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {pending ? "Agregando..." : "Agregar comentario"}
        </button>
      </form>
    </section>
  );
}
