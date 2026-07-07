import Link from "next/link";
import { ListFiltersBar } from "@/components/common/ListFiltersBar";
import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import { InternalUsersList } from "@/components/usuarios/InternalUsersList";
import { listInternalUsers } from "@/lib/usuarios";
import { getSingleSearchParam } from "@/lib/utils";

type DashboardUsuariosPageProps = {
  searchParams: Promise<{
    q?: string | string[] | undefined;
    role?: string | string[] | undefined;
    active?: string | string[] | undefined;
  }>;
};

export default async function DashboardUsuariosPage({
  searchParams,
}: DashboardUsuariosPageProps) {
  const params = await searchParams;
  const q = getSingleSearchParam(params.q);
  const role = getSingleSearchParam(params.role);
  const active = getSingleSearchParam(params.active);
  const result = await listInternalUsers({ q, role, active });
  const searchValue = result.q ?? "";
  const roleValue = result.role ?? "";
  const activeValue =
    result.active === null ? "" : result.active ? "true" : "false";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Usuarios internos"
          description="Gestiona los perfiles internos del equipo."
        />
        <Link
          href="/dashboard/usuarios/nuevo"
          className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-primary-hover"
        >
          Nuevo perfil
        </Link>
      </div>

      <Alert variant="info">
        Los usuarios Auth se crean fuera de esta aplicación. Aquí se gestionan
        sus perfiles internos.
      </Alert>

      <ListFiltersBar
        searchLabel="Buscar usuarios"
        searchPlaceholder="Nombre o teléfono"
        initialQuery={searchValue}
        filters={[
          {
            name: "role",
            label: "Rol",
            value: roleValue,
            options: [
              { value: "", label: "Todos los roles" },
              { value: "admin", label: "Administrador" },
              { value: "supervisor", label: "Supervisor" },
              { value: "trabajador", label: "Trabajador" },
            ],
          },
          {
            name: "active",
            label: "Estado",
            value: activeValue,
            options: [
              { value: "", label: "Todos" },
              { value: "true", label: "Activos" },
              { value: "false", label: "Inactivos" },
            ],
          },
        ]}
      />

      {result.ignoredInvalidRole ? (
        <Alert variant="warning">
          El filtro de rol no es válido y fue ignorado.
        </Alert>
      ) : null}

      {result.ignoredInvalidActive ? (
        <Alert variant="warning">
          El filtro de estado no es válido y fue ignorado.
        </Alert>
      ) : null}

      {!result.ok ? (
        <Alert variant="danger">{result.message}</Alert>
      ) : (
        <InternalUsersList
          users={result.users}
          hasActiveFilters={Boolean(searchValue || roleValue || activeValue)}
          emptyMessage={
            searchValue || roleValue || activeValue
              ? "No se encontraron usuarios con los filtros aplicados."
              : undefined
          }
        />
      )}
    </div>
  );
}
