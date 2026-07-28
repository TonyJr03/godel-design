"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  createServiceTypeAction,
  updateServiceTypeAction,
  type ServiceTypeActionState,
} from "@/app/(interno)/dashboard/configuracion/servicios/actions";
import {
  Alert,
  Button,
  FormActions,
  FormField,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { WorkflowTypeBadge } from "@/components/ui/WorkflowTypeBadge";
import type {
  InternalServiceType,
  ServiceTypeField,
} from "@/lib/service-types";

type ServiceTypeFormCommonProps = {
  onSuccess?: (state: ServiceTypeActionState) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

type ServiceTypeFormProps = ServiceTypeFormCommonProps &
  (
    | {
        mode: "create";
        serviceType?: never;
        isLastPublicEncargo?: never;
      }
    | {
        mode: "edit";
        serviceType: InternalServiceType;
        isLastPublicEncargo?: boolean;
      }
  );

const initialState: ServiceTypeActionState = {
  ok: false,
  message: "",
};

function getFieldError(
  state: ServiceTypeActionState,
  field: ServiceTypeField,
) {
  return state.fieldErrors?.[field];
}

export function ServiceTypeForm({
  mode,
  serviceType,
  isLastPublicEncargo = false,
  onSuccess,
  onDirtyChange,
}: ServiceTypeFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const fieldPrefix = useId();
  const action =
    mode === "create" ? createServiceTypeAction : updateServiceTypeAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const isCreate = mode === "create";
  const [availabilityValue, setAvailabilityValue] = useState(
    serviceType?.isPubliclyAvailable === false ? "false" : "true",
  );
  const nameId = `${fieldPrefix}-name`;
  const descriptionId = `${fieldPrefix}-description`;
  const workflowId = `${fieldPrefix}-workflow`;
  const availabilityId = `${fieldPrefix}-availability`;
  const nameError = getFieldError(state, "name");
  const descriptionError = getFieldError(state, "description");
  const availabilityError = getFieldError(state, "isPubliclyAvailable");
  const workflowType = serviceType?.workflowType;
  const willHidePublicService =
    Boolean(serviceType?.isPubliclyAvailable) && availabilityValue === "false";
  const willHideImpresion =
    willHidePublicService && workflowType === "impresion";
  const willHideLastPublicEncargo =
    willHidePublicService &&
    workflowType === "encargo" &&
    isLastPublicEncargo;

  useEffect(() => {
    if (isCreate && state.ok) {
      formRef.current?.reset();
    }

    if (state.ok) {
      onDirtyChange?.(false);
      onSuccess?.(state);
    }
  }, [isCreate, onDirtyChange, onSuccess, state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-busy={pending}
      onChange={() => onDirtyChange?.(true)}
    >
      <div className="space-y-4">
        {state.message ? (
          <Alert
            variant={state.ok ? "success" : "danger"}
            title={
              state.ok
                ? isCreate
                  ? "Servicio creado"
                  : "Cambios guardados"
                : isCreate
                  ? "No se pudo crear el servicio"
                  : "No se pudieron guardar los cambios"
            }
            aria-live="polite"
          >
            <p>{state.message}</p>
          </Alert>
        ) : null}

        {serviceType ? (
          <input type="hidden" name="service_type_id" value={serviceType.id} />
        ) : null}

        {isCreate ? (
          <Alert variant="info" title="Flujo de trabajo">
            <p>Los nuevos servicios pertenecen al flujo de Encargo.</p>
          </Alert>
        ) : null}

        {workflowType === "impresion" ? (
          <Alert variant="info" title="Servicio del sistema">
            <p>
              Impresión conserva su flujo operativo. Solo puedes editar su
              nombre, descripción y disponibilidad pública.
            </p>
          </Alert>
        ) : null}

        {willHideImpresion ? (
          <Alert variant="warning" title="Impresión quedará oculta">
            <div className="space-y-2">
              <p>
                Al ocultarlo, el formulario público de impresión dejará de
                estar disponible.
              </p>
              <p>
                Los usuarios internos podrán continuar utilizando este
                servicio.
              </p>
            </div>
          </Alert>
        ) : null}

        {willHideLastPublicEncargo ? (
          <Alert variant="warning" title="Último servicio público de Encargo">
            <div className="space-y-2">
              <p>
                Este es el último servicio disponible públicamente del flujo de
                Encargo. Al ocultarlo, el formulario público de encargos dejará
                de estar disponible.
              </p>
              <p>
                Los usuarios internos podrán continuar utilizando este
                servicio.
              </p>
            </div>
          </Alert>
        ) : null}

        <div className="grid gap-4">
          <FormField
            id={nameId}
            label="Nombre"
            required
            error={nameError}
            compact
          >
            {({ describedBy, invalid }) => (
              <Input
                id={nameId}
                name="name"
                type="text"
                required
                minLength={2}
                maxLength={120}
                defaultValue={serviceType?.name ?? ""}
                invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          </FormField>

          <FormField
            id={descriptionId}
            label="Descripción"
            required
            error={descriptionError}
            compact
          >
            {({ describedBy, invalid }) => (
              <Textarea
                id={descriptionId}
                name="description"
                required
                maxLength={500}
                defaultValue={serviceType?.description ?? ""}
                invalid={invalid}
                aria-describedby={describedBy}
                className="min-h-24"
              />
            )}
          </FormField>

          {serviceType ? (
            <FormField
              id={workflowId}
              label="Flujo"
              optional={false}
              compact
            >
              <div className="flex flex-wrap items-center gap-2">
                <WorkflowTypeBadge workflowType={serviceType.workflowType} />
                {serviceType.workflowType === "impresion" ? (
                  <span className="rounded-(--radius-control) border border-border-strong bg-surface-muted px-2.5 py-1 text-xs font-semibold leading-none text-text-secondary">
                    Servicio del sistema
                  </span>
                ) : null}
              </div>
            </FormField>
          ) : null}

          <FormField
            id={availabilityId}
            label="Disponibilidad pública"
            required
            error={availabilityError}
            compact
          >
            {({ describedBy, invalid }) => (
              <Select
                id={availabilityId}
                name="is_publicly_available"
                required
                value={availabilityValue}
                invalid={invalid}
                aria-describedby={describedBy}
                onChange={(event) => setAvailabilityValue(event.target.value)}
              >
                <option value="true">Disponible</option>
                <option value="false">Oculto</option>
              </Select>
            )}
          </FormField>
        </div>

        <FormActions compact note={undefined}>
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending
              ? isCreate
                ? "Creando servicio..."
                : "Guardando cambios..."
              : isCreate
                ? "Crear servicio"
                : "Guardar cambios"}
          </Button>
        </FormActions>
      </div>
    </form>
  );
}
