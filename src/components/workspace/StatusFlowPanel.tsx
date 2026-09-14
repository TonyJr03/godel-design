"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Alert, Button, StatusBadge } from "@/components/ui";

export type StatusFlowPanelActionState = {
  ok: boolean;
  message: string;
};

export type StatusFlowPanelAction = (
  previousState: StatusFlowPanelActionState,
  formData: FormData,
) => Promise<StatusFlowPanelActionState>;

export type StatusFlowPanelTransition = {
  status: string;
  statusLabel: string;
  buttonLabel: string;
  pendingLabel: string;
  enabled: boolean;
  blockedReason?: string;
  variant?: "primary" | "secondary";
};

export type StatusFlowPanelTermination = {
  status: string;
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
};

export type StatusFlowPanelProps = {
  action: StatusFlowPanelAction;
  currentStatus: string;
  primaryTransition?: StatusFlowPanelTransition;
  secondaryTransition?: StatusFlowPanelTransition;
  termination?: StatusFlowPanelTermination;
  notice?: ReactNode;
  closedMessage?: ReactNode;
  successNavigationHref?: string;
};

const initialState: StatusFlowPanelActionState = {
  ok: false,
  message: "",
};

function StatusActionMessage({
  state,
  className,
}: {
  state: StatusFlowPanelActionState;
  className?: string;
}) {
  if (!state.message) {
    return null;
  }

  return (
    <Alert
      variant={state.ok ? "success" : "danger"}
      title={state.ok ? "Estado actualizado" : "No se pudo actualizar el estado"}
      aria-live="polite"
      className={className}
    >
      <p>{state.message}</p>
    </Alert>
  );
}

function StatusSummary({ currentStatus }: { currentStatus: string }) {
  return (
    <div className="rounded-(--radius-control) border border-border bg-surface-muted px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Estado actual
      </p>
      <div className="mt-2">
        <StatusBadge status={currentStatus} />
      </div>
    </div>
  );
}

function TransitionButton({
  transition,
  pending,
  disabled,
  onActivate,
}: {
  transition: StatusFlowPanelTransition;
  pending: boolean;
  disabled: boolean;
  onActivate: (transition: StatusFlowPanelTransition) => void;
}) {
  return (
    <Button
      type="submit"
      name="status"
      value={transition.status}
      variant={transition.variant ?? "primary"}
      disabled={!transition.enabled || disabled}
      className="w-full sm:w-auto"
      onClick={() => onActivate(transition)}
    >
      {pending ? transition.pendingLabel : transition.buttonLabel}
    </Button>
  );
}

function DirectStatusTransitionForm({
  action,
  primaryTransition,
  secondaryTransition,
  successNavigationHref,
}: {
  action: StatusFlowPanelAction;
  primaryTransition: StatusFlowPanelTransition;
  secondaryTransition?: StatusFlowPanelTransition;
  successNavigationHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const wasPendingRef = useRef(false);
  const normalizedSecondaryTransition = secondaryTransition
    ? {
        ...secondaryTransition,
        variant: secondaryTransition.variant ?? "secondary",
      }
    : undefined;
  const transitions = [
    primaryTransition,
    ...(normalizedSecondaryTransition ? [normalizedSecondaryTransition] : []),
  ];
  const activeTransition = transitions.find(
    (transition) => transition.status === activeStatus,
  );

  useEffect(() => {
    if (wasPendingRef.current && !pending) {
      setActiveStatus(null);
    }

    wasPendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    if (state.ok && successNavigationHref) {
      // TD-NEXT-001: fallback temporal para navegación same-route en self-hosted.
      window.location.assign(successNavigationHref);
    }
  }, [state.ok, successNavigationHref]);

  function handleTransitionActivate(transition: StatusFlowPanelTransition) {
    setActiveStatus(transition.status);
  }

  return (
    <form action={formAction} aria-busy={pending} className="space-y-4">
      <StatusActionMessage state={state} />

      <div className="rounded-(--radius-control) border border-border bg-surface px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Siguiente estado
        </p>
        <div className="mt-2">
          <StatusBadge
            status={primaryTransition.status}
            label={primaryTransition.statusLabel}
          />
        </div>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Al avanzar, el flujo pasará a {primaryTransition.statusLabel}.
        </p>
        {primaryTransition.blockedReason ? (
          <Alert variant="warning" className="mt-3">
            <p>{primaryTransition.blockedReason}</p>
          </Alert>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <TransitionButton
            transition={primaryTransition}
            pending={pending && activeStatus === primaryTransition.status}
            disabled={pending}
            onActivate={handleTransitionActivate}
          />
          {normalizedSecondaryTransition ? (
            <TransitionButton
              transition={normalizedSecondaryTransition}
              pending={
                pending && activeStatus === normalizedSecondaryTransition.status
              }
              disabled={pending}
              onActivate={handleTransitionActivate}
            />
          ) : null}
        </div>
        {pending && activeTransition ? (
          <p role="status" aria-live="polite" className="sr-only">
            {activeTransition.pendingLabel}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function StatusTerminationConfirmation({
  action,
  termination,
  onCancel,
  successNavigationHref,
}: {
  action: StatusFlowPanelAction;
  termination: StatusFlowPanelTermination;
  onCancel: () => void;
  successNavigationHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      cancelButtonRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (state.ok && successNavigationHref) {
      // TD-NEXT-001: fallback temporal para navegación same-route en self-hosted.
      window.location.assign(successNavigationHref);
    }
  }, [state.ok, successNavigationHref]);

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Escape" || pending) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onCancel();
  }

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="rounded-(--radius-control) border border-danger/30 bg-danger-soft p-4"
      onKeyDown={handleKeyDown}
    >
      <fieldset aria-labelledby={titleId} aria-describedby={descriptionId}>
        <legend id={titleId} className="text-base font-semibold text-text-primary">
          {termination.title}
        </legend>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-text-primary">
          {termination.description}
        </p>

        <StatusActionMessage state={state} className="mt-3" />

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-[background-color,border-color,color,filter] duration-200 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <Button
            type="submit"
            name="status"
            value={termination.status}
            variant="danger"
            disabled={pending}
          >
            {pending ? termination.pendingLabel : termination.confirmLabel}
          </Button>
        </div>
        {pending ? (
          <p role="status" aria-live="polite" className="sr-only">
            {termination.pendingLabel}
          </p>
        ) : null}
      </fieldset>
    </form>
  );
}

function StatusTerminationSection({
  action,
  termination,
  successNavigationHref,
}: {
  action: StatusFlowPanelAction;
  termination: StatusFlowPanelTermination;
  successNavigationHref?: string;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  function cancelConfirmation() {
    setIsConfirming(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus({ preventScroll: true });
    });
  }

  return (
    <section className="space-y-3 rounded-(--radius-control) border border-danger/30 bg-surface px-4 py-4">
      <div>
        <h3 className="text-base font-semibold text-text-primary">
          Zona delicada
        </h3>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          Esta acción cierra el flujo y no puede deshacerse desde el sistema.
        </p>
      </div>

      {isConfirming ? (
        <StatusTerminationConfirmation
          action={action}
          termination={termination}
          onCancel={cancelConfirmation}
          successNavigationHref={successNavigationHref}
        />
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-(--radius-control) bg-danger px-4 text-sm font-semibold text-white transition-[background-color,border-color,color,filter] duration-200 hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:brightness-95"
          onClick={() => setIsConfirming(true)}
        >
          {termination.triggerLabel}
        </button>
      )}
    </section>
  );
}

export function StatusFlowPanel({
  action,
  currentStatus,
  primaryTransition,
  secondaryTransition,
  termination,
  notice,
  closedMessage,
  successNavigationHref,
}: StatusFlowPanelProps) {
  return (
    <div className="space-y-4">
      <StatusSummary currentStatus={currentStatus} />

      {notice ? <div>{notice}</div> : null}

      {closedMessage ? (
        <Alert variant="warning">
          <p>{closedMessage}</p>
        </Alert>
      ) : null}

      {primaryTransition ? (
        <DirectStatusTransitionForm
          action={action}
          primaryTransition={primaryTransition}
          secondaryTransition={secondaryTransition}
          successNavigationHref={successNavigationHref}
        />
      ) : null}

      {termination ? (
        <StatusTerminationSection
          action={action}
          termination={termination}
          successNavigationHref={successNavigationHref}
        />
      ) : null}
    </div>
  );
}
