"use client";

import { useActionState, useEffect } from "react";

import type {
  PedidoDetailAction,
  UpdatePedidoDataActionState,
} from "@/app/(interno)/dashboard/pedidos/[id]/actions";
import {
  Alert,
  Button,
  FormActions,
  FormField,
  FormSection,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import type { InternalPedidoDetail } from "@/lib/pedidos/get-internal-pedido-detail-types";
import { PEDIDO_PRIORITY_LABELS } from "@/lib/pedidos/labels";
import {
  PEDIDO_PRIORIDADES,
  type PedidoEditField,
} from "@/lib/pedidos/order-validation";
import {
  SERVICE_UNAVAILABLE_LABEL,
} from "@/lib/service-types/labels";
import type { OperationalServiceType } from "@/lib/service-types/types";
import { WORKFLOW_TYPES } from "@/lib/workflow-types";

type PedidoEditFormProps = {
  pedido: InternalPedidoDetail;
  action: PedidoDetailAction<UpdatePedidoDataActionState>;
  serviceTypes: OperationalServiceType[];
  serviceTypesLoadError?: string;
  onSuccess?: (state: UpdatePedidoDataActionState) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

const initialState: UpdatePedidoDataActionState = {
  ok: false,
  message: "",
};

function getFieldError(
  state: UpdatePedidoDataActionState,
  field: PedidoEditField,
) {
  return state.fieldErrors?.[field];
}

export function PedidoEditForm({
  pedido,
  action,
  serviceTypes,
  serviceTypesLoadError,
  onSuccess,
  onDirtyChange,
}: PedidoEditFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.ok) {
      onDirtyChange?.(false);
      onSuccess?.(state);
    }
  }, [onDirtyChange, onSuccess, state]);

  const serviceIdError = getFieldError(state, "service_id");
  const tituloError = getFieldError(state, "title");
  const descripcionError = getFieldError(state, "description");
  const totalAmountError = getFieldError(state, "total_amount");
  const prioridadError = getFieldError(state, "priority");
  const fechaEntregaError = getFieldError(state, "estimated_delivery_date");
  const isPrintWorkflow = pedido.workflow_type === WORKFLOW_TYPES.IMPRESION;
  const workflowServices = serviceTypes.filter(
    (service) => service.workflowType === pedido.workflow_type,
  );
  const currentService = workflowServices.find(
    (service) => service.id === pedido.service_id,
  );
  const fixedServiceName =
    currentService?.name ?? pedido.service?.name ?? SERVICE_UNAVAILABLE_LABEL;
  const shouldUseFixedService =
    isPrintWorkflow || Boolean(serviceTypesLoadError) || !currentService;
  const hasEditableServiceOptions =
    !shouldUseFixedService && workflowServices.length > 0;
  const canSubmit = Boolean(
    hasEditableServiceOptions || (shouldUseFixedService && pedido.service_id),
  );

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="w-full"
      onChange={() => onDirtyChange?.(true)}
    >
      <FormSection compact>
        <div className="space-y-4">
          {state.message ? (
            <Alert
              variant={state.ok ? "success" : "danger"}
              title={
                state.ok
                  ? "Cambios guardados"
                  : "No se pudieron guardar los cambios"
              }
              aria-live="polite"
            >
              <p>{state.message}</p>
            </Alert>
          ) : null}

          {serviceTypesLoadError ? (
            <Alert
              variant={pedido.service_id ? "warning" : "danger"}
              title="No se pudo cargar el catálogo de servicios"
            >
              <p>{serviceTypesLoadError}</p>
              {pedido.service_id ? (
                <p className="mt-1">
                  Puedes guardar los demás campos. El servicio actual se
                  conservará sin cambios.
                </p>
              ) : (
                <p className="mt-1">
                  El pedido no tiene un servicio válido para conservar. Vuelve a
                  intentar cuando el catálogo esté disponible.
                </p>
              )}
            </Alert>
          ) : null}

          {!serviceTypesLoadError && !currentService && pedido.service_id ? (
            <Alert variant="warning">
              El servicio actual no está disponible en el catálogo. Puedes
              guardar los demás campos conservando el servicio actual.
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="title"
              label="Título"
              required
              error={tituloError}
              className="sm:col-span-2"
              compact
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="title"
                  name="title"
                  type="text"
                  required
                  maxLength={160}
                  defaultValue={pedido.title}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>

            <FormField
              id="description"
              label="Descripción"
              required
              error={descripcionError}
              className="sm:col-span-2"
              compact
            >
              {({ describedBy, invalid }) => (
                <Textarea
                  id="description"
                  name="description"
                  required
                  maxLength={3000}
                  defaultValue={pedido.description}
                  className="min-h-28"
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>

            {hasEditableServiceOptions ? (
              <FormField
                id="service_id"
                label="Servicio"
                required
                error={serviceIdError}
                compact
              >
                {({ describedBy, invalid }) => (
                  <Select
                    id="service_id"
                    name="service_id"
                    required
                    defaultValue={pedido.service_id ?? ""}
                    invalid={invalid}
                    aria-describedby={describedBy}
                  >
                    {workflowServices.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
            ) : (
              <FormField
                id="service_id_display"
                label="Servicio"
                required
                error={serviceIdError}
                compact
              >
                {({ describedBy, invalid }) => (
                  <>
                    <Input
                      id="service_id_display"
                      type="text"
                      readOnly
                      value={fixedServiceName}
                      invalid={invalid}
                      aria-describedby={describedBy}
                    />
                    <input
                      type="hidden"
                      name="service_id"
                      value={pedido.service_id ?? ""}
                    />
                  </>
                )}
              </FormField>
            )}

            <FormField
              id="priority"
              label="Prioridad"
              required
              error={prioridadError}
              compact
            >
              {({ describedBy, invalid }) => (
                <Select
                  id="priority"
                  name="priority"
                  required
                  defaultValue={pedido.priority}
                  invalid={invalid}
                  aria-describedby={describedBy}
                >
                  {PEDIDO_PRIORIDADES.map((priority) => (
                    <option key={priority} value={priority}>
                      {PEDIDO_PRIORITY_LABELS[priority]}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>

            <FormField
              id="estimated_delivery_date"
              label="Fecha estimada de entrega"
              error={fechaEntregaError}
              compact
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="estimated_delivery_date"
                  name="estimated_delivery_date"
                  type="date"
                  defaultValue={pedido.estimated_delivery_date ?? ""}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>

            <FormField
              id="total_amount"
              label="Precio del pedido"
              required
              error={totalAmountError}
              compact
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="total_amount"
                  name="total_amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  required
                  defaultValue={String(pedido.payment.totalAmount)}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>
          </div>

          <FormActions compact note={undefined}>
            <Button
              type="submit"
              disabled={pending || !canSubmit}
              className="w-full sm:w-auto"
            >
              {pending ? "Guardando cambios..." : "Guardar cambios"}
            </Button>
          </FormActions>
        </div>
      </FormSection>
    </form>
  );
}
