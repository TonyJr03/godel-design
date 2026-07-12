export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="fixed left-4 top-4 z-50 -translate-y-24 rounded-(--radius-control) bg-brand-primary px-4 py-3 text-sm font-semibold text-white shadow-(--shadow-soft) transition-transform duration-200 focus:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary-hover"
    >
      Saltar al contenido principal
    </a>
  );
}
