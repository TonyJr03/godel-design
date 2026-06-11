import Link from "next/link";

import {
  Alert,
  DetailPanel,
  MetadataGrid,
  MetadataItem,
  StatusBadge,
} from "@/components/ui";
import { ROLE_LABELS } from "@/lib/permissions";
import type { InternalUserDetail as InternalUserDetailData } from "@/lib/usuarios";
import { formatAppDateTime } from "@/lib/utils";

type InternalUserDetailProps = {
  user: InternalUserDetailData;
};

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 2);

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

    return ["https:", "http:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function InternalUserDetail({ user }: InternalUserDetailProps) {
  const avatarHref = getSafeAvatarHref(user.avatar_url);

  return (
    <article className="space-y-6">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-(--radius-control) bg-brand-primary text-sm font-semibold text-white">
            {getInitials(user.full_name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand-primary">
              Perfil interno
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-text-primary">
              {user.full_name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-text-secondary">
                {ROLE_LABELS[user.role]}
              </span>
              <StatusBadge status={user.is_active ? "activo" : "inactivo"} />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/dashboard/usuarios"
            className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted"
          >
            Volver a usuarios
          </Link>
          <Link
            href={`/dashboard/usuarios/${user.id}/editar`}
            className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover"
          >
            Editar usuario
          </Link>
        </div>
      </header>

      <Alert variant="info" title="Cuenta de acceso">
        La autenticación se gestiona fuera de esta ficha. Aquí solo se consulta
        y administra el perfil interno asociado.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <DetailPanel
          title="Información operativa"
          description="Datos visibles del perfil dentro del equipo."
        >
          <MetadataGrid>
            <MetadataItem label="Rol" value={ROLE_LABELS[user.role]} />
            <MetadataItem
              label="Estado"
              value={
                <StatusBadge
                  status={user.is_active ? "activo" : "inactivo"}
                />
              }
            />
            <MetadataItem
              label="Teléfono"
              value={user.phone?.trim() || "Sin teléfono"}
            />
            <MetadataItem
              label="Avatar"
              value={
                avatarHref ? (
                  <a
                    href={avatarHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center font-semibold text-brand-primary underline-offset-4 hover:underline"
                  >
                    Ver avatar
                  </a>
                ) : (
                  "No definido"
                )
              }
            />
          </MetadataGrid>
        </DetailPanel>

        <DetailPanel title="Registro" description="Información técnica secundaria.">
          <MetadataGrid className="sm:grid-cols-1">
            <MetadataItem
              label="Creación"
              value={formatAppDateTime(user.created_at, "No definida")}
            />
            <MetadataItem
              label="Última actualización"
              value={formatAppDateTime(user.updated_at, "No definida")}
            />
            <MetadataItem
              label="Auth ID"
              value={
                <span className="break-all font-mono text-xs text-text-secondary">
                  {user.id}
                </span>
              }
            />
          </MetadataGrid>
        </DetailPanel>
      </div>
    </article>
  );
}
