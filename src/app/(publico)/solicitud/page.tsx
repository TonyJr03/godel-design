import Link from "next/link";

import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicSolicitudForm } from "@/components/solicitudes/PublicSolicitudForm";
import { Alert } from "@/components/ui";
import { listPublicServiceTypes } from "@/lib/service-types";
import { WORKFLOW_TYPES } from "@/lib/workflow-types";

function getHeroCopy({
  hasEncargos,
  hasImpresion,
}: {
  hasEncargos: boolean;
  hasImpresion: boolean;
}) {
  if (hasEncargos && hasImpresion) {
    return "Elige entre un encargo personalizado o una impresión directa.";
  }

  if (hasEncargos) {
    return "Selecciona el servicio que necesitas y cuéntanos los detalles del encargo.";
  }

  if (!hasEncargos && !hasImpresion) {
    return "Consulta la disponibilidad actual de nuestros servicios y contáctanos si necesitas orientación.";
  }

  return "Envíanos el documento que deseas imprimir junto con sus indicaciones.";
}

function getRequestSteps({
  hasEncargos,
  hasImpresion,
}: {
  hasEncargos: boolean;
  hasImpresion: boolean;
}) {
  const firstStepDescription =
    hasEncargos && hasImpresion
      ? "Elige el tipo de solicitud y completa los datos necesarios."
      : hasEncargos
        ? "Selecciona el servicio y completa los detalles del encargo."
        : "Adjunta el documento e indica cómo debemos imprimirlo.";

  return [
    ["Envías tu solicitud", firstStepDescription],
    [
      "Revisamos los detalles",
      "El equipo comprueba la información y prepara las preguntas necesarias.",
    ],
    [
      "Te contactamos",
      "Confirmamos contigo alcance, precio y fecha antes de continuar.",
    ],
    [
      "Preparamos el trabajo",
      "Solo después de la confirmación se organiza la producción.",
    ],
  ] as const;
}

function getPreparationItems({
  hasEncargos,
  hasImpresion,
}: {
  hasEncargos: boolean;
  hasImpresion: boolean;
}) {
  return [
    ...(hasEncargos
      ? [
          "Ten a mano medidas, cantidades y colores importantes.",
          "En los encargos, los archivos de referencia son opcionales.",
        ]
      : []),
    ...(hasImpresion
      ? ["Para una impresión debes adjuntar el documento que prepararemos."]
      : []),
    "Podrás aclarar cualquier detalle cuando te contactemos.",
  ] as const;
}

function PublicSolicitudUnavailable() {
  return (
    <Alert variant="info" title="Formulario no disponible">
      <p>
        En este momento no estamos recibiendo solicitudes mediante el
        formulario. Puedes contactarnos directamente para consultar
        disponibilidad.
      </p>
    </Alert>
  );
}

function PublicSolicitudCatalogError() {
  return (
    <Alert variant="warning" title="No pudimos cargar los servicios disponibles">
      <div className="space-y-3">
        <p>Inténtalo nuevamente dentro de unos minutos.</p>
        <Link
          href="/solicitud"
          className="inline-flex min-h-10 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm font-semibold text-brand-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Reintentar
        </Link>
      </div>
    </Alert>
  );
}

export default async function SolicitudPage() {
  const serviceTypesResult = await listPublicServiceTypes();
  const serviceTypes = serviceTypesResult.ok
    ? serviceTypesResult.serviceTypes
    : [];
  const encargoServices = serviceTypes.filter(
    (serviceType) => serviceType.workflowType === WORKFLOW_TYPES.ENCARGO,
  );
  const printService = serviceTypes.find(
    (serviceType) => serviceType.workflowType === WORKFLOW_TYPES.IMPRESION,
  );
  const hasEncargos = encargoServices.length > 0;
  const hasImpresion = Boolean(printService);
  const hasServices = hasEncargos || hasImpresion;
  const requestSteps = getRequestSteps({ hasEncargos, hasImpresion });
  const preparationItems = getPreparationItems({ hasEncargos, hasImpresion });
  const heroCopy = getHeroCopy({ hasEncargos, hasImpresion });

  return (
    <div className="flex min-h-screen flex-col bg-brand-primary-soft">
      <PublicHeader currentPage="solicitud" />
      <main className="flex-1">
        <section className="relative isolate overflow-hidden bg-brand-primary text-white">
          <div
            aria-hidden="true"
            className="absolute -right-20 top-10 -z-10 h-28 w-72 skew-x-[-18deg] bg-white/10"
          />
          <div
            aria-hidden="true"
            className="absolute -left-28 bottom-10 -z-10 h-24 w-72 skew-x-[-16deg] bg-brand-accent/85"
          />
          <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-accent-soft">
                Solicitud de trabajo
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
                Cuéntanos qué necesitas preparar
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/82 sm:text-lg">
                {heroCopy} Revisaremos la información contigo para confirmar
                alcance, precio y fecha antes de iniciar el trabajo.
              </p>
            </div>
          </div>
        </section>

        <section className="px-4 py-10 sm:px-6 sm:py-14">
          <div className="mx-auto grid w-full max-w-6xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_330px]">
            <div className="min-w-0">
              {!serviceTypesResult.ok ? (
                <PublicSolicitudCatalogError />
              ) : hasServices ? (
                <PublicSolicitudForm serviceTypes={serviceTypes} />
              ) : (
                <PublicSolicitudUnavailable />
              )}
            </div>

            {hasServices ? (
              <aside className="space-y-4 lg:sticky lg:top-24">
                <section className="overflow-hidden rounded-(--radius-card) border border-brand-primary/12 bg-surface p-5 shadow-(--shadow-soft)">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-accent">
                    Paso a paso
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-text-primary">
                    Cómo funciona
                  </h2>
                  <ol className="mt-5 space-y-5">
                    {requestSteps.map(([title, description], index) => (
                      <li key={title} className="flex gap-3">
                        <span
                          className={[
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white",
                            index === 1
                              ? "bg-brand-accent"
                              : "bg-brand-primary",
                          ].join(" ")}
                        >
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-text-primary">
                            {title}
                          </p>
                          <p className="mt-1 text-sm leading-5 text-text-secondary">
                            {description}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>

                <section className="rounded-(--radius-card) border border-brand-primary/12 bg-surface p-5 shadow-(--shadow-soft)">
                  <h2 className="text-base font-semibold text-text-primary">
                    Antes de empezar
                  </h2>
                  <ul className="mt-3 space-y-2 text-sm leading-5 text-text-secondary">
                    {preparationItems.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span
                          aria-hidden="true"
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </aside>
            ) : null}
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
