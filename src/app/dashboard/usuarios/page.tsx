import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { InternalUsersList } from "@/components/usuarios/InternalUsersList";
import { listInternalUsers } from "@/lib/usuarios";

type DashboardUsuariosPageProps = {
  searchParams: Promise<{
    q?: string | string[] | undefined;
    role?: string | string[] | undefined;
    active?: string | string[] | undefined;
  }>;
};

function getSingleSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardUsuariosPage({
  searchParams,
}: DashboardUsuariosPageProps) {
  const params = await searchParams;
  const q = getSingleSearchParam(params.q);
  const role = getSingleSearchParam(params.role);
  const active = getSingleSearchParam(params.active);
  const result = await listInternalUsers({ q, role, active });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Usuarios internos"
          description="Gestiona los perfiles internos del equipo."
        />
        <Link
          href="/dashboard/usuarios/nuevo"
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Nuevo perfil
        </Link>
      </div>

      <section className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950">
        Los usuarios Auth se crean fuera de esta aplicación. Aquí se gestionan
        sus perfiles internos.
      </section>

      {result.ignoredInvalidRole ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          El filtro de rol no es válido y fue ignorado.
        </section>
      ) : null}

      {result.ignoredInvalidActive ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          El filtro de estado no es válido y fue ignorado.
        </section>
      ) : null}

      {!result.ok ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-950">
          {result.message}
        </section>
      ) : (
        <InternalUsersList
          users={result.users}
          q={result.q ?? q ?? ""}
          role={result.role ?? ""}
          active={
            result.active === null ? "" : result.active ? "true" : "false"
          }
        />
      )}
    </div>
  );
}
