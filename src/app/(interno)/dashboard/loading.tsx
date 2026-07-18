import Image from "next/image";

export default function DashboardLoading() {
  return (
    <section
      aria-busy="true"
      aria-labelledby="dashboard-loading-title"
      className="flex min-h-[36vh] items-center justify-center px-4 py-10"
    >
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center text-center"
      >
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-full border-2 border-brand-primary/15 border-t-brand-primary motion-safe:animate-spin"
          />
          <Image
            src="/brand/godel-diseno-mark.png"
            alt=""
            width={34}
            height={34}
            aria-hidden="true"
            className="h-8 w-8 object-contain"
            loading="eager"
          />
        </div>
        <h1
          id="dashboard-loading-title"
          className="mt-4 text-base font-semibold text-text-primary"
        >
          Preparando vista...
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Cargando información operativa.
        </p>
      </div>
    </section>
  );
}
