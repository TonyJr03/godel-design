import { PublicHeader } from "@/components/layout/PublicHeader";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlaceholderCard } from "@/components/ui/PlaceholderCard";

export default function SolicitudPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <PageHeader
          title="Solicitud de trabajo"
          description="Aqui ira el formulario publico para solicitar trabajos de impresion, diseño o personalizacion."
        />
        <div className="mt-8 max-w-2xl">
          <PlaceholderCard
            title="Formulario publico futuro"
            description="Esta pantalla solo reserva el espacio del flujo de solicitud. No envia datos ni valida campos todavia."
          />
        </div>
      </main>
    </div>
  );
}
