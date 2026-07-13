import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditarUsuarioLegacyPage({
  params,
}: PageProps) {
  const { id } = await params;

  redirect(`/dashboard/configuracion/usuarios/${id}/editar`);
}
