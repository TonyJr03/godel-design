import type { HTMLAttributes, ReactNode } from "react";

type DetailPanelProps = HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  as?: "section" | "div";
};

export function DetailPanel({
  title,
  description,
  aside,
  as: Component = "section",
  className,
  children,
  ...props
}: DetailPanelProps) {
  return (
    <Component
      className={[
        "rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          {description ? (
            <div className="mt-2 text-sm leading-6 text-text-secondary">
              {description}
            </div>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </Component>
  );
}
