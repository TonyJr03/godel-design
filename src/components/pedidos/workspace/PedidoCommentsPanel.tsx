import { Alert } from "@/components/ui";
import type { PedidoComment } from "@/lib/pedidos";
import { ROLE_SHORT_LABELS } from "@/lib/permissions";
import { formatAppDateTime } from "@/lib/utils";

type PedidoCommentsPanelProps = {
  comments: readonly PedidoComment[];
  loadError?: string;
};

function getAuthorName(comment: PedidoComment): string {
  return comment.author?.full_name?.trim() || "Usuario interno";
}

function getAuthorRole(comment: PedidoComment): string {
  return comment.author?.role
    ? ROLE_SHORT_LABELS[comment.author.role]
    : "Equipo";
}

export function PedidoCommentsPanel({
  comments,
  loadError,
}: PedidoCommentsPanelProps) {
  return (
    <div>
      {loadError ? (
        <Alert variant="danger">
          {loadError}
        </Alert>
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
    </div>
  );
}
