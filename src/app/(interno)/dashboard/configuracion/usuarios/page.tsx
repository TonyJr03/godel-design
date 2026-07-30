import { redirect } from "next/navigation";

import {
  ListingPageHeader,
  ListingPagination,
  ListingToolbar,
} from "@/components/listing";
import { Alert } from "@/components/ui/Alert";
import { ReadErrorAlert } from "@/components/ui/ReadErrorAlert";
import { InternalUsersList } from "@/components/usuarios/InternalUsersList";
import { UserCreateDialogButton } from "@/components/usuarios/UserCreateDialogButton";
import { normalizePageParam } from "@/lib/pagination";
import { listInternalUsers } from "@/lib/usuarios";
import { getSingleSearchParam } from "@/lib/utils";

import {
  createUserAction,
  resetUserPasswordAction,
  updateUserAction,
} from "./actions";

type DashboardConfiguracionUsuariosPageProps = {
  searchParams: Promise<{
    q?: string | string[] | undefined;
    role?: string | string[] | undefined;
    active?: string | string[] | undefined;
    page?: string | string[] | undefined;
  }>;
};

const USERS_PATHNAME = "/dashboard/configuracion/usuarios";

function buildUsersCanonicalHref({
  q,
  role,
  active,
  page,
}: {
  q: string | null;
  role: string | undefined;
  active: string | undefined;
  page: number;
}): string {
  const params = new URLSearchParams();

  if (q) {
    params.set("q", q);
  }

  if (role) {
    params.set("role", role);
  }

  if (active) {
    params.set("active", active);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();

  return queryString ? `${USERS_PATHNAME}?${queryString}` : USERS_PATHNAME;
}

export default async function DashboardConfiguracionUsuariosPage({
  searchParams,
}: DashboardConfiguracionUsuariosPageProps) {
  const params = await searchParams;
  const q = getSingleSearchParam(params.q);
  const role = getSingleSearchParam(params.role);
  const active = getSingleSearchParam(params.active);
  const page = getSingleSearchParam(params.page);
  const result = await listInternalUsers({ q, role, active, page });

  if (!result.ok && result.reason === "unauthorized") {
    redirect("/login");
  }

  if (!result.ok && result.reason === "forbidden") {
    redirect("/sin-permisos");
  }

  const searchValue = result.q ?? "";
  const roleValue = result.role ?? "";
  const activeValue =
    result.active === null ? "" : result.active ? "true" : "false";

  if (result.ok && page !== undefined) {
    const canonicalHref = buildUsersCanonicalHref({
      q: result.q,
      role,
      active,
      page: result.pagination.page,
    });
    const requestedPage = normalizePageParam(page);
    const currentPageIsCanonical =
      result.pagination.page > 1 && page === String(result.pagination.page);

    if (!currentPageIsCanonical || requestedPage !== result.pagination.page) {
      redirect(canonicalHref);
    }
  }

  return (
    <div className="space-y-8">
      <ListingPageHeader
        title="Usuarios"
        description="Crea usuarios internos y gestiona sus roles y estado operativo."
        action={<UserCreateDialogButton createAction={createUserAction} />}
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
        Los usuarios nuevos se crean con una contraseña temporal y deberán
        cambiarla antes de acceder al trabajo interno. Un administrador puede
        restablecer una contraseña temporal sin enviar correo.
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
        <ReadErrorAlert
          variant="danger"
          title="No se pudieron cargar los usuarios"
          retryable={result.reason === "error"}
        >
          <p>{result.message}</p>
        </ReadErrorAlert>
      ) : (
        <>
          <InternalUsersList
            users={result.users}
            getUpdateAction={(userId) => updateUserAction.bind(null, userId)}
            getResetPasswordAction={(userId) =>
              resetUserPasswordAction.bind(null, userId)
            }
            hasActiveFilters={Boolean(searchValue || roleValue || activeValue)}
            emptyMessage={
              searchValue || roleValue || activeValue
                ? "No se encontraron usuarios con los filtros aplicados."
                : undefined
            }
          />

          {result.users.length > 0 ? (
            <ListingPagination
              pagination={result.pagination}
              pathname={USERS_PATHNAME}
              query={{
                q: result.q,
                role,
                active,
              }}
              itemLabel="usuarios"
              ariaLabel="Paginación de usuarios"
            />
          ) : null}
        </>
      )}
    </div>
  );
}
