import type { HTMLAttributes, ReactNode } from "react";

type MetadataGridProps = HTMLAttributes<HTMLDListElement>;

type MetadataItemProps = {
  label: ReactNode;
  value: ReactNode;
  className?: string;
};

export function MetadataGrid({
  className,
  children,
  ...props
}: MetadataGridProps) {
  return (
    <dl
      className={["grid gap-x-6 gap-y-5 sm:grid-cols-2", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </dl>
  );
}

export function MetadataItem({
  label,
  value,
  className,
}: MetadataItemProps) {
  return (
    <div className={className}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="mt-1 wrap-break-word text-sm leading-6 text-text-primary">
        {value}
      </dd>
    </div>
  );
}
