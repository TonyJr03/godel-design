import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicSolicitudForm } from "@/components/solicitudes/PublicSolicitudForm";
import { PageHeader } from "@/components/ui/PageHeader";

export default function SolicitudPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <PageHeader
          title="Solicitud de trabajo"
          description="Cuentanos que necesitas producir, disenar o personalizar. Revisaremos la solicitud y nos pondremos en contacto contigo para confirmar detalles y proximos pasos."
        />
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <PublicSolicitudForm />

          <aside className="space-y-4 text-sm leading-6 text-zinc-600">
            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-zinc-950">
                Despues del envio
              </h2>
              <p className="mt-2">
                El equipo revisara la informacion recibida y te contactara por
                telefono o correo para aclarar detalles antes de crear un pedido
                interno.
              </p>
            </section>

            <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950">
              <h2 className="text-base font-semibold">
                Archivos pendientes
              </h2>
              <p className="mt-2">
                La subida de archivos aun no esta disponible en esta fase. Si
                tienes referencias, podremos solicitarlas durante el contacto.
              </p>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
