import Link from "next/link";

const enlacesDashboard = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/solicitudes", label: "Solicitudes" },
  { href: "/dashboard/pedidos", label: "Pedidos" },
  { href: "/dashboard/clientes", label: "Clientes" },
  { href: "/dashboard/usuarios", label: "Usuarios" },
  { href: "/dashboard/configuracion", label: "Configuracion" },
] as const;

export function DashboardSidebar() {
  return (
    <aside className="border-b border-zinc-200 bg-zinc-950 text-white md:min-h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="px-5 py-6">
        <Link href="/dashboard" className="text-lg font-semibold">
          Godel Diseño
        </Link>
        <p className="mt-1 text-sm text-zinc-400">Gestion operativa</p>
      </div>
      <nav className="flex gap-2 overflow-x-auto px-4 pb-4 md:flex-col md:overflow-visible">
        {enlacesDashboard.map((enlace) => (
          <Link
            key={enlace.href}
            href={enlace.href}
            className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
          >
            {enlace.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
