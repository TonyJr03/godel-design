import Link from "next/link";
import type { InternalSolicitudDetail as InternalSolicitudDetailData } from "@/lib/solicitudes";

type InternalSolicitudDetailProps = {
  solicitud: InternalSolicitudDetailData;
};

const ESTADO_LABELS: Record<InternalSolicitudDetailData["estado"], string> = {
  nueva: "Nueva",
  en_revision: "En revision",
  contactada: "Contactada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  convertida: "Convertida",
};

const DATE_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatShortReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function formatDate(value: string | null): string {
  if (!value) {
    return "No definida";
  }

  return DATE_FORMATTER.format(new Date(value));
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm text-zinc-900">{value}</dd>
    </div>
  );
}

export function InternalSolicitudDetail({
  solicitud,
}: InternalSolicitudDetailProps) {
  return (
    <article className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-sm font-semibold text-teal-700">
            {formatShortReference(solicitud.id)}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            Solicitud de {solicitud.cliente_nombre}
          </h1>
          <p className="mt-3 text-base leading-7 text-zinc-600">
            {solicitud.tipo_servicio}
          </p>
        </div>
        <Link
          href="/dashboard/solicitudes"
          className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:border-zinc-400"
        >
          Volver al listado
        </Link>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex rounded-md bg-teal-50 px-2.5 py-1.5 text-sm font-semibold text-teal-800 ring-1 ring-inset ring-teal-700/15">
            {ESTADO_LABELS[solicitud.estado]}
          </span>
          <span className="text-xs text-zinc-500">
            ID completo: <span className="font-mono">{solicitud.id}</span>
          </span>
        </div>

        <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem label="Cliente" value={solicitud.cliente_nombre} />
          <DetailItem label="Telefono" value={solicitud.cliente_telefono} />
          <DetailItem
            label="Email"
            value={solicitud.cliente_email ?? "No informado"}
          />
          <DetailItem label="Tipo de servicio" value={solicitud.tipo_servicio} />
          <DetailItem
            label="Cantidad"
            value={solicitud.cantidad ?? "No definida"}
          />
          <DetailItem
            label="Fecha deseada"
            value={formatDate(solicitud.fecha_deseada)}
          />
          <DetailItem
            label="Fecha de creacion"
            value={formatDate(solicitud.created_at)}
          />
          <DetailItem
            label="Ultima actualizacion"
            value={formatDate(solicitud.updated_at)}
          />
        </dl>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Descripcion</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
          {solicitud.descripcion}
        </p>
      </section>

      {solicitud.observaciones ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">
            Observaciones
          </h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
            {solicitud.observaciones}
          </p>
        </section>
      ) : null}
    </article>
  );
}
