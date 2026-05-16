import Link from "next/link";

import { InternalSolicitudesList } from "@/components/solicitudes/InternalSolicitudesList";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  INTERNAL_SOLICITUD_ESTADOS,
  listInternalSolicitudes,
  type InternalSolicitudEstado,
} from "@/lib/solicitudes";

type DashboardSolicitudesPageProps = {
  searchParams: Promise<{
    estado?: string | string[] | undefined;
  }>;
};

const ESTADO_LABELS: Record<InternalSolicitudEstado, string> = {
  nueva: "Nueva",
  en_revision: "En revision",
  contactada: "Contactada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  convertida: "Convertida",
};

function getSingleSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardSolicitudesPage({
  searchParams,
}: DashboardSolicitudesPageProps) {
  const params = await searchParams;
  const estado = getSingleSearchParam(params.estado);
  const result = await listInternalSolicitudes({ estado });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Solicitudes"
        description="Listado interno de solicitudes recibidas por el formulario publico."
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-950">
          Filtrar por estado
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/solicitudes"
            className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition ${
              result.ok && !result.estado
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
            }`}
          >
            Todas
          </Link>
          {INTERNAL_SOLICITUD_ESTADOS.map((estadoOption) => (
            <Link
              key={estadoOption}
              href={`/dashboard/solicitudes?estado=${estadoOption}`}
              className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition ${
                result.ok && result.estado === estadoOption
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
              }`}
            >
              {ESTADO_LABELS[estadoOption]}
            </Link>
          ))}
        </div>
      </section>

      {result.ok && result.ignoredInvalidEstado ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          El filtro de estado no es valido y fue ignorado.
        </section>
      ) : null}

      {!result.ok ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-950">
          {result.message}
        </section>
      ) : result.solicitudes.length === 0 ? (
        <section className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">
            No hay solicitudes para mostrar
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Cuando entren solicitudes publicas, apareceran aqui ordenadas por
            fecha de creacion.
          </p>
        </section>
      ) : (
        <InternalSolicitudesList solicitudes={result.solicitudes} />
      )}
    </div>
  );
}
