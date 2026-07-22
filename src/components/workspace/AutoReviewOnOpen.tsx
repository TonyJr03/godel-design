"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button } from "@/components/ui";

type AutoReviewOnOpenAction = () => Promise<{
  ok: boolean;
  message: string;
}>;

export type AutoReviewOnOpenProps = {
  action: AutoReviewOnOpenAction;
};

export function AutoReviewOnOpen({ action }: AutoReviewOnOpenProps) {
  const router = useRouter();
  const hasStartedRef = useRef(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startReview = useCallback(async () => {
    setIsPending(true);
    setErrorMessage(null);

    try {
      const result = await action();

      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      router.refresh();
    } catch {
      setErrorMessage("No se pudo iniciar la revisión. Inténtalo nuevamente.");
    } finally {
      setIsPending(false);
    }
  }, [action, router]);

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    void startReview();
  }, [startReview]);

  if (errorMessage) {
    return (
      <Alert
        variant="danger"
        title="No se pudo iniciar la revisión"
        className="mb-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>{errorMessage}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isPending}
            onClick={() => void startReview()}
          >
            Reintentar
          </Button>
        </div>
      </Alert>
    );
  }

  if (isPending) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="mb-4 text-sm text-text-secondary"
      >
        Iniciando revisión...
      </p>
    );
  }

  return null;
}
