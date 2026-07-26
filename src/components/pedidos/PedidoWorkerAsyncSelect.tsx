"use client";

import { useMemo } from "react";
import {
  AsyncCombobox,
  type AsyncComboboxOption,
} from "@/components/forms";
import type { AssignableWorkerSelectorOption } from "@/lib/pedidos";

type PedidoWorkerAsyncSelectProps = {
  pedidoId: string;
  id: string;
  name?: string;
  disabled?: boolean;
  invalid?: boolean;
  ariaDescribedBy?: string;
  required?: boolean;
  onValueChange?: (option: AssignableWorkerSelectorOption | null) => void;
};

type AssignableWorkerSelectorResponse = {
  options?: unknown;
  message?: unknown;
};

const ASSIGNABLE_WORKERS_SELECTOR_ENDPOINT =
  "/api/internal/selectors/personal-asignable";
const DEFAULT_NAME = "assigned_profile_id";
const LOAD_ERROR_MESSAGE =
  "No se pudo cargar el personal asignable. Intentalo nuevamente.";

function isAssignableWorkerSelectorOption(
  option: unknown,
): option is AssignableWorkerSelectorOption {
  if (!option || typeof option !== "object") {
    return false;
  }

  const candidate = option as Partial<AssignableWorkerSelectorOption>;

  return (
    typeof candidate.value === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.description === "string"
  );
}

function parseAssignableWorkerSelectorResponse(
  body: AssignableWorkerSelectorResponse,
): AssignableWorkerSelectorOption[] {
  if (!Array.isArray(body.options)) {
    throw new Error(LOAD_ERROR_MESSAGE);
  }

  if (!body.options.every(isAssignableWorkerSelectorOption)) {
    throw new Error(LOAD_ERROR_MESSAGE);
  }

  return body.options;
}

function getHttpErrorMessage(status: number) {
  if (status === 401) {
    return "Debes iniciar sesion para buscar personal.";
  }

  if (status === 403) {
    return "No tienes permiso para asignar personal.";
  }

  if (status === 404) {
    return "El pedido solicitado no existe.";
  }

  return LOAD_ERROR_MESSAGE;
}

function createLoadWorkerOptions(pedidoId: string) {
  return async function loadWorkerOptions(
    query: string,
    signal: AbortSignal,
  ) {
    const url = new URL(
      ASSIGNABLE_WORKERS_SELECTOR_ENDPOINT,
      window.location.origin,
    );

    url.searchParams.set("pedido_id", pedidoId);

    if (query) {
      url.searchParams.set("q", query);
    }

    const response = await fetch(url, {
      cache: "no-store",
      signal,
    });

    if (!response.ok) {
      throw new Error(getHttpErrorMessage(response.status));
    }

    const body = (await response.json()) as AssignableWorkerSelectorResponse;

    return parseAssignableWorkerSelectorResponse(body);
  };
}

export function PedidoWorkerAsyncSelect({
  pedidoId,
  id,
  name = DEFAULT_NAME,
  disabled = false,
  invalid = false,
  ariaDescribedBy,
  required = true,
  onValueChange,
}: PedidoWorkerAsyncSelectProps) {
  const loadOptions = useMemo(
    () => createLoadWorkerOptions(pedidoId),
    [pedidoId],
  );

  return (
    <AsyncCombobox
      id={id}
      name={name}
      placeholder="Buscar personal por nombre"
      searchPlaceholder="Buscar personal por nombre"
      emptyMessage="No hay usuarios disponibles con esa busqueda."
      minimumQueryLength={2}
      disabled={disabled}
      invalid={invalid}
      ariaDescribedBy={ariaDescribedBy}
      required={required}
      listboxPlacement="top"
      loadOptions={loadOptions}
      onValueChange={(option: AsyncComboboxOption | null) => {
        onValueChange?.(option as AssignableWorkerSelectorOption | null);
      }}
    />
  );
}
