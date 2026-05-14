import { LogoutButton } from "@/components/auth/LogoutButton";

export default function AccesoDenegadoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6 py-12">
      <section className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Acceso interno
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">
          No tienes acceso al sistema interno.
        </h1>
        <p className="mt-4 text-sm leading-6 text-zinc-600">
          Puede deberse a que tu usuario no tiene un perfil interno o a que el
          acceso fue desactivado. Contacta al administrador de Godel Diseño para
          revisar tu cuenta.
        </p>
        <div className="mt-6 max-w-xs rounded-lg bg-zinc-950 p-2">
          <LogoutButton />
        </div>
      </section>
    </main>
  );
}
