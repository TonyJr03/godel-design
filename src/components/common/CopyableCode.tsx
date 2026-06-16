"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

export type CopyableCodeProps = {
  code: string;
  label?: string;
  helperText?: string;
  copiedMessage?: string;
  errorMessage?: string;
  className?: string;
};

const DEFAULT_LABEL = "Código de seguimiento";
const DEFAULT_COPIED_MESSAGE = "Código copiado";
const DEFAULT_ERROR_MESSAGE =
  "No se pudo copiar automáticamente. Selecciona el código manualmente.";
const COPY_STATUS_RESET_MS = 2500;

export function CopyableCode({
  code,
  label = DEFAULT_LABEL,
  helperText,
  copiedMessage = DEFAULT_COPIED_MESSAGE,
  errorMessage = DEFAULT_ERROR_MESSAGE,
  className,
}: CopyableCodeProps) {
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStatusMessage("");
    }, COPY_STATUS_RESET_MS);

    return () => window.clearTimeout(timeoutId);
  }, [statusMessage]);

  async function copyCode() {
    try {
      if (!navigator.clipboard?.writeText) {
        setStatusMessage(errorMessage);
        return;
      }

      await navigator.clipboard.writeText(code);
      setStatusMessage(copiedMessage);
    } catch {
      setStatusMessage(errorMessage);
    }
  }

  return (
    <div
      className={[
        "rounded-(--radius-control) border border-border bg-surface px-3 py-3 text-text-primary",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="text-sm font-semibold text-text-primary">{label}</p>

      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
        <code className="select-all rounded-(--radius-control) border border-border-strong bg-surface-muted px-3 py-2 font-mono text-base font-semibold tracking-normal text-text-primary">
          {code}
        </code>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={copyCode}
          className="w-full cursor-pointer sm:w-auto"
        >
          {statusMessage === copiedMessage ? "Copiado" : "Copiar"}
        </Button>
      </div>

      {helperText ? (
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          {helperText}
        </p>
      ) : null}

      <p
        className="mt-2 min-h-5 text-sm text-text-secondary"
        role="status"
        aria-live="polite"
      >
        {statusMessage}
      </p>
    </div>
  );
}
