"use client";

import { useMemo } from "react";
import {
  AsyncCombobox,
  type AsyncComboboxOption,
} from "@/components/forms";
import type { TaskTemplateSelectorOption } from "@/lib/task-templates";

type PedidoTaskTemplateAsyncSelectProps = {
  pedidoId: string;
  id: string;
  name?: string;
  disabled?: boolean;
  invalid?: boolean;
  ariaDescribedBy?: string;
  required?: boolean;
  onValueChange?: (option: TaskTemplateSelectorOption | null) => void;
};

type TaskTemplateSelectorResponse = {
  options?: unknown;
  message?: unknown;
};

const TASK_TEMPLATES_SELECTOR_ENDPOINT =
  "/api/internal/selectors/plantillas-tareas";
const DEFAULT_NAME = "template_id";
const LOAD_ERROR_MESSAGE =
  "No se pudieron cargar las plantillas disponibles. Intentalo nuevamente.";

function isTaskTemplateSelectorOption(
  option: unknown,
): option is TaskTemplateSelectorOption {
  if (!option || typeof option !== "object") {
    return false;
  }

  const candidate = option as Partial<TaskTemplateSelectorOption>;

  return (
    typeof candidate.value === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.description === "string"
  );
}

function parseTaskTemplateSelectorResponse(
  body: TaskTemplateSelectorResponse,
): TaskTemplateSelectorOption[] {
  if (!Array.isArray(body.options)) {
    throw new Error(LOAD_ERROR_MESSAGE);
  }

  if (!body.options.every(isTaskTemplateSelectorOption)) {
    throw new Error(LOAD_ERROR_MESSAGE);
  }

  return body.options;
}

function getHttpErrorMessage(status: number) {
  if (status === 401) {
    return "Debes iniciar sesion para buscar plantillas.";
  }

  if (status === 404) {
    return "El pedido solicitado no existe.";
  }

  if (status === 409) {
    return "No se pueden cargar plantillas para este pedido en este momento.";
  }

  return LOAD_ERROR_MESSAGE;
}

function createLoadTaskTemplateOptions(pedidoId: string) {
  return async function loadTaskTemplateOptions(
    query: string,
    signal: AbortSignal,
  ) {
    const url = new URL(
      TASK_TEMPLATES_SELECTOR_ENDPOINT,
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

    const body = (await response.json()) as TaskTemplateSelectorResponse;

    return parseTaskTemplateSelectorResponse(body);
  };
}

export function PedidoTaskTemplateAsyncSelect({
  pedidoId,
  id,
  name = DEFAULT_NAME,
  disabled = false,
  invalid = false,
  ariaDescribedBy,
  required = true,
  onValueChange,
}: PedidoTaskTemplateAsyncSelectProps) {
  const loadOptions = useMemo(
    () => createLoadTaskTemplateOptions(pedidoId),
    [pedidoId],
  );

  return (
    <AsyncCombobox
      id={id}
      name={name}
      placeholder="Buscar plantilla por nombre"
      searchPlaceholder="Buscar plantilla por nombre"
      emptyMessage="No hay plantillas activas con tareas para esa busqueda."
      minimumQueryLength={2}
      disabled={disabled}
      invalid={invalid}
      ariaDescribedBy={ariaDescribedBy}
      required={required}
      loadOptions={loadOptions}
      onValueChange={(option: AsyncComboboxOption | null) => {
        onValueChange?.(option as TaskTemplateSelectorOption | null);
      }}
    />
  );
}
