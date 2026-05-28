import Link from "next/link";
import type { ReactNode } from "react";
import type { InternalUserDetail as InternalUserDetailData } from "@/lib/usuarios";

type InternalUserDetailProps = {
  user: InternalUserDetailData;
};

const ROLE_LABELS: Record<InternalUserDetailData["role"], string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  trabajador: "Trabajador",
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function formatDateTime(value: string | null): string {
  if (!value) {
    return "No definida";
  }

  return DATE_TIME_FORMATTER.format(new Date(value));
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 2);

  if (words.length === 0) {
    return "US";
  }

  return words.map((word) => word[0]?.toUpperCase() ?? "").join("") || "US";
}

function getSafeAvatarHref(value: string | null): string | null {
  const avatarUrl = value?.trim();

  if (!avatarUrl) {
    return null;
  }

  if (avatarUrl.startsWith("/")) {
    return avatarUrl;
  }

  try {
    const url = new URL(avatarUrl);

    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm leading-6 text-zinc-950">{value}</dd>
    </div>
  );
}

export function InternalUserDetail({ user }: InternalUserDetailProps) {
  const avatarHref = getSafeAvatarHref(user.avatar_url);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/dashboard/usuarios"
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400"
        >
          Volver a usuarios
        </Link>
        <Link
          href={`/dashboard/usuarios/${user.id}/editar`}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Editar usuario
        </Link>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-center">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-sm font-semibold text-white">
            {getInitials(user.full_name)}
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-600">
              Perfil interno del equipo
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
              {user.full_name}
            </h2>
            <p className="mt-2 break-all font-mono text-xs text-zinc-500">
              {user.id}
            </p>
          </div>
        </div>

        <dl className="mt-6 grid gap-6 sm:grid-cols-2">
          <DetailItem label="Rol" value={ROLE_LABELS[user.role]} />
          <DetailItem
            label="Estado"
            value={user.is_active ? "Activo" : "Inactivo"}
          />
          <DetailItem
            label="Teléfono"
            value={user.phone?.trim() || "Sin teléfono"}
          />
          <DetailItem
            label="Avatar"
            value={
              avatarHref ? (
                <a
                  href={avatarHref}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-teal-800 underline-offset-4 hover:underline"
                >
                  Ver avatar
                </a>
              ) : (
                "No definido"
              )
            }
          />
          <DetailItem
            label="Creación"
            value={formatDateTime(user.created_at)}
          />
          <DetailItem
            label="Última actualización"
            value={formatDateTime(user.updated_at)}
          />
        </dl>
      </section>
    </div>
  );
}
