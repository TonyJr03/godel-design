import type { HTMLAttributes, ReactNode } from "react";

export type FormActionsProps = HTMLAttributes<HTMLDivElement> & {
  note?: ReactNode;
};

export function FormActions({
  note,
  className,
  children,
  ...props
}: FormActionsProps) {
  return (
    <div
      className={[
        "flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {note ? (
        <div className="text-sm leading-6 text-text-secondary">{note}</div>
      ) : (
        <span />
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {children}
      </div>
    </div>
  );
}
