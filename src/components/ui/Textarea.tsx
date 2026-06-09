import type { TextareaHTMLAttributes } from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export function Textarea({
  invalid = false,
  className,
  "aria-invalid": ariaInvalid,
  ...props
}: TextareaProps) {
  return (
    <textarea
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
      className={[
        "min-h-32 w-full resize-y rounded-(--radius-control) border bg-surface px-3 py-2 text-base text-text-primary shadow-(--shadow-soft) transition-[border-color,box-shadow,background-color] placeholder:text-text-muted disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted disabled:opacity-70",
        invalid ? "border-danger" : "border-border-strong",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
