import { notFound } from "next/navigation";

import { UserEditForm } from "@/components/usuarios/UserEditForm";
import { Alert, PageHeader } from "@/components/ui";
import { getInternalUserById } from "@/lib/usuarios";
import { updateUserAction } from "./actions";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditarUsuarioConfiguracionPage({
  params,
}: PageProps) {
  const { id } = await params;
  const result = await getInternalUserById(id);

  if (!result.ok) {
    if (result.reason === "invalid_id" || result.reason === "not_found") {
      notFound();
    }

    return (
      <div className="space-y-8">
        <PageHeader
          title="Editar usuario"
          description="Actualiza el perfil interno del equipo."
        />
        <Alert variant="danger">{result.message}</Alert>
      </div>
    );
  }

  const updateAction = updateUserAction.bind(null, result.user.id);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Editar usuario"
        description="Actualiza el perfil interno del equipo."
      />

      <UserEditForm
        user={result.user}
        updateAction={updateAction}
        backHref="/dashboard/configuracion/usuarios"
        backLabel="Volver a usuarios"
      />
    </div>
  );
}
