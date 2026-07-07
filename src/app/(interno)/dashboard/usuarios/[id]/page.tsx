import { notFound } from "next/navigation";

import { InternalUserDetail } from "@/components/usuarios/InternalUserDetail";
import { Alert, PageHeader } from "@/components/ui";
import { getInternalUserById } from "@/lib/usuarios";

type DashboardUsuarioDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DashboardUsuarioDetailPage({
  params,
}: DashboardUsuarioDetailPageProps) {
  const { id } = await params;
  const result = await getInternalUserById(id);

  if (!result.ok) {
    if (result.reason === "invalid_id" || result.reason === "not_found") {
      notFound();
    }

    return (
      <div className="space-y-8">
        <PageHeader title="Detalle de usuario" description="Perfil interno del equipo." />
        <Alert variant="danger">{result.message}</Alert>
      </div>
    );
  }

  return <InternalUserDetail user={result.user} />;
}
