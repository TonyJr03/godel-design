"use client";

import Link from "next/link";
import { useActionState } from "react";
import type {
  ConvertSolicitudToPedidoActionState,
  SolicitudDetailAction,
} from "@/app/dashboard/solicitudes/[id]/actions";
import { PEDIDO_PRIORITY_LABELS } from "@/lib/pedidos/labels";
import { PEDIDO_PRIORITIES } from "@/lib/pedidos/status";
import { getSolicitudServiceTypeLabel } from "@/lib/solicitudes/labels";
import { getTodayDateInputValue } from "@/lib/utils";
import type { Enums } from "@/types/database";

type SolicitudConvertPedidoFormProps = {
  convertAction: SolicitudDetailAction<ConvertSolicitudToPedidoActionState>;
  status: Enums<"solicitud_estado">;
  clienteId: string | null;
  convertedOrderId: string | null;
  serviceType: string;
  solicitudDescription: string;
  solicitudDesiredDate: string | null;
};

const initialState: ConvertSolicitudToPedidoActionState = {
  ok: false,
  message: "",
};

function OptionalMark() {
  return (
    <span className="ml-1 text-sm font-normal text-zinc-500">(opcional)</span>
  );
}

export function SolicitudConvertPedidoForm({
  convertAction,
  status,
  clienteId,
  convertedOrderId,
  serviceType,
  solicitudDescription,
  solicitudDesiredDate,
}: SolicitudConvertPedidoFormProps) {
  const [state, formAction, pending] = useActionState(
    convertAction,
    initialState,
  );
  const currentPedidoId = state.pedidoId ?? convertedOrderId;
  const canConvert = status === "aprobada" && Boolean(clienteId) && !currentPedidoId;
  const titleError = state.fieldErrors?.title;
  const descriptionError = state.fieldErrors?.description;
  const priorityError = state.fieldErrors?.priority;
  const estimatedDeliveryDateError =
    state.fieldErrors?.estimated_delivery_date;
  const titleValue = state.values?.title ?? "";
  const descriptionValue = state.values?.description ?? solicitudDescription;
  const priorityValue = state.values?.priority ?? "normal";
  const estimatedDeliveryDateValue =
    state.values?.estimated_delivery_date ?? solicitudDesiredDate ?? "";
  const serviceTypeLabel = getSolicitudServiceTypeLabel(serviceType);
  const todayInputDate = getTodayDateInputValue();

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">
        Conversión a pedido
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        Para convertir la solicitud debe estar aprobada, tener un cliente
        asociado y contar con un título real de pedido. El tipo de servicio
        seleccionado por el cliente es solo una referencia.
      </p>

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
        <form action={formAction} aria-busy={pending} className="mt-5 space-y-5">
          <div className="border-l-2 border-zinc-200 pl-4 text-sm leading-6 text-zinc-700">
            <p>
              <span className="font-semibold text-zinc-900">
                Tipo de servicio de la solicitud:
              </span>{" "}
              {serviceTypeLabel}
            </p>
            <p className="mt-2 text-zinc-600">
              Usa esta información como referencia inicial, no como título
              automático del pedido.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-900" htmlFor="title">
              Título del pedido <span className="text-red-700">*</span>
            </label>
            <input
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
              id="title"
              name="title"
              type="text"
              defaultValue={titleValue}
              maxLength={160}
              required
              aria-invalid={Boolean(titleError)}
              aria-describedby={titleError ? "convert-title-error" : "convert-title-help"}
            />
            <p id="convert-title-help" className="mt-2 text-sm leading-5 text-zinc-500">
              Define un nombre claro para identificar este trabajo internamente.
            </p>
            {titleError ? (
              <p id="convert-title-error" className="mt-2 text-sm leading-5 text-red-700">
                {titleError}
              </p>
            ) : null}
          </div>

          <div>
            <label
              className="text-sm font-medium text-zinc-900"
              htmlFor="priority"
            >
              Prioridad <span className="text-red-700">*</span>
            </label>
            <select
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
              id="priority"
              name="priority"
              required
              defaultValue={priorityValue}
              aria-invalid={Boolean(priorityError)}
              aria-describedby={
                priorityError ? "convert-priority-error" : "convert-priority-help"
              }
            >
              {PEDIDO_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PEDIDO_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
            <p
              id="convert-priority-help"
              className="mt-2 text-sm leading-5 text-zinc-500"
            >
              Define la prioridad operativa inicial del pedido.
            </p>
            {priorityError ? (
              <p
                id="convert-priority-error"
                className="mt-2 text-sm leading-5 text-red-700"
              >
                {priorityError}
              </p>
            ) : null}
          </div>

          <div>
            <label
              className="text-sm font-medium text-zinc-900"
              htmlFor="estimated_delivery_date"
            >
              Fecha estimada de entrega <OptionalMark />
            </label>
            <input
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
              id="estimated_delivery_date"
              name="estimated_delivery_date"
              type="date"
              defaultValue={estimatedDeliveryDateValue}
              min={todayInputDate}
              aria-invalid={Boolean(estimatedDeliveryDateError)}
              aria-describedby={
                estimatedDeliveryDateError
                  ? "convert-estimated-delivery-date-error"
                  : "convert-estimated-delivery-date-help"
              }
            />
            <p
              id="convert-estimated-delivery-date-help"
              className="mt-2 text-sm leading-5 text-zinc-500"
            >
              Opcional. Si la defines, debe ser desde hoy en adelante.
            </p>
            {estimatedDeliveryDateError ? (
              <p
                id="convert-estimated-delivery-date-error"
                className="mt-2 text-sm leading-5 text-red-700"
              >
                {estimatedDeliveryDateError}
              </p>
            ) : null}
          </div>

          <div>
            <label
              className="text-sm font-medium text-zinc-900"
              htmlFor="description"
            >
              Descripción del pedido <span className="text-red-700">*</span>
            </label>
            <textarea
              className="mt-2 min-h-36 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
              id="description"
              name="description"
              defaultValue={descriptionValue}
              maxLength={3000}
              required
              aria-invalid={Boolean(descriptionError)}
              aria-describedby={
                descriptionError
                  ? "convert-description-error"
                  : "convert-description-help"
              }
            />
            <p
              id="convert-description-help"
              className="mt-2 text-sm leading-5 text-zinc-500"
            >
              Puedes ajustar la descripción original de la solicitud antes de
              crear el pedido.
            </p>
            {descriptionError ? (
              <p
                id="convert-description-error"
                className="mt-2 text-sm leading-5 text-red-700"
              >
                {descriptionError}
              </p>
            ) : null}
          </div>

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
