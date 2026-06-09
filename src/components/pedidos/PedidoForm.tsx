"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import {
  createPedidoAction,
  type CreatePedidoActionState,
} from "@/app/dashboard/pedidos/nuevo/actions";
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
import type { PedidoField, PedidoPrioridad } from "@/lib/pedidos";
import { PEDIDO_PRIORITY_LABELS } from "@/lib/pedidos/labels";
import { getTodayDateInputValue } from "@/lib/utils";

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

function getFieldError(state: CreatePedidoActionState, field: PedidoField) {
  return state.fieldErrors?.[field];
}

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
  const todayInputDate = getTodayDateInputValue();

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-busy={pending}
      className="max-w-3xl"
    >
      <FormSection
        title="Datos del trabajo"
        description="Registra la información operativa inicial del pedido."
      >
        <div className="space-y-6">
          {state.message ? (
            <Alert
              variant={state.ok ? "success" : "danger"}
              aria-live="polite"
            >
              <p>{state.message}</p>
              {state.ok && state.pedidoId ? (
                <Link
                  href={`/dashboard/pedidos/${state.pedidoId}`}
                  className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand-primary underline underline-offset-4"
                >
                  Ver detalle del pedido {state.numeroPedido}
                </Link>
              ) : null}
            </Alert>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              id="cliente_id"
              label="Cliente"
              help={
                !clienteError
                  ? "Selecciona un cliente registrado o deja este campo vacío."
                  : undefined
              }
              helpId="cliente-help"
              error={clienteError}
              errorId="cliente-error"
              className="sm:col-span-2"
            >
              {({ describedBy, invalid }) => (
                <Select
                  id="cliente_id"
                  name="cliente_id"
                  defaultValue=""
                  invalid={invalid}
                  aria-describedby={describedBy}
                >
                  <option value="">Sin cliente asociado</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>

            <FormField
              id="title"
              label="Título del trabajo"
              required
              error={tituloError}
              className="sm:col-span-2"
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="title"
                  name="title"
                  type="text"
                  required
                  maxLength={160}
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
            >
              {({ describedBy, invalid }) => (
                <Textarea
                  id="description"
                  name="description"
                  required
                  maxLength={3000}
                  className="min-h-36"
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
            >
              {({ describedBy, invalid }) => (
                <Select
                  id="priority"
                  name="priority"
                  required
                  defaultValue="normal"
                  invalid={invalid}
                  aria-describedby={describedBy}
                >
                  {prioridades.map((priority) => (
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
              errorId="fecha-entrega-error"
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="estimated_delivery_date"
                  name="estimated_delivery_date"
                  type="date"
                  min={todayInputDate}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>
          </div>

          <FormActions note="Los campos marcados con * son obligatorios.">
            <Button type="submit" disabled={pending} className="w-full sm:w-auto">
              {pending ? "Creando..." : "Crear pedido"}
            </Button>
          </FormActions>
        </div>
      </FormSection>
    </form>
  );
}
