import {
  ListingPageHeader,
  ListingToolbar,
} from "@/components/listing";
import { Alert } from "@/components/ui/Alert";
import { UserCreateDialogButton } from "@/components/usuarios/UserCreateDialogButton";
import { InternalUsersList } from "@/components/usuarios/InternalUsersList";
import { listInternalUsers } from "@/lib/usuarios";
import { getSingleSearchParam } from "@/lib/utils";

import { updateUserAction } from "./[id]/editar/actions";
import { createUserProfileAction } from "./nuevo/actions";

type DashboardConfiguracionUsuariosPageProps = {
  searchParams: Promise<{
    q?: string | string[] | undefined;
    role?: string | string[] | undefined;
    active?: string | string[] | undefined;
  }>;
};

export default async function DashboardConfiguracionUsuariosPage({
  searchParams,
}: DashboardConfiguracionUsuariosPageProps) {
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
      <ListingPageHeader
        title="Usuarios"
        description="Gestiona perfiles internos, roles y estado del equipo."
        action={
          <UserCreateDialogButton createAction={createUserProfileAction} />
        }
        toolbar={
          <ListingToolbar
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
        }
      />

      <Alert variant="info">
        Los usuarios Auth se crean fuera de esta aplicación. Aquí se gestionan
        sus perfiles internos.
      </Alert>

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
          getUpdateAction={(userId) => updateUserAction.bind(null, userId)}
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
