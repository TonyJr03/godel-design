import type { HTMLAttributes } from "react";

export type CardVariant = "default" | "muted" | "raised" | "interactive";
export type CardPadding = "sm" | "md" | "lg";

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article";
  variant?: CardVariant;
  padding?: CardPadding;
};

const variantClasses: Record<CardVariant, string> = {
  default: "border-border bg-surface",
  muted: "border-border bg-surface-muted",
  raised: "border-border bg-surface-raised shadow-(--shadow-soft)",
  interactive:
    "border-border bg-surface transition-[background-color,border-color,box-shadow] duration-200 hover:border-brand-primary hover:bg-brand-primary-soft hover:shadow-(--shadow-soft)",
};

const paddingClasses: Record<CardPadding, string> = {
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export function Card({
  as: Component = "div",
  variant = "default",
  padding = "md",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <Component
      className={[
        "rounded-(--radius-card) border",
        variantClasses[variant],
        paddingClasses[padding],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </Component>
  );
}
