"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  convertSolicitudToPedidoAction,
  type ConvertSolicitudToPedidoActionState,
} from "@/app/dashboard/solicitudes/[id]/actions";
import type { Enums } from "@/types/database";

type SolicitudConvertPedidoFormProps = {
  solicitudId: string;
  status: Enums<"solicitud_estado">;
  clienteId: string | null;
  convertedOrderId: string | null;
};

const initialState: ConvertSolicitudToPedidoActionState = {
  ok: false,
  message: "",
};

export function SolicitudConvertPedidoForm({
  solicitudId,
  status,
  clienteId,
  convertedOrderId,
}: SolicitudConvertPedidoFormProps) {
  const [state, formAction, pending] = useActionState(
    convertSolicitudToPedidoAction,
    initialState,
  );
  const currentPedidoId = state.pedidoId ?? convertedOrderId;
  const canConvert = status === "aprobada" && Boolean(clienteId) && !currentPedidoId;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">
        Conversión a pedido
      </h2>

      {state.message ? (
        <div
          className={
            state.ok
              ? "mt-4 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-900"
              : "mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900"
          }
          role={state.ok ? "status" : "alert"}
          aria-live="polite"
        >
          <p>{state.message}</p>
          {state.ok && currentPedidoId ? (
            <Link
              href={`/dashboard/pedidos/${currentPedidoId}`}
              className="mt-2 inline-flex text-sm font-semibold text-teal-900 underline underline-offset-4"
            >
              Ver pedido {state.numeroPedido}
            </Link>
          ) : null}
        </div>
      ) : null}

      {currentPedidoId ? (
        <div className="mt-4 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-900">
          <p>Esta solicitud ya fue convertida en pedido.</p>
          <Link
            href={`/dashboard/pedidos/${currentPedidoId}`}
            className="mt-2 inline-flex font-semibold underline underline-offset-4"
          >
            Ver pedido
          </Link>
        </div>
      ) : status !== "aprobada" ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          La solicitud debe estar aprobada antes de convertirse en pedido.
        </p>
      ) : !clienteId ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          Asocia un cliente antes de convertir esta solicitud en pedido.
        </p>
      ) : (
        <form action={formAction} aria-busy={pending} className="mt-5">
          <input type="hidden" name="solicitud_id" value={solicitudId} />
          <button
            type="submit"
            disabled={!canConvert || pending}
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {pending ? "Convirtiendo..." : "Convertir en pedido"}
          </button>
        </form>
      )}
    </section>
  );
}
