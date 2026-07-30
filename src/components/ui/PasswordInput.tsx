"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Input, type InputProps } from "./Input";

export type PasswordInputProps = Omit<InputProps, "type"> & {
  visibilityResetKey?: unknown;
};

export function PasswordInput({
  className,
  disabled,
  id,
  visibilityResetKey,
  ...props
}: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [isVisible, setIsVisible] = useState(false);
  const Icon = isVisible ? EyeOff : Eye;
  const label = isVisible ? "Ocultar contraseña" : "Mostrar contraseña";

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        setIsVisible(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [visibilityResetKey]);

  return (
    <div className="relative">
      <Input
        {...props}
        id={inputId}
        type={isVisible ? "text" : "password"}
        disabled={disabled}
        className={["pr-12", className].filter(Boolean).join(" ")}
      />
      <button
        type="button"
        aria-controls={inputId}
        aria-label={label}
        aria-pressed={isVisible}
        title={label}
        disabled={disabled}
        className="absolute inset-y-0 right-0 inline-flex min-h-10 w-10 items-center justify-center rounded-r-(--radius-control) text-text-secondary transition-colors duration-200 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:text-text-muted disabled:opacity-60"
        onClick={() => setIsVisible((visible) => !visible)}
      >
        <Icon aria-hidden="true" className="size-5" strokeWidth={2} />
      </button>
    </div>
  );
}
