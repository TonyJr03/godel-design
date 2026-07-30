import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type BackToConfigurationLinkProps = {
  presentation: "text" | "button";
};

export function BackToConfigurationLink({
  presentation,
}: BackToConfigurationLinkProps) {
  const className =
    presentation === "text"
      ? "inline-flex min-h-11 w-fit items-center gap-2 font-mono text-base font-semibold text-brand-primary transition-colors hover:text-brand-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background xl:hidden"
      : "hidden min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background xl:inline-flex xl:w-auto";

  return (
    <Link
      href="/dashboard/configuracion"
      className={className}
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
      Volver a configuración
    </Link>
  );
}
