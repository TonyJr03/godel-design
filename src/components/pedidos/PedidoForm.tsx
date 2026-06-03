"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  createPedidoAction,
  type CreatePedidoActionState,
} from "@/app/dashboard/pedidos/nuevo/actions";
import type { PedidoField, PedidoPrioridad } from "@/lib/pedidos";
import { PEDIDO_PRIORITY_LABELS } from "@/lib/pedidos/labels";

export type PedidoFormCliente = {
  id: string;
  name: string;
};

type PedidoFormProps = {
  clientes: PedidoFormCliente[];
  prioridades: readonly PedidoPrioridad[];
};

const initialState: CreatePedidoActionState = {
  ok: false,
  message: "",
};

type FieldErrorProps = {
  id: string;
  message?: string;
};

function OptionalMark() {
  return (
    <span className="ml-1 text-sm font-normal text-zinc-500">(opcional)</span>
  );
}

function FieldError({ id, message }: FieldErrorProps) {
  if (!message) {
    return null;
  }

  return (
    <p id={id} className="mt-2 text-sm leading-5 text-red-700">
      {message}
    </p>
  );
}

function getFieldError(state: CreatePedidoActionState, field: PedidoField) {
  return state.fieldErrors?.[field];
}

const baseInputClass =
  "mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20";

const labelClass = "text-sm font-medium text-zinc-900";

export function PedidoForm({ clientes, prioridades }: PedidoFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    createPedidoAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state.ok]);

  const clienteError = getFieldError(state, "cliente_id");
  const tituloError = getFieldError(state, "title");
  const descripcionError = getFieldError(state, "description");
  const prioridadError = getFieldError(state, "priority");
  const fechaEntregaError = getFieldError(state, "estimated_delivery_date");

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-busy={pending}
      className="max-w-3xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="space-y-6">
        {state.message ? (
          <div
            className={
              state.ok
                ? "rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-900"
                : "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900"
            }
            role={state.ok ? "status" : "alert"}
            aria-live="polite"
          >
            <p>{state.message}</p>
            {state.ok && state.pedidoId ? (
              <Link
                href={`/dashboard/pedidos/${state.pedidoId}`}
                className="mt-2 inline-flex text-sm font-semibold text-teal-900 underline underline-offset-4"
              >
                Ver detalle del pedido {state.numeroPedido}
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="cliente_id">
              Cliente <OptionalMark />
            </label>
            <select
              className={baseInputClass}
              id="cliente_id"
              name="cliente_id"
              defaultValue=""
              aria-invalid={Boolean(clienteError)}
              aria-describedby={clienteError ? "cliente-error" : "cliente-help"}
            >
              <option value="">
                Sin cliente asociado
              </option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.name}
                </option>
              ))}
            </select>
            {!clienteError ? (
              <p id="cliente-help" className="mt-1 text-xs text-zinc-500">
                Selecciona un cliente registrado o deja este campo vacío.
              </p>
            ) : null}
            <FieldError id="cliente-error" message={clienteError} />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="title">
              Título del trabajo <span className="text-red-700">*</span>
            </label>
            <input
              className={baseInputClass}
              id="title"
              name="title"
              type="text"
              required
              maxLength={160}
              aria-invalid={Boolean(tituloError)}
              aria-describedby={tituloError ? "title-error" : undefined}
            />
            <FieldError id="title-error" message={tituloError} />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="description">
              Descripción <span className="text-red-700">*</span>
            </label>
            <textarea
              className={`${baseInputClass} min-h-36 resize-y`}
              id="description"
              name="description"
              required
              maxLength={3000}
              aria-invalid={Boolean(descripcionError)}
              aria-describedby={
                descripcionError ? "description-error" : undefined
              }
            />
            <FieldError id="description-error" message={descripcionError} />
          </div>

          <div>
            <label className={labelClass} htmlFor="priority">
              Prioridad <span className="text-red-700">*</span>
            </label>
            <select
              className={baseInputClass}
              id="priority"
              name="priority"
              required
              defaultValue="normal"
              aria-invalid={Boolean(prioridadError)}
              aria-describedby={prioridadError ? "priority-error" : undefined}
            >
              {prioridades.map((priority) => (
                <option key={priority} value={priority}>
                  {PEDIDO_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
            <FieldError id="priority-error" message={prioridadError} />
          </div>

          <div>
            <label className={labelClass} htmlFor="estimated_delivery_date">
              Fecha estimada de entrega <OptionalMark />
            </label>
            <input
              className={baseInputClass}
              id="estimated_delivery_date"
              name="estimated_delivery_date"
              type="date"
              aria-invalid={Boolean(fechaEntregaError)}
              aria-describedby={
                fechaEntregaError ? "fecha-entrega-error" : undefined
              }
            />
            <FieldError
              id="fecha-entrega-error"
              message={fechaEntregaError}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-zinc-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-zinc-500">
            Los campos marcados con * son obligatorios.
          </p>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {pending ? "Creando..." : "Crear pedido"}
          </button>
        </div>
      </div>
    </form>
  );
}
