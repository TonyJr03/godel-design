import type { HTMLAttributes, ReactNode } from "react";

export type FormActionsProps = HTMLAttributes<HTMLDivElement> & {
  note?: ReactNode;
  compact?: boolean;
};

export function FormActions({
  note,
  compact = false,
  className,
  children,
  ...props
}: FormActionsProps) {
  return (
    <div
      className={[
        compact
          ? "flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"
          : "flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between",
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
      <div
        className={[
          "flex flex-col sm:flex-row sm:items-center",
          compact ? "gap-2" : "gap-2",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}
