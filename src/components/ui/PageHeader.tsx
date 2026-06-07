type PageHeaderProps = {
  title: string;
  description?: string;
};

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
        {title}
      </h1>
      {description ? (
        <p className="mt-3 text-base leading-7 text-text-secondary">
          {description}
        </p>
      ) : null}
    </header>
  );
}
