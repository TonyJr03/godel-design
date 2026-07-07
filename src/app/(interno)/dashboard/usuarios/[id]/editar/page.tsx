import { notFound } from "next/navigation";
import { UserEditForm } from "@/components/usuarios/UserEditForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { getInternalUserById } from "@/lib/usuarios";
import { updateUserAction } from "./actions";

type EditarUsuarioPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditarUsuarioPage({
  params,
}: EditarUsuarioPageProps) {
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
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-950">
          {result.message}
        </section>
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
      <UserEditForm user={result.user} updateAction={updateAction} />
    </div>
  );
}
