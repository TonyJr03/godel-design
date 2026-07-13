import { UserCreateForm } from "@/components/usuarios/UserCreateForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { createUserProfileAction } from "./actions";

export default function NuevoUsuarioConfiguracionPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Nuevo usuario"
        description="Crear perfil interno para un usuario Auth existente."
      />

      <UserCreateForm
        createAction={createUserProfileAction}
        backHref="/dashboard/configuracion/usuarios"
        backLabel="Volver a usuarios"
      />
    </div>
  );
}
