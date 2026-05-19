import Link from "next/link";

import { PublicHeader } from "@/components/layout/PublicHeader";

export default function Home() {
  return (
    <div className="min-h-screen bg-stone-50 text-zinc-950">
      <PublicHeader />
      <main className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-5xl flex-col justify-center px-6 py-16">
        <section className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
            Godel Diseño
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-zinc-950 sm:text-5xl">
            Sistema de gestión de solicitudes y pedidos
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-700">
            Base inicial para organizar el flujo operativo de trabajos de
            impresión, diseño y personalización de productos.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/solicitud"
              className="inline-flex h-11 items-center justify-center rounded-md bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800"
            >
              Crear solicitud
            </Link>
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-300 px-5 text-sm font-semibold text-zinc-900 transition hover:bg-white"
            >
              Acceso interno
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
