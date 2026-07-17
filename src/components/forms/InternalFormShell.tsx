import type { ReactNode } from "react";

export type InternalFormShellProps = {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  compact?: boolean;
};

export function InternalFormShell({
  title,
  description,
  children,
  footer,
  compact = false,
}: InternalFormShellProps) {
  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {title || description ? (
        <header className={compact ? "space-y-1" : "space-y-2"}>
          {title ? (
            <h3 className="text-base font-semibold text-text-primary">
              {title}
            </h3>
          ) : null}
          {description ? (
            <p className="text-sm leading-6 text-text-secondary">
              {description}
            </p>
          ) : null}
        </header>
      ) : null}

      <div className="min-w-0">{children}</div>

      {footer ? (
        <footer className={compact ? "pt-1" : "pt-2"}>{footer}</footer>
      ) : null}
    </div>
  );
}

