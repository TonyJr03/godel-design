"use client";

import Link from "next/link";
import { useActionState } from "react";
import type {
  AssociateSolicitudClienteActionState,
  CreateClienteFromSolicitudActionState,
  SolicitudDetailAction,
} from "@/app/(interno)/dashboard/solicitudes/[id]/actions";
import { Alert, Button, FormField, Select } from "@/components/ui";
import type { InternalCliente, InternalClienteDetail } from "@/lib/clientes";

type SolicitudClienteFormProps = {
  associateClienteAction: SolicitudDetailAction<
    AssociateSolicitudClienteActionState
  >;
  createClienteAction: SolicitudDetailAction<
    CreateClienteFromSolicitudActionState
  >;
  clienteAsociado: InternalClienteDetail | null;
  clientesDisponibles: InternalCliente[];
  clientesLoadError?: string | null;
  presentation?: "card" | "panel";
};

const initialAssociateState: AssociateSolicitudClienteActionState = {
  ok: false,
  message: "",
};

const initialCreateState: CreateClienteFromSolicitudActionState = {
  ok: false,
  message: "",
};

function ActionAlert({
  ok,
  message,
  successTitle,
  errorTitle,
  className,
}: {
  ok: boolean;
  message: string;
  successTitle: string;
  errorTitle: string;
  className?: string;
}) {
  if (!message) {
    return null;
  }

  return (
    <Alert
      variant={ok ? "success" : "danger"}
      title={ok ? successTitle : errorTitle}
      aria-live="polite"
      className={className}
    >
      <p>{message}</p>
    </Alert>
  );
}

function ClienteAsociadoBlock({
  clienteAsociado,
  compact = false,
}: {
  clienteAsociado: InternalClienteDetail | null;
  compact?: boolean;
}) {
  return (
    <section aria-labelledby="solicitud-cliente-asociado-title">
      <h3
        id="solicitud-cliente-asociado-title"
        className={compact ? "text-sm font-semibold text-text-primary" : "text-base font-semibold text-text-primary"}
      >
        Cliente asociado
      </h3>

      {clienteAsociado ? (
        <div className="mt-3 rounded-(--radius-control) border border-success/30 bg-success-soft p-4 text-sm text-text-primary">
          <p className="font-semibold">{clienteAsociado.name}</p>
          <p className="mt-1">{clienteAsociado.phone}</p>
          {clienteAsociado.email ? (
            <p className="mt-1">{clienteAsociado.email}</p>
          ) : null}
          <Link
            href={`/dashboard/clientes/${clienteAsociado.id}`}
            className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-brand-primary underline-offset-4 hover:underline"
          >
            Ver cliente
          </Link>
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Esta solicitud todavía no tiene un cliente interno asociado.
        </p>
      )}
    </section>
  );
}

export function SolicitudClienteForm({
  associateClienteAction,
  createClienteAction,
  clienteAsociado,
  clientesDisponibles,
  clientesLoadError,
  presentation = "card",
}: SolicitudClienteFormProps) {
  const [associateState, associateAction, associatePending] = useActionState(
    associateClienteAction,
    initialAssociateState,
  );
  const [createState, createAction, createPending] = useActionState(
    createClienteAction,
    initialCreateState,
  );
  const hasClientes = clientesDisponibles.length > 0;
  const hasClienteAsociado = Boolean(clienteAsociado);
  const associateButtonLabel = hasClienteAsociado
    ? "Actualizar cliente asociado"
    : "Asociar cliente";

  if (presentation === "panel") {
    return (
      <section className="space-y-5">
        <ClienteAsociadoBlock clienteAsociado={clienteAsociado} compact />

        <form
          action={associateAction}
          aria-busy={associatePending}
          className="border-t border-border pt-5"
        >
          <h3 className="text-sm font-semibold text-text-primary">
            Asociar cliente existente
          </h3>

          {clientesLoadError ? (
            <Alert variant="danger" className="mt-3">
              {clientesLoadError}
            </Alert>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <FormField
              id="cliente_id"
              label="Cliente existente"
              required
              compact
            >
              {({ describedBy }) => (
                <Select
                  id="cliente_id"
                  name="cliente_id"
                  defaultValue={clienteAsociado?.id ?? ""}
                  disabled={!hasClientes || associatePending}
                  required
                  aria-describedby={describedBy}
                >
                  <option value="" disabled>
                    Selecciona un cliente
                  </option>
                  {clientesDisponibles.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.name} - {cliente.phone}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>

            <Button
              type="submit"
              disabled={!hasClientes || associatePending}
              className="w-full sm:w-auto"
            >
              {associatePending
                ? hasClienteAsociado
                  ? "Actualizando asociación..."
                  : "Asociando cliente..."
                : associateButtonLabel}
            </Button>
          </div>

          <ActionAlert
            ok={associateState.ok}
            message={associateState.message}
            successTitle={
              hasClienteAsociado ? "Asociación actualizada" : "Cliente asociado"
            }
            errorTitle="No se pudo asociar el cliente"
            className="mt-3"
          />
        </form>

        <form
          action={createAction}
          aria-busy={createPending}
          className="border-t border-border pt-5"
        >
          <h3 className="text-sm font-semibold text-text-primary">
            Crear desde esta solicitud
          </h3>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Crea un cliente básico con los datos de contacto de esta solicitud.
          </p>

          <ActionAlert
            ok={createState.ok}
            message={createState.message}
            successTitle="Cliente creado"
            errorTitle="No se pudo crear el cliente"
            className="mt-3"
          />

          <Button
            type="submit"
            variant="secondary"
            disabled={hasClienteAsociado || createPending}
            className="mt-4 w-full"
          >
            {createPending
              ? "Creando cliente..."
              : "Crear cliente desde esta solicitud"}
          </Button>
        </form>
      </section>
    );
  }

  return (
    <section className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
      <h2 className="text-lg font-semibold text-text-primary">
        Cliente asociado
      </h2>

      <div className="mt-4">
        <ClienteAsociadoBlock clienteAsociado={clienteAsociado} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <form action={associateAction} aria-busy={associatePending}>
          {clientesLoadError ? (
            <Alert variant="danger" className="mb-4">
              {clientesLoadError}
            </Alert>
          ) : null}

          <FormField id="cliente_id" label="Cliente existente" required>
            {({ describedBy }) => (
              <Select
                id="cliente_id"
                name="cliente_id"
                defaultValue={clienteAsociado?.id ?? ""}
                disabled={!hasClientes || associatePending}
                required
                aria-describedby={describedBy}
              >
                <option value="" disabled>
                  Selecciona un cliente
                </option>
                {clientesDisponibles.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.name} · {cliente.phone}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <ActionAlert
            ok={associateState.ok}
            message={associateState.message}
            successTitle={
              hasClienteAsociado ? "Asociación actualizada" : "Cliente asociado"
            }
            errorTitle="No se pudo asociar el cliente"
            className="mt-3"
          />

          <Button
            type="submit"
            disabled={!hasClientes || associatePending}
            className="mt-4 w-full"
          >
            {associatePending
              ? hasClienteAsociado
                ? "Actualizando asociación..."
                : "Asociando cliente..."
              : associateButtonLabel}
          </Button>
        </form>

        <form action={createAction} aria-busy={createPending}>
          <h3 className="text-sm font-semibold text-text-primary">
            Crear desde la solicitud
          </h3>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Crea un cliente básico con los datos de contacto de esta solicitud.
          </p>

          <ActionAlert
            ok={createState.ok}
            message={createState.message}
            successTitle="Cliente creado"
            errorTitle="No se pudo crear el cliente"
            className="mt-3"
          />

          <Button
            type="submit"
            variant="secondary"
            disabled={hasClienteAsociado || createPending}
            className="mt-4 w-full"
          >
            {createPending
              ? "Creando cliente..."
              : "Crear cliente desde esta solicitud"}
          </Button>
        </form>
      </div>
    </section>
  );
}
