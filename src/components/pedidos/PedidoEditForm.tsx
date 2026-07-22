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
import {
  PEDIDO_PRIORIDADES,
  PEDIDO_PRIORITY_LABELS,
  type InternalPedidoDetail,
  type PedidoEditField,
} from "@/lib/pedidos";

type PedidoEditFormProps = {
  pedido: InternalPedidoDetail;
  action: PedidoDetailAction<UpdatePedidoDataActionState>;
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

  const tituloError = getFieldError(state, "title");
  const descripcionError = getFieldError(state, "description");
  const totalAmountError = getFieldError(state, "total_amount");
  const prioridadError = getFieldError(state, "priority");
  const fechaEntregaError = getFieldError(state, "estimated_delivery_date");

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
              help="Si cambias esta fecha, selecciona hoy o una fecha futura."
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
            <Button type="submit" disabled={pending} className="w-full sm:w-auto">
              {pending ? "Guardando cambios..." : "Guardar cambios"}
            </Button>
          </FormActions>
        </div>
      </FormSection>
    </form>
  );
}
