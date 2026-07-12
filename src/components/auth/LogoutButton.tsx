import { LogOut } from "lucide-react";

import { logout } from "@/app/(interno)/login/actions";

type LogoutButtonProps = {
  variant?: "default" | "inverse";
  compact?: boolean;
};

const variantClasses = {
  default:
    "border-border-strong bg-surface text-text-primary hover:bg-surface-muted focus-visible:ring-brand-primary",
  inverse:
    "border-white/25 bg-white/5 text-white hover:border-white/40 hover:bg-white/10 focus-visible:ring-white focus-visible:ring-offset-brand-primary-hover",
} as const;

export function LogoutButton({
  variant = "default",
  compact = false,
}: LogoutButtonProps) {
  return (
    <form action={logout} className={compact ? "w-full" : undefined}>
      <button
        type="submit"
        aria-label={compact ? "Cerrar sesión" : undefined}
        title={compact ? "Cerrar sesión" : undefined}
        className={[
          "inline-flex min-h-11 items-center rounded-(--radius-control) border text-sm font-semibold transition-[background-color,border-color,color] duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:transition-none",
          compact
            ? "w-full justify-center px-2 py-2.5"
            : "w-full gap-2 px-3 py-2.5 text-left",
          variantClasses[variant],
        ].join(" ")}
      >
        <LogOut
          aria-hidden="true"
          className="size-5 shrink-0"
          strokeWidth={1.75}
        />
        <span className={compact ? "sr-only" : undefined}>
          Cerrar sesión
        </span>
      </button>
    </form>
  );
}
