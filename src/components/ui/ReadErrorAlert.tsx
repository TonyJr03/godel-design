"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useTransition } from "react";

import { Alert } from "./Alert";
import { Button } from "./Button";

export type ReadErrorAlertProps = {
  title: ReactNode;
  children: ReactNode;
  retryable: boolean;
  variant?: "warning" | "danger";
  retryLabel?: string;
  pendingLabel?: string;
  className?: string;
};

export function ReadErrorAlert({
  title,
  children,
  retryable,
  variant = "warning",
  retryLabel = "Reintentar",
  pendingLabel = "Reintentando...",
  className,
}: ReadErrorAlertProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRetry() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <Alert
      variant={variant}
      role="alert"
      aria-busy={isPending}
      className={className}
    >
      <div className="space-y-3">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="mt-1">{children}</div>
        </div>
        {retryable ? (
          <Button
            type="button"
            variant={variant === "danger" ? "danger" : "secondary"}
            size="sm"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={handleRetry}
            disabled={isPending}
            aria-busy={isPending}
          >
            <span aria-live="polite">
              {isPending ? pendingLabel : retryLabel}
            </span>
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}
