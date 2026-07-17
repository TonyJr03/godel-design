import Image from "next/image";
import Link from "next/link";

export type PublicHeaderCurrentPage = "home" | "solicitud" | "estado";

type PublicHeaderProps = {
  currentPage?: PublicHeaderCurrentPage;
};

const baseNavLinkClass =
  "min-h-10 items-center rounded-(--radius-control) px-3 text-sm font-semibold transition-colors duration-200";

function getNavLinkClass(isCurrent: boolean) {
  return [
    baseNavLinkClass,
    isCurrent
      ? "bg-surface text-brand-primary shadow-(--shadow-soft)"
      : "text-white/85 hover:bg-white/10 hover:text-white",
  ].join(" ");
}

export function PublicHeader({ currentPage }: PublicHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/15 bg-brand-primary-hover text-white">
      <div className="mx-auto flex min-h-18 w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:gap-5 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-h-11 min-w-0 items-center rounded-(--radius-control) transition-opacity duration-200 hover:opacity-90"
        >
          <Image
            src="/brand/godel-diseno-horizontal-on-dark.png"
            alt="Godel Diseño"
            width={164}
            height={48}
            className="h-8 w-auto shrink-0 sm:h-9"
            priority
          />
        </Link>
        <nav
          aria-label="Navegación pública"
          className="flex items-center gap-1 sm:gap-2"
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
            className={`${getNavLinkClass(currentPage === "solicitud")} inline-flex`}
          >
            <span className="sm:hidden">Solicitud</span>
            <span className="hidden sm:inline">Enviar solicitud</span>
          </Link>
          <Link
            href="/estado"
            aria-current={currentPage === "estado" ? "page" : undefined}
            className={`${getNavLinkClass(currentPage === "estado")} inline-flex`}
          >
            Estado
          </Link>
        </nav>
      </div>
    </header>
  );
}
