import { UserCreateForm } from "@/components/usuarios/UserCreateForm";
import { PageHeader } from "@/components/ui/PageHeader";

export default function NuevoUsuarioPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Nuevo perfil interno"
        description="Crear perfil para usuario Auth existente."
      />
      <UserCreateForm />
    </div>
  );
}
