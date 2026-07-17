import Link from "next/link";

export type PublicHeaderCurrentPage = "home" | "solicitud" | "estado";

type PublicHeaderProps = {
  currentPage?: PublicHeaderCurrentPage;
};

const baseNavLinkClass =
  "inline-flex min-h-11 items-center rounded-(--radius-control) px-2 transition-colors sm:px-3";

function getNavLinkClass(isCurrent: boolean) {
  return [
    baseNavLinkClass,
    isCurrent
      ? "bg-brand-primary-soft text-brand-primary"
      : "text-text-secondary hover:bg-surface-muted hover:text-text-primary",
  ].join(" ");
}

export function PublicHeader({ currentPage }: PublicHeaderProps) {
  return (
    <header className="border-b border-border bg-surface-raised">
      <div className="mx-auto flex min-h-18 w-full max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6">
        <Link
          href="/"
          className="group inline-flex min-h-11 min-w-0 items-center gap-2 rounded-(--radius-control) sm:gap-3"
        >
          <span
            className="h-8 w-1 rounded-full bg-brand-accent"
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold text-text-primary">
              Godel Diseño
            </span>
            <span className="hidden text-xs text-text-secondary min-[420px]:block">
              Producción personalizada
            </span>
          </span>
        </Link>
        <nav
          aria-label="Navegación pública"
          className="flex items-center gap-1 text-sm font-medium sm:gap-2"
        >
          <Link
            href="/"
            aria-current={currentPage === "home" ? "page" : undefined}
            className={`${getNavLinkClass(currentPage === "home")} hidden lg:inline-flex`}
          >
            Inicio
          </Link>
          <Link
            href="/solicitud"
            aria-current={currentPage === "solicitud" ? "page" : undefined}
            className={getNavLinkClass(currentPage === "solicitud")}
          >
            <span className="sm:hidden">Solicitud</span>
            <span className="hidden sm:inline">Enviar solicitud</span>
          </Link>
          <Link
            href="/estado"
            aria-current={currentPage === "estado" ? "page" : undefined}
            className={`${getNavLinkClass(currentPage === "estado")} hidden sm:inline-flex`}
          >
            Estado
          </Link>
        </nav>
      </div>
    </header>
  );
}
