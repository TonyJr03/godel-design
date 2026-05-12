import { PublicHeader } from "@/components/layout/PublicHeader";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlaceholderCard } from "@/components/ui/PlaceholderCard";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <PageHeader
          title="Acceso interno"
          description="Placeholder del futuro acceso para el equipo de Godel Diseño."
        />
        <div className="mt-8 max-w-2xl">
          <PlaceholderCard
            title="Autenticacion pendiente"
            description="La autenticacion se implementara en una fase posterior. Esta pagina no valida credenciales."
          />
        </div>
      </main>
    </div>
  );
}
