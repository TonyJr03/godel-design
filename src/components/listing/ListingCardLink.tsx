import type { ReactNode } from "react";
import Link from "next/link";

export type ListingCardLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
};

export function ListingCardLink({
  href,
  children,
  className,
  "aria-label": ariaLabel,
}: ListingCardLinkProps) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={[
        "block min-h-11 rounded-(--radius-card) border border-border bg-surface p-4 text-text-primary shadow-(--shadow-soft) transition-[background-color,border-color,box-shadow] duration-200 hover:border-brand-primary hover:bg-brand-primary-soft hover:shadow-(--shadow-soft) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Link>
  );
}
