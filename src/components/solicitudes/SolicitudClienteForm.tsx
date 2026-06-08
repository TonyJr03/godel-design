"use client";

import Link from "next/link";
import { useActionState } from "react";
import type {
  AssociateSolicitudClienteActionState,
  CreateClienteFromSolicitudActionState,
  SolicitudDetailAction,
} from "@/app/dashboard/solicitudes/[id]/actions";
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
};

const initialAssociateState: AssociateSolicitudClienteActionState = {
  ok: false,
  message: "",
};

const initialCreateState: CreateClienteFromSolicitudActionState = {
  ok: false,
  message: "",
};

export function SolicitudClienteForm({
  associateClienteAction,
  createClienteAction,
  clienteAsociado,
  clientesDisponibles,
  clientesLoadError,
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

  return (
    <section className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
      <h2 className="text-lg font-semibold text-text-primary">
        Cliente asociado
      </h2>

      {clienteAsociado ? (
        <div className="mt-4 rounded-(--radius-control) border border-success/30 bg-success-soft p-4 text-sm text-text-primary">
          <p className="font-semibold">{clienteAsociado.name}</p>
          <p className="mt-1">{clienteAsociado.phone}</p>
          {clienteAsociado.email ? (
            <p className="mt-1">{clienteAsociado.email}</p>
          ) : null}
          <Link
            href={`/dashboard/clientes/${clienteAsociado.id}`}
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-primary underline-offset-4 hover:underline"
          >
            Ver cliente
          </Link>
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Esta solicitud todavía no tiene un cliente interno asociado.
        </p>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <form action={associateAction} aria-busy={associatePending}>
          <label
            htmlFor="cliente_id"
            className="text-sm font-medium text-text-primary"
          >
            Cliente existente
          </label>
          <select
            id="cliente_id"
            name="cliente_id"
            defaultValue={clienteAsociado?.id ?? ""}
            disabled={!hasClientes || associatePending}
            className="mt-2 min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary shadow-(--shadow-soft) disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
          >
            <option value="" disabled>
              Selecciona un cliente
            </option>
            {clientesDisponibles.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.name} · {cliente.phone}
              </option>
            ))}
          </select>

          {clientesLoadError ? (
            <p className="mt-2 text-sm leading-5 text-danger">
              {clientesLoadError}
            </p>
          ) : null}

          {associateState.message ? (
            <p
              className={`mt-3 rounded-md border px-4 py-3 text-sm leading-6 ${
                associateState.ok
                  ? "border-success/30 bg-success-soft text-success"
                  : "border-danger/30 bg-danger-soft text-danger"
              }`}
              role={associateState.ok ? "status" : "alert"}
              aria-live="polite"
            >
              {associateState.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!hasClientes || associatePending}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {associatePending
              ? "Guardando..."
              : hasClienteAsociado
                ? "Actualizar cliente asociado"
                : "Asociar cliente"}
          </button>
        </form>

        <form action={createAction} aria-busy={createPending}>
          <h3 className="text-sm font-semibold text-text-primary">
            Crear desde la solicitud
          </h3>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Crea un cliente básico usando el nombre, teléfono y correo ya
            guardados en esta solicitud.
          </p>

          {createState.message ? (
            <p
              className={`mt-3 rounded-md border px-4 py-3 text-sm leading-6 ${
                createState.ok
                  ? "border-success/30 bg-success-soft text-success"
                  : "border-danger/30 bg-danger-soft text-danger"
              }`}
              role={createState.ok ? "status" : "alert"}
              aria-live="polite"
            >
              {createState.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={hasClienteAsociado || createPending}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createPending
              ? "Creando..."
              : "Crear cliente desde esta solicitud"}
          </button>
        </form>
      </div>
    </section>
  );
}
