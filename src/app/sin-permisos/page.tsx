import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default function SinPermisosPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6 py-12">
      <section className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Permisos internos
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">
          No tienes permisos para acceder a esta sección.
        </h1>
        <p className="mt-4 text-sm leading-6 text-zinc-600">
          Tu usuario tiene acceso al sistema, pero tu rol no permite entrar a
          esta sección. Si consideras que es un error, contacta al administrador
          de Godel Diseño.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Volver al dashboard
          </Link>
          <div className="rounded-md bg-zinc-950 p-1">
            <LogoutButton />
          </div>
        </div>
      </section>
    </main>
  );
}
