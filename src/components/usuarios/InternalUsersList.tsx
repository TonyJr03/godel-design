import Link from "next/link";
import type { InternalUser, InternalUserActiveFilter } from "@/lib/usuarios";
import { ROLE_LABELS } from "@/lib/permissions";

type InternalUsersListProps = {
  users: InternalUser[];
  emptyMessage?: string;
};

const ACTIVE_LABELS: Record<`${InternalUserActiveFilter}`, string> = {
  true: "Activo",
  false: "Inactivo",
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

export function InternalUsersList({
  users,
  emptyMessage = "No hay perfiles internos para mostrar.",
}: InternalUsersListProps) {
  if (users.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">
          No hay usuarios para mostrar
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-100 text-left text-xs font-semibold uppercase text-zinc-600">
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
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white">
            {users.map((user) => (
              <tr key={user.id} className="align-top">
                <td className="px-4 py-4">
                  <div className="flex min-w-56 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-xs font-semibold text-white">
                      {getInitials(user.full_name)}
                    </div>
                    <div>
                      <div className="font-semibold text-zinc-950">
                        {user.full_name}
                      </div>
                      <div className="mt-1 font-mono text-xs text-zinc-500">
                        {user.id.slice(0, 8).toUpperCase()}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-zinc-700">
                  {ROLE_LABELS[user.role]}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-zinc-700">
                  {user.phone?.trim() || "Sin teléfono"}
                </td>
                <td className="whitespace-nowrap px-4 py-4">
                  <span
                    className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
                      user.is_active
                        ? "bg-emerald-50 text-emerald-800 ring-emerald-700/15"
                        : "bg-zinc-100 text-zinc-700 ring-zinc-600/15"
                    }`}
                  >
                    {ACTIVE_LABELS[`${user.is_active}`]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-zinc-700">
                  {formatDate(user.created_at)}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-zinc-700">
                  {formatDate(user.updated_at)}
                </td>
                <td className="px-4 py-4 text-right">
                  <Link
                    href={`/dashboard/usuarios/${user.id}`}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400"
                  >
                    Ver detalle
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
