"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui";

export type CopyableCodeProps = {
  code: string;
  label?: string;
  helperText?: string;
  copiedMessage?: string;
  errorMessage?: string;
  className?: string;
  presentation?: "card" | "inline";
};

const DEFAULT_LABEL = "Código de seguimiento";
const DEFAULT_COPIED_MESSAGE = "Código copiado";
const DEFAULT_ERROR_MESSAGE =
  "No se pudo copiar automáticamente. Selecciona el código manualmente.";
const COPY_STATUS_RESET_MS = 2500;

function copyWithLegacyCommand(value: string) {
  const previouslyFocusedElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const textarea = document.createElement("textarea");

  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
    previouslyFocusedElement?.focus({
      preventScroll: true,
    });
  }
}

export function CopyableCode({
  code,
  label = DEFAULT_LABEL,
  helperText,
  copiedMessage = DEFAULT_COPIED_MESSAGE,
  errorMessage = DEFAULT_ERROR_MESSAGE,
  className,
  presentation = "card",
}: CopyableCodeProps) {
  const [statusMessage, setStatusMessage] = useState("");
  const isCopied = statusMessage === copiedMessage;

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
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        setStatusMessage(copiedMessage);
        return;
      }

      if (copyWithLegacyCommand(code)) {
        setStatusMessage(copiedMessage);
        return;
      }

      setStatusMessage(errorMessage);
    } catch {
      if (copyWithLegacyCommand(code)) {
        setStatusMessage(copiedMessage);
        return;
      }

      setStatusMessage(errorMessage);
    }
  }

  if (presentation === "inline") {
    return (
      <span className="inline-flex flex-col items-start">
        <button
          type="button"
          aria-label={`Copiar código de seguimiento ${code}`}
          onClick={copyCode}
          className={[
            "group inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-(--radius-control) px-1 font-semibold text-brand-primary transition-colors hover:text-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <code className="font-mono text-base font-semibold tracking-normal group-hover:underline group-hover:underline-offset-4">
            {code}
          </code>
          {isCopied ? (
            <Check
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-success"
              strokeWidth={2}
            />
          ) : (
            <Copy
              aria-hidden="true"
              className="h-5 w-5 shrink-0"
              strokeWidth={2}
            />
          )}
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {statusMessage}
        </span>
      </span>
    );
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
          {isCopied ? (
            <Check
              aria-hidden="true"
              className="size-4 shrink-0"
              strokeWidth={2}
            />
          ) : (
            <Copy
              aria-hidden="true"
              className="size-4 shrink-0"
              strokeWidth={2}
            />
          )}
          {isCopied ? "Copiado" : "Copiar"}
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
