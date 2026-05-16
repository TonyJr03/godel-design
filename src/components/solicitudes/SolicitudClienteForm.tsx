"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  associateSolicitudClienteAction,
  createClienteFromSolicitudAction,
  type AssociateSolicitudClienteActionState,
  type CreateClienteFromSolicitudActionState,
} from "@/app/dashboard/solicitudes/[id]/actions";
import type { InternalCliente, InternalClienteDetail } from "@/lib/clientes";

type SolicitudClienteFormProps = {
  solicitudId: string;
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
  solicitudId,
  clienteAsociado,
  clientesDisponibles,
  clientesLoadError,
}: SolicitudClienteFormProps) {
  const [associateState, associateAction, associatePending] = useActionState(
    associateSolicitudClienteAction,
    initialAssociateState,
  );
  const [createState, createAction, createPending] = useActionState(
    createClienteFromSolicitudAction,
    initialCreateState,
  );
  const hasClientes = clientesDisponibles.length > 0;
  const hasClienteAsociado = Boolean(clienteAsociado);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">
        Cliente asociado
      </h2>

      {clienteAsociado ? (
        <div className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950">
          <p className="font-semibold">{clienteAsociado.nombre}</p>
          <p className="mt-1">{clienteAsociado.telefono}</p>
          {clienteAsociado.email ? (
            <p className="mt-1">{clienteAsociado.email}</p>
          ) : null}
          <Link
            href={`/dashboard/clientes/${clienteAsociado.id}`}
            className="mt-3 inline-flex text-sm font-semibold text-teal-800 underline-offset-4 hover:underline"
          >
            Ver cliente
          </Link>
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Esta solicitud todavía no tiene un cliente interno asociado.
        </p>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <form action={associateAction} aria-busy={associatePending}>
          <input type="hidden" name="solicitud_id" value={solicitudId} />

          <label
            htmlFor="cliente_id"
            className="text-sm font-medium text-zinc-900"
          >
            Cliente existente
          </label>
          <select
            id="cliente_id"
            name="cliente_id"
            defaultValue={clienteAsociado?.id ?? ""}
            disabled={!hasClientes || associatePending}
            className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
          >
            <option value="" disabled>
              Selecciona un cliente
            </option>
            {clientesDisponibles.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nombre} · {cliente.telefono}
              </option>
            ))}
          </select>

          {clientesLoadError ? (
            <p className="mt-2 text-sm leading-5 text-red-700">
              {clientesLoadError}
            </p>
          ) : null}

          {associateState.message ? (
            <p
              className={`mt-3 rounded-md border px-4 py-3 text-sm leading-6 ${
                associateState.ok
                  ? "border-teal-200 bg-teal-50 text-teal-900"
                  : "border-red-200 bg-red-50 text-red-900"
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
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {associatePending
              ? "Guardando..."
              : hasClienteAsociado
                ? "Actualizar cliente asociado"
                : "Asociar cliente"}
          </button>
        </form>

        <form action={createAction} aria-busy={createPending}>
          <input type="hidden" name="solicitud_id" value={solicitudId} />
          <h3 className="text-sm font-semibold text-zinc-950">
            Crear desde la solicitud
          </h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Crea un cliente básico usando el nombre, teléfono y correo ya
            guardados en esta solicitud.
          </p>

          {createState.message ? (
            <p
              className={`mt-3 rounded-md border px-4 py-3 text-sm leading-6 ${
                createState.ok
                  ? "border-teal-200 bg-teal-50 text-teal-900"
                  : "border-red-200 bg-red-50 text-red-900"
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
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
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
