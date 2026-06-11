import Link from "next/link";

export type PublicHeaderCurrentPage = "home" | "solicitud" | "login";

type PublicHeaderProps = {
  currentPage?: PublicHeaderCurrentPage;
};

const baseNavLinkClass =
  "inline-flex min-h-11 items-center rounded-(--radius-control) px-3 transition-colors";

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
      <div className="mx-auto flex min-h-18 w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="group inline-flex min-h-11 items-center gap-3 rounded-(--radius-control)"
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
            href="/login"
            aria-current={currentPage === "login" ? "page" : undefined}
            className={getNavLinkClass(currentPage === "login")}
          >
            <span className="sm:hidden">Acceso</span>
            <span className="hidden sm:inline">Acceso interno</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
