import Link from "next/link";
import { ChevronRight } from "lucide-react";

const configurationItems = [
  {
    title: "Usuarios",
    description: "Gestiona usuarios internos, roles y estado.",
    href: "/dashboard/configuracion/usuarios",
  },
  {
    title: "Servicios",
    description: "Gestiona el catálogo de servicios y su disponibilidad pública.",
    href: "/dashboard/configuracion/servicios",
  },
  {
    title: "Plantillas",
    description: "Gestiona plantillas de tareas de producción.",
    href: "/dashboard/configuracion/plantillas",
  },
] as const;

const maintenanceItem = {
  title: "Mantenimiento",
  description: "Ejecuta tareas administrativas de mantenimiento del sistema.",
  href: "/dashboard/configuracion/mantenimiento",
} as const;

type ConfigurationHubProps = {
  canManageConfiguration?: boolean;
};

export function ConfigurationHub({
  canManageConfiguration = false,
}: ConfigurationHubProps) {
  const items = canManageConfiguration
    ? [...configurationItems, maintenanceItem]
    : configurationItems;

  return (
    <section aria-label="Secciones de configuración" className="max-w-3xl">
      <div className="grid gap-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex min-h-11 items-center justify-between gap-4 rounded-(--radius-card) border border-border bg-surface p-4 text-text-primary shadow-(--shadow-soft) transition-[background-color,border-color,box-shadow] duration-200 hover:border-brand-primary hover:bg-brand-primary-soft hover:shadow-(--shadow-soft) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="min-w-0">
              <span className="block text-base font-semibold">
                {item.title}
              </span>
              <span className="mt-1 block text-sm leading-6 text-text-secondary">
                {item.description}
              </span>
            </span>
            <ChevronRight
              aria-hidden="true"
              className="size-5 shrink-0 text-text-muted transition-colors duration-200 group-hover:text-brand-primary"
              strokeWidth={1.75}
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
