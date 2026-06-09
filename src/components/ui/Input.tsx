import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export function Input({
  invalid = false,
  className,
  "aria-invalid": ariaInvalid,
  ...props
}: InputProps) {
  return (
    <input
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
      className={[
        "min-h-11 w-full rounded-(--radius-control) border bg-surface px-3 py-2 text-base text-text-primary shadow-(--shadow-soft) transition-[border-color,box-shadow,background-color] placeholder:text-text-muted disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted disabled:opacity-70",
        invalid ? "border-danger" : "border-border-strong",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
