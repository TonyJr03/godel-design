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
          description="Cuéntanos qué necesitas producir, diseñar o personalizar. Godel Diseño revisará la solicitud y se pondrá en contacto contigo para confirmar detalles y próximos pasos."
        />
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <PublicSolicitudForm />

          <aside className="space-y-4 text-sm leading-6 text-zinc-600">
            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-zinc-950">
                Después del envío
              </h2>
              <p className="mt-2">
                Revisaremos la información recibida y te contactaremos por
                teléfono o correo antes de crear un pedido interno.
              </p>
            </section>

            <section className="rounded-lg border border-teal-200 bg-teal-50 p-5 text-teal-950">
              <h2 className="text-base font-semibold">
                Archivos opcionales
              </h2>
              <p className="mt-2">
                Puedes adjuntar archivos de referencia, imágenes o documentos
                relacionados con tu solicitud.
              </p>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
