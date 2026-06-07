import { logout } from "@/app/login/actions";

type LogoutButtonProps = {
  variant?: "default" | "inverse";
};

const variantClasses = {
  default:
    "border-border-strong bg-surface text-text-primary hover:bg-surface-muted",
  inverse:
    "border-white/25 bg-white/5 text-white hover:border-white/40 hover:bg-white/10",
} as const;

export function LogoutButton({ variant = "default" }: LogoutButtonProps) {
  return (
    <form action={logout}>
      <button
        type="submit"
        className={[
          "min-h-11 w-full rounded-(--radius-control) border px-3 py-2.5 text-left text-sm font-semibold transition-[background-color,border-color,color] duration-200",
          variantClasses[variant],
        ].join(" ")}
      >
        Cerrar sesión
      </button>
    </form>
  );
}
