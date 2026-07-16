import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ROLE_LABELS } from "@/lib/permissions";
import type { InternalUser } from "@/lib/usuarios";

import { UserEditDialogButton } from "./UserEditDialogButton";
import type { UserEditFormAction } from "./UserEditForm";

type InternalUsersListProps = {
  users: InternalUser[];
  getUpdateAction: (userId: string) => UserEditFormAction;
  emptyMessage?: string;
  hasActiveFilters?: boolean;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string | null): string {
  if (!value) {
    return "No definida";
  }

  return DATE_FORMATTER.format(new Date(value));
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 2);

  if (words.length === 0) {
    return "US";
  }

  return words.map((word) => word[0]?.toUpperCase() ?? "").join("") || "US";
}

function UserIdentity({ user }: { user: InternalUser }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-(--radius-control) bg-brand-primary-hover text-xs font-semibold text-white">
        {getInitials(user.full_name)}
      </div>
      <div className="min-w-0">
        <div className="truncate font-semibold text-text-primary">
          {user.full_name}
        </div>
        <div className="mt-1 break-all font-mono text-xs text-text-muted">
          {user.id}
        </div>
      </div>
    </div>
  );
}

export function InternalUsersList({
  users,
  getUpdateAction,
  emptyMessage = "No hay perfiles internos para mostrar.",
  hasActiveFilters = false,
}: InternalUsersListProps) {
  if (users.length === 0) {
    return (
      <EmptyState
        variant={hasActiveFilters ? "search" : "default"}
        title={
          hasActiveFilters
            ? "Sin resultados para estos filtros"
            : "No hay usuarios para mostrar"
        }
        description={emptyMessage}
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 xl:hidden" aria-label="Usuarios internos">
        {users.map((user) => (
          <article
            key={user.id}
            className="space-y-4 overflow-hidden rounded-(--radius-card) border border-border bg-surface p-4 shadow-(--shadow-soft)"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <UserIdentity user={user} />
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={user.is_active ? "activo" : "inactivo"} />
                <UserEditDialogButton
                  user={user}
                  updateAction={getUpdateAction(user.id)}
                />
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Rol
                </dt>
                <dd className="mt-1 text-text-primary">
                  {ROLE_LABELS[user.role]}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Teléfono
                </dt>
                <dd className="mt-1 text-text-primary">
                  {user.phone?.trim() || "Sin teléfono"}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Actualización
                </dt>
                <dd className="mt-1 text-text-primary">
                  {formatDate(user.updated_at)}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-(--radius-card) border border-border bg-surface shadow-(--shadow-soft) xl:block">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-border text-sm">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[13%]" />
              <col className="w-[15%]" />
              <col className="w-[12%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[4%]" />
            </colgroup>
            <thead className="bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Usuario
                </th>
                <th scope="col" className="px-4 py-3">
                  Rol
                </th>
                <th scope="col" className="px-4 py-3">
                  Teléfono
                </th>
                <th scope="col" className="px-4 py-3">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3">
                  Creación
                </th>
                <th scope="col" className="px-4 py-3">
                  Actualización
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {users.map((user) => (
                <tr key={user.id} className="align-top">
                  <td className="px-4 py-4">
                    <UserIdentity user={user} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    {ROLE_LABELS[user.role]}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    <div className="truncate">
                      {user.phone?.trim() || "Sin teléfono"}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <StatusBadge
                      status={user.is_active ? "activo" : "inactivo"}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    {formatDate(user.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    {formatDate(user.updated_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right">
                    <UserEditDialogButton
                      user={user}
                      updateAction={getUpdateAction(user.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
