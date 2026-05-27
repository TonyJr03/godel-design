import { notFound } from "next/navigation";
import { InternalUserDetail } from "@/components/usuarios/InternalUserDetail";
import { PageHeader } from "@/components/ui/PageHeader";
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
        <PageHeader
          title="Detalle de usuario"
          description="Perfil interno del equipo."
        />
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-950">
          {result.message}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Detalle de usuario"
        description="Perfil interno del equipo."
      />
      <InternalUserDetail user={result.user} />
    </div>
  );
}
