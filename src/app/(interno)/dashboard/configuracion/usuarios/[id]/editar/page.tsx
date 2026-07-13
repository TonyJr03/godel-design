import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DashboardConfiguracionEditarUsuarioPage({
  params,
}: PageProps) {
  const { id } = await params;

  redirect(`/dashboard/usuarios/${id}/editar`);
}
