import type { ReactNode } from "react";

export type ListingPageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  toolbar?: ReactNode;
};

export function ListingPageHeader({
  title,
  description,
  action,
  toolbar,
}: ListingPageHeaderProps) {
  return (
    <header className="space-y-4">
      <div className="lg:flex lg:items-start lg:justify-between lg:gap-6">
        <div className="min-w-0 max-w-3xl">
          <div className="flex items-start justify-between gap-4 lg:block">
            <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
              {title}
            </h1>
            {action ? <div className="shrink-0 lg:hidden">{action}</div> : null}
          </div>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-text-secondary sm:text-base sm:leading-7">
              {description}
            </p>
          ) : null}
        </div>

        {toolbar || action ? (
          <div className="hidden shrink-0 items-start gap-3 lg:flex">
            {toolbar ? <div className="min-w-0">{toolbar}</div> : null}
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        ) : null}
      </div>

      {toolbar ? <div className="lg:hidden">{toolbar}</div> : null}
    </header>
  );
}
