import Image from "next/image";
import Link from "next/link";

const socialLinks = [
  // TODO: reemplazar cuando existan URLs oficiales publicadas.
  { href: "#", label: "Facebook", icon: FacebookIcon },
  { href: "#", label: "Instagram", icon: InstagramIcon },
] as const;

function FacebookIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="currentColor"
    >
      <path d="M14.2 8.1V6.7c0-.7.5-1.1 1.2-1.1h1.8V2.5h-2.6c-2.9 0-4.4 1.7-4.4 4.2v1.4H7.8v3.4h2.4v9.9h4v-9.9h2.7l.5-3.4h-3.2Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M17.5 6.8h.01" />
    </svg>
  );
}

export function PublicFooter() {
  return (
    <footer className="bg-brand-primary-hover text-white">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
        <div>
          <Image
            src="/brand/godel-diseno-horizontal-on-dark.png"
            alt="Godel Diseño"
            width={180}
            height={52}
            className="h-10 w-auto"
          />
          <p className="mt-3 max-w-md text-sm leading-6 text-white/72">
            Solicitudes revisadas antes de confirmar el trabajo.
          </p>
        </div>
        <nav
          aria-label="Navegación pública del pie"
          className="flex flex-wrap gap-3 text-sm font-semibold text-white/78"
        >
          <Link href="/" className="transition-colors hover:text-white">
            Inicio
          </Link>
          <Link
            href="/solicitud"
            className="transition-colors hover:text-white"
          >
            Enviar solicitud
          </Link>
          <Link href="/estado" className="transition-colors hover:text-white">
            Consultar estado
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          {socialLinks.map((socialLink) => {
            const Icon = socialLink.icon;

            return (
              <Link
                key={socialLink.label}
                href={socialLink.href}
                aria-label={socialLink.label}
                className="inline-flex h-10 w-10 items-center justify-center rounded-(--radius-control) border border-white/20 bg-white/10 text-white transition-colors duration-200 hover:bg-white hover:text-brand-primary"
              >
                <Icon />
              </Link>
            );
          })}
        </div>
      </div>
    </footer>
  );
}
