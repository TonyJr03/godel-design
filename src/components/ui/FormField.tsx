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
  compact?: boolean;
};

export function FieldHelp({
  id,
  children,
  compact = false,
}: {
  id: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <p
      id={id}
      className={[
        compact ? "mt-1" : "mt-2",
        "text-sm leading-5 text-text-secondary",
      ].join(" ")}
    >
      {children}
    </p>
  );
}

export function FieldError({
  id,
  children,
  compact = false,
}: {
  id: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <p
      id={id}
      className={[
        compact ? "mt-1" : "mt-2",
        "text-sm font-medium leading-5 text-danger",
      ].join(" ")}
    >
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
  compact = false,
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
    <div className={["min-w-0", className].filter(Boolean).join(" ")}>
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
      <div className={[compact ? "mt-1.5" : "mt-2", "min-w-0"].join(" ")}>
        {typeof children === "function" ? children(renderProps) : children}
      </div>
      {error && errorId ? (
        <FieldError id={errorId} compact={compact}>
          {error}
        </FieldError>
      ) : null}
      {help && helpId ? (
        <FieldHelp id={helpId} compact={compact}>
          {help}
        </FieldHelp>
      ) : null}
    </div>
  );
}
