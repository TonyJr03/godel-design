import Link from "next/link";

export function PublicHeader() {
  return (
    <header className="border-b border-zinc-200 bg-stone-50">
      <div className="mx-auto flex h-[72px] w-full max-w-5xl items-center justify-between px-6">
        <Link href="/" className="text-base font-semibold text-zinc-950">
          Godel Diseño
        </Link>
        <nav className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <Link
            href="/solicitud"
            className="rounded-md px-3 py-2 transition hover:bg-white hover:text-zinc-950"
          >
            Solicitud
          </Link>
          <Link
            href="/login"
            className="rounded-md px-3 py-2 transition hover:bg-white hover:text-zinc-950"
          >
            Login
          </Link>
        </nav>
      </div>
    </header>
  );
}
