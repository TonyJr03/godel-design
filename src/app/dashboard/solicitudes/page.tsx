import Link from "next/link";

import { InternalSolicitudesList } from "@/components/solicitudes/InternalSolicitudesList";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  INTERNAL_SOLICITUD_ESTADOS,
  SOLICITUD_STATUS_LABELS,
  listInternalSolicitudes,
} from "@/lib/solicitudes";
import { getSingleSearchParam } from "@/lib/utils";

type DashboardSolicitudesPageProps = {
  searchParams: Promise<{
    status?: string | string[] | undefined;
  }>;
};

export default async function DashboardSolicitudesPage({
  searchParams,
}: DashboardSolicitudesPageProps) {
  const params = await searchParams;
  const status = getSingleSearchParam(params.status);
  const result = await listInternalSolicitudes({ status });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Solicitudes"
        description="Listado interno de solicitudes recibidas por el formulario público."
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-950">
          Filtrar por estado
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/solicitudes"
            className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition ${
              result.ok && !result.status
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
            }`}
          >
            Todas
          </Link>
          {INTERNAL_SOLICITUD_ESTADOS.map((estadoOption) => (
            <Link
              key={estadoOption}
              href={`/dashboard/solicitudes?status=${estadoOption}`}
              className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition ${
                result.ok && result.status === estadoOption
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
              }`}
            >
              {SOLICITUD_STATUS_LABELS[estadoOption]}
            </Link>
          ))}
        </div>
      </section>

      {result.ok && result.ignoredInvalidEstado ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          El filtro de estado no es válido y fue ignorado.
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
            Cuando entren solicitudes públicas, aparecerán aquí ordenadas por
            fecha de creación.
          </p>
        </section>
      ) : (
        <InternalSolicitudesList solicitudes={result.solicitudes} />
      )}
    </div>
  );
}
