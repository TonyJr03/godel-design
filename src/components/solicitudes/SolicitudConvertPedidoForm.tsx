"use client";

import Link from "next/link";
import { useActionState } from "react";
import type {
  ConvertSolicitudToPedidoActionState,
  SolicitudDetailAction,
} from "@/app/dashboard/solicitudes/[id]/actions";
import { WorkflowTypeBadge } from "@/components/solicitudes/WorkflowTypeBadge";
import { PEDIDO_PRIORITY_LABELS } from "@/lib/pedidos/labels";
import { PEDIDO_PRIORITIES } from "@/lib/pedidos/status";
import { getSolicitudServiceTypeLabel } from "@/lib/solicitudes/labels";
import { getTodayDateInputValue } from "@/lib/utils";
import {
  WORKFLOW_TYPES,
  WORKFLOW_TYPE_LABELS,
  type WorkflowType,
} from "@/lib/workflow-types";
import type { Enums } from "@/types/database";

type SolicitudConvertPedidoFormProps = {
  convertAction: SolicitudDetailAction<ConvertSolicitudToPedidoActionState>;
  status: Enums<"solicitud_estado">;
  clienteId: string | null;
  convertedOrderId: string | null;
  workflowType: WorkflowType;
  serviceType: string;
  solicitudDescription: string;
  solicitudDesiredDate: string | null;
};

const DEFAULT_PRINT_PEDIDO_TITLE = "Pedido de impresión";

const initialState: ConvertSolicitudToPedidoActionState = {
  ok: false,
  message: "",
};

function OptionalMark() {
  return (
    <span className="ml-1 text-sm font-normal text-text-muted">(opcional)</span>
  );
}

export function SolicitudConvertPedidoForm({
  convertAction,
  status,
  clienteId,
  convertedOrderId,
  workflowType,
  serviceType,
  solicitudDescription,
  solicitudDesiredDate,
}: SolicitudConvertPedidoFormProps) {
  const [state, formAction, pending] = useActionState(
    convertAction,
    initialState,
  );
  const currentPedidoId = state.pedidoId ?? convertedOrderId;
  const canConvert =
    status === "aprobada" && Boolean(clienteId) && !currentPedidoId;
  const titleError = state.fieldErrors?.title;
  const descriptionError = state.fieldErrors?.description;
  const priorityError = state.fieldErrors?.priority;
  const estimatedDeliveryDateError =
    state.fieldErrors?.estimated_delivery_date;
  const isPrintWorkflow = workflowType === WORKFLOW_TYPES.IMPRESION;
  const titleValue =
    state.values?.title ?? (isPrintWorkflow ? DEFAULT_PRINT_PEDIDO_TITLE : "");
  const descriptionValue = state.values?.description ?? solicitudDescription;
  const priorityValue = state.values?.priority ?? "normal";
  const estimatedDeliveryDateValue =
    state.values?.estimated_delivery_date ?? solicitudDesiredDate ?? "";
  const serviceTypeLabel = getSolicitudServiceTypeLabel(serviceType);
  const todayInputDate = getTodayDateInputValue();

  return (
    <section className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
      <h2 className="text-lg font-semibold text-text-primary">
        Conversión a pedido
      </h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        Para convertir la solicitud debe estar aprobada, tener un cliente
        asociado y contar con la información operativa necesaria. El tipo de
        servicio seleccionado por el cliente es solo una referencia.
      </p>

      {state.message ? (
        <div
          className={
            state.ok
              ? "mt-4 rounded-(--radius-control) border border-success/30 bg-success-soft px-4 py-3 text-sm leading-6 text-success"
              : "mt-4 rounded-(--radius-control) border border-danger/30 bg-danger-soft px-4 py-3 text-sm leading-6 text-danger"
          }
          role={state.ok ? "status" : "alert"}
          aria-live="polite"
        >
          <p>{state.message}</p>
          {state.ok && currentPedidoId ? (
            <Link
              href={`/dashboard/pedidos/${currentPedidoId}`}
              className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand-primary underline underline-offset-4"
            >
              Ver pedido {state.numeroPedido}
            </Link>
          ) : null}
        </div>
      ) : null}

      {currentPedidoId ? (
        <div className="mt-4 rounded-(--radius-control) border border-success/30 bg-success-soft px-4 py-3 text-sm leading-6 text-success">
          <p>Esta solicitud ya fue convertida en pedido.</p>
          <Link
            href={`/dashboard/pedidos/${currentPedidoId}`}
            className="mt-2 inline-flex font-semibold underline underline-offset-4"
          >
            Ver pedido
          </Link>
        </div>
      ) : status !== "aprobada" ? (
        <p className="mt-4 rounded-(--radius-control) border border-warning/30 bg-warning-soft px-4 py-3 text-sm leading-6 text-text-primary">
          La solicitud debe estar aprobada antes de convertirse en pedido.
        </p>
      ) : !clienteId ? (
        <p className="mt-4 rounded-(--radius-control) border border-warning/30 bg-warning-soft px-4 py-3 text-sm leading-6 text-text-primary">
          Asocia un cliente antes de convertir esta solicitud en pedido.
        </p>
      ) : (
        <form action={formAction} aria-busy={pending} className="mt-5 space-y-5">
          <div className="rounded-(--radius-control) border border-border bg-surface-muted px-4 py-3 text-sm leading-6 text-text-secondary">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-text-primary">
                Pedido de {WORKFLOW_TYPE_LABELS[workflowType].toLowerCase()}
              </span>
              <WorkflowTypeBadge workflowType={workflowType} />
            </p>
            <p>
              <span className="font-semibold text-text-primary">
                Tipo de servicio de la solicitud:
              </span>{" "}
              {serviceTypeLabel}
            </p>
            <p className="mt-2 text-text-secondary">
              {isPrintWorkflow
                ? "La descripción original se usa como base y puedes ajustarla antes de crear el pedido."
                : "Usa esta información como referencia inicial, no como título automático del pedido."}
            </p>
          </div>

          <div>
            <label
              className="text-sm font-medium text-text-primary"
              htmlFor="title"
            >
              Título del pedido
              {isPrintWorkflow ? (
                <OptionalMark />
              ) : (
                <span className="text-danger"> *</span>
              )}
            </label>
            <input
              className="mt-2 min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 py-2 text-base text-text-primary shadow-(--shadow-soft) placeholder:text-text-muted"
              id="title"
              name="title"
              type="text"
              defaultValue={titleValue}
              maxLength={160}
              required={!isPrintWorkflow}
              aria-invalid={Boolean(titleError)}
              aria-describedby={
                titleError ? "convert-title-error" : "convert-title-help"
              }
            />
            <p
              id="convert-title-help"
              className="mt-2 text-sm leading-5 text-text-secondary"
            >
              {isPrintWorkflow
                ? `Opcional. Si lo dejas vacío se usará “${DEFAULT_PRINT_PEDIDO_TITLE}”.`
                : "Define un nombre claro para identificar este trabajo internamente."}
            </p>
            {titleError ? (
              <p
                id="convert-title-error"
                className="mt-2 text-sm leading-5 text-danger"
              >
                {titleError}
              </p>
            ) : null}
          </div>

          <div>
            <label
              className="text-sm font-medium text-text-primary"
              htmlFor="priority"
            >
              Prioridad <span className="text-danger">*</span>
            </label>
            <select
              className="mt-2 min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 py-2 text-base text-text-primary shadow-(--shadow-soft)"
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
              className="mt-2 text-sm leading-5 text-text-secondary"
            >
              Define la prioridad operativa inicial del pedido.
            </p>
            {priorityError ? (
              <p
                id="convert-priority-error"
                className="mt-2 text-sm leading-5 text-danger"
              >
                {priorityError}
              </p>
            ) : null}
          </div>

          <div>
            <label
              className="text-sm font-medium text-text-primary"
              htmlFor="estimated_delivery_date"
            >
              Fecha estimada de entrega <OptionalMark />
            </label>
            <input
              className="mt-2 min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 py-2 text-base text-text-primary shadow-(--shadow-soft)"
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
              className="mt-2 text-sm leading-5 text-text-secondary"
            >
              Opcional. Si la defines, debe ser desde hoy en adelante.
            </p>
            {estimatedDeliveryDateError ? (
              <p
                id="convert-estimated-delivery-date-error"
                className="mt-2 text-sm leading-5 text-danger"
              >
                {estimatedDeliveryDateError}
              </p>
            ) : null}
          </div>

          <div>
            <label
              className="text-sm font-medium text-text-primary"
              htmlFor="description"
            >
              Descripción del pedido
              {isPrintWorkflow ? (
                <OptionalMark />
              ) : (
                <span className="text-danger"> *</span>
              )}
            </label>
            <textarea
              className="mt-2 min-h-36 w-full resize-y rounded-(--radius-control) border border-border-strong bg-surface px-3 py-2 text-base text-text-primary shadow-(--shadow-soft) placeholder:text-text-muted"
              id="description"
              name="description"
              defaultValue={descriptionValue}
              maxLength={3000}
              required={!isPrintWorkflow}
              aria-invalid={Boolean(descriptionError)}
              aria-describedby={
                descriptionError
                  ? "convert-description-error"
                  : "convert-description-help"
              }
            />
            <p
              id="convert-description-help"
              className="mt-2 text-sm leading-5 text-text-secondary"
            >
              {isPrintWorkflow
                ? "Puedes ajustarla. Si la dejas vacía, el servidor conservará la descripción original de la solicitud."
                : "Puedes ajustar la descripción original de la solicitud antes de crear el pedido."}
            </p>
            {descriptionError ? (
              <p
                id="convert-description-error"
                className="mt-2 text-sm leading-5 text-danger"
              >
                {descriptionError}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={!canConvert || pending}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Convirtiendo..." : "Convertir en pedido"}
          </button>
        </form>
      )}
    </section>
  );
}
