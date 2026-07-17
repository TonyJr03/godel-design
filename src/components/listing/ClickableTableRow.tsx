"use client";

import type {
  KeyboardEvent,
  MouseEvent,
  HTMLAttributes,
} from "react";
import { useRouter } from "next/navigation";

export type ClickableTableRowProps =
  HTMLAttributes<HTMLTableRowElement> & {
    href: string;
    label: string;
  };

export function ClickableTableRow({
  href,
  label,
  className,
  onClick,
  onKeyDown,
  children,
  ...props
}: ClickableTableRowProps) {
  const router = useRouter();

  function navigate() {
    router.push(href);
  }

  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    onClick?.(event);

    if (!event.defaultPrevented) {
      navigate();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    onKeyDown?.(event);

    if (event.defaultPrevented) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigate();
    }
  }

  return (
    <tr
      role="link"
      tabIndex={0}
      aria-label={label}
      className={[
        "cursor-pointer transition-colors duration-200 hover:bg-brand-primary-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {children}
    </tr>
  );
}
