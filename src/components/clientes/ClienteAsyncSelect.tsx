"use client";

import {
  AsyncCombobox,
  type AsyncComboboxOption,
} from "@/components/forms";
import type { ClienteSelectorOption } from "@/lib/clientes";

type ClienteAsyncSelectProps = {
  id: string;
  name?: string;
  defaultOption?: ClienteSelectorOption | null;
  disabled?: boolean;
  invalid?: boolean;
  ariaDescribedBy?: string;
  allowEmpty?: boolean;
  required?: boolean;
  onValueChange?: (option: ClienteSelectorOption | null) => void;
};

type ClienteSelectorResponse = {
  options?: unknown;
  message?: unknown;
};

const CLIENTES_SELECTOR_ENDPOINT = "/api/internal/selectors/clientes";
const DEFAULT_NAME = "cliente_id";
const LOAD_ERROR_MESSAGE =
  "No se pudieron cargar los clientes. Intentalo nuevamente.";

function isClienteSelectorOption(
  option: unknown,
): option is ClienteSelectorOption {
  if (!option || typeof option !== "object") {
    return false;
  }

  const candidate = option as Partial<ClienteSelectorOption>;

  return (
    typeof candidate.value === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.description === "string"
  );
}

function parseClienteSelectorResponse(
  body: ClienteSelectorResponse,
): ClienteSelectorOption[] {
  if (!Array.isArray(body.options)) {
    throw new Error(LOAD_ERROR_MESSAGE);
  }

  if (!body.options.every(isClienteSelectorOption)) {
    throw new Error(LOAD_ERROR_MESSAGE);
  }

  return body.options;
}

function getHttpErrorMessage(status: number) {
  if (status === 401) {
    return "Debes iniciar sesion para buscar clientes.";
  }

  if (status === 403) {
    return "No tienes permiso para buscar clientes.";
  }

  return LOAD_ERROR_MESSAGE;
}

async function loadClienteOptions(query: string, signal: AbortSignal) {
  const url = new URL(CLIENTES_SELECTOR_ENDPOINT, window.location.origin);

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

  const body = (await response.json()) as ClienteSelectorResponse;

  return parseClienteSelectorResponse(body);
}

export function ClienteAsyncSelect({
  id,
  name = DEFAULT_NAME,
  defaultOption = null,
  disabled = false,
  invalid = false,
  ariaDescribedBy,
  allowEmpty = false,
  required = false,
  onValueChange,
}: ClienteAsyncSelectProps) {
  return (
    <AsyncCombobox
      id={id}
      name={name}
      defaultOption={defaultOption}
      placeholder="Buscar cliente por nombre, telefono o correo"
      searchPlaceholder="Buscar cliente por nombre, telefono o correo"
      emptyMessage="No encontramos clientes con esa busqueda."
      minimumQueryLength={2}
      disabled={disabled}
      invalid={invalid}
      ariaDescribedBy={ariaDescribedBy}
      allowClear={allowEmpty}
      required={required}
      clearLabel="Sin cliente asociado"
      loadOptions={loadClienteOptions}
      onValueChange={(option: AsyncComboboxOption | null) => {
        onValueChange?.(option as ClienteSelectorOption | null);
      }}
    />
  );
}
