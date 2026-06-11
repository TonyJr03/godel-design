import Link from "next/link";

export function PublicHeader() {
  return (
    <header className="border-b border-border bg-surface-raised">
      <div className="mx-auto flex min-h-[72px] w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="group inline-flex items-center gap-3 rounded-(--radius-control)"
        >
          <span
            className="h-8 w-1 rounded-full bg-brand-accent"
            aria-hidden="true"
          />
          <span>
            <span className="block text-base font-semibold text-text-primary">
              Godel Diseño
            </span>
            <span className="block text-xs text-text-secondary">
              Producción personalizada
            </span>
          </span>
        </Link>
        <nav
          aria-label="Navegación pública"
          className="flex items-center gap-1 text-sm font-medium sm:gap-2"
        >
          <Link
            href="/solicitud"
            aria-current="page"
            className="inline-flex min-h-11 items-center rounded-(--radius-control) bg-brand-primary-soft px-3 text-brand-primary transition-colors hover:bg-info-soft"
          >
            Enviar solicitud
          </Link>
          <Link
            href="/login"
            className="hidden min-h-11 items-center rounded-(--radius-control) px-3 text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary sm:inline-flex"
          >
            Acceso interno
          </Link>
        </nav>
      </div>
    </header>
  );
}
