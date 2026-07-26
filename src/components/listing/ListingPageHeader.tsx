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
    <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-start lg:gap-x-3">
      <div className="col-start-1 row-start-1 min-w-0 max-w-3xl">
        <h1 className="min-w-0 text-3xl font-semibold tracking-tight text-text-primary">
          {title}
        </h1>

        {description ? (
          <p className="mt-3 min-w-0 text-sm leading-6 text-text-secondary sm:text-base sm:leading-7">
            {description}
          </p>
        ) : null}
      </div>

      {action ? (
        <div className="col-start-2 row-start-1 shrink-0 justify-self-end lg:col-start-3">
          {action}
        </div>
      ) : null}

      {toolbar ? (
        <div className="col-span-2 min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:w-72 lg:justify-self-end xl:w-79">
          {toolbar}
        </div>
      ) : null}
    </header>
  );
}
