import type { ReactNode } from "react";

export type FormFieldRenderProps = {
  describedBy?: string;
  errorId?: string;
  helpId?: string;
  invalid: boolean;
};

export type FormFieldProps = {
  id: string;
  label: ReactNode;
  required?: boolean;
  optional?: boolean;
  help?: ReactNode;
  error?: ReactNode;
  helpId?: string;
  errorId?: string;
  children: ReactNode | ((props: FormFieldRenderProps) => ReactNode);
  className?: string;
};

export function FieldHelp({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <p id={id} className="mt-2 text-sm leading-5 text-text-secondary">
      {children}
    </p>
  );
}

export function FieldError({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <p id={id} className="mt-2 text-sm font-medium leading-5 text-danger">
      {children}
    </p>
  );
}

export function FormField({
  id,
  label,
  required = false,
  optional = !required,
  help,
  error,
  helpId: providedHelpId,
  errorId: providedErrorId,
  children,
  className,
}: FormFieldProps) {
  const helpId = help ? (providedHelpId ?? `${id}-help`) : undefined;
  const errorId = error ? (providedErrorId ?? `${id}-error`) : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;
  const renderProps = {
    describedBy,
    errorId,
    helpId,
    invalid: Boolean(error),
  };

  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-medium text-text-primary">
        {label}
        {required ? (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        ) : optional ? (
          <span className="ml-1 font-normal text-text-muted">(opcional)</span>
        ) : null}
      </label>
      <div className="mt-2">
        {typeof children === "function" ? children(renderProps) : children}
      </div>
      {error && errorId ? <FieldError id={errorId}>{error}</FieldError> : null}
      {help && helpId ? <FieldHelp id={helpId}>{help}</FieldHelp> : null}
    </div>
  );
}
