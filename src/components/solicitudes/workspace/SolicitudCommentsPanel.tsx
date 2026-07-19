import { ReadErrorAlert } from "@/components/ui";
import { ROLE_SHORT_LABELS } from "@/lib/permissions";
import type { SolicitudComment } from "@/lib/solicitudes";
import { formatAppDateTime } from "@/lib/utils";

type SolicitudCommentsPanelProps = {
  comments: readonly SolicitudComment[];
  loadError?: string;
  loadErrorRetryable?: boolean;
};

function getAuthorName(comment: SolicitudComment): string {
  return comment.author?.full_name?.trim() || "Usuario interno";
}

function getAuthorRole(comment: SolicitudComment): string {
  return comment.author?.role
    ? ROLE_SHORT_LABELS[comment.author.role]
    : "Equipo";
}

export function SolicitudCommentsPanel({
  comments,
  loadError,
  loadErrorRetryable = false,
}: SolicitudCommentsPanelProps) {
  if (loadError) {
    return (
      <ReadErrorAlert
        variant="warning"
        title="No se pudieron cargar los comentarios"
        retryable={loadErrorRetryable}
      >
        <p>{loadError}</p>
      </ReadErrorAlert>
    );
  }

  if (comments.length === 0) {
    return (
      <p className="rounded-(--radius-control) border border-dashed border-border-strong bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
        Todavía no hay comentarios internos en esta solicitud.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
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
  );
}
