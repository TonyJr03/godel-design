import { Alert, MetadataGrid, MetadataItem } from "@/components/ui";
import { CopyableCode } from "@/components/common/CopyableCode";
import {
  PEDIDO_PAYMENT_STATUS_LABELS,
  isPedidoActiveStatus,
  type InternalPedidoDetail,
  type PedidoTasksProgress,
} from "@/lib/pedidos";
import { getTodayDateInputValue } from "@/lib/utils";
import { WORKFLOW_TYPES } from "@/lib/workflow-types";

const DATE_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string | null): string {
  return value ? DATE_FORMATTER.format(new Date(value)) : "No definida";
}

function formatAssignedWorkers(pedido: InternalPedidoDetail): string {
  if (pedido.pedido_trabajadores.length === 0) {
    return "Sin personal asignado";
  }

  return pedido.pedido_trabajadores
    .map((assignment) => assignment.perfiles?.full_name ?? "Perfil no disponible")
    .join(", ");
}

function getProgressLabel(
  pedido: InternalPedidoDetail,
  progress: PedidoTasksProgress | null | undefined,
  tasksLoadError?: string,
) {
  if (pedido.workflow_type === WORKFLOW_TYPES.IMPRESION) {
    return "Flujo directo de impresión";
  }

  if (tasksLoadError) {
    return "No disponible";
  }

  if (!progress?.hasTasks) {
    return "Sin tareas";
  }

  return progress.isComplete
    ? "Tareas completadas"
    : `${Math.round(progress.progressPercentage)}% completado`;
}

function getWarnings({
  pedido,
  taskProgress,
  tasksLoadError,
  filesLoadError,
}: PedidoWorkspaceSummaryProps): string[] {
  const warnings: string[] = [];
  const today = getTodayDateInputValue();
  const estimatedDelivery = pedido.estimated_delivery_date?.slice(0, 10) ?? null;

  if (tasksLoadError) {
    warnings.push(tasksLoadError);
  }

  if (filesLoadError) {
    warnings.push(filesLoadError);
  }

  if (!pedido.clientes) {
    warnings.push("Sin cliente asociado.");
  }

  if (pedido.pedido_trabajadores.length === 0) {
    warnings.push("Sin personal asignado.");
  }

  if (
    pedido.workflow_type === WORKFLOW_TYPES.ENCARGO &&
    isPedidoActiveStatus(pedido.status) &&
    !taskProgress?.hasTasks &&
    !tasksLoadError
  ) {
    warnings.push("Este encargo activo todavía no tiene tareas registradas.");
  }

  if (!pedido.payment.isAvailable) {
    warnings.push("Resumen financiero no disponible.");
  } else if (
    pedido.status === "listo_entrega" &&
    pedido.payment.paymentStatus !== "pagado"
  ) {
    warnings.push("Pago pendiente antes de cerrar la entrega.");
  }

  if (
    estimatedDelivery &&
    isPedidoActiveStatus(pedido.status) &&
    estimatedDelivery < today
  ) {
    warnings.push("La fecha estimada está vencida y el pedido sigue activo.");
  }

  return warnings;
}

type PedidoWorkspaceSummaryProps = {
  pedido: InternalPedidoDetail;
  taskProgress?: PedidoTasksProgress | null;
  tasksLoadError?: string;
  filesLoadError?: string;
};

export function PedidoWorkspaceSummary(props: PedidoWorkspaceSummaryProps) {
  const { pedido, taskProgress, tasksLoadError, filesLoadError } = props;
  const warnings = getWarnings({
    pedido,
    taskProgress,
    tasksLoadError,
    filesLoadError,
  });
  const paymentLabel = pedido.payment.isAvailable
    ? PEDIDO_PAYMENT_STATUS_LABELS[pedido.payment.paymentStatus]
    : "Resumen no disponible";

  return (
    <section
      aria-labelledby="pedido-workspace-summary-title"
      className="min-w-0 rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
    >
      <div className="min-w-0">
        <h2
          id="pedido-workspace-summary-title"
          className="text-lg font-semibold text-text-primary"
        >
          Resumen operativo
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Datos clave para orientar el trabajo y detectar pendientes operativos.
        </p>
      </div>

      <MetadataGrid className="mt-5 lg:grid-cols-3 xl:grid-cols-5">
        <MetadataItem
          label="Cliente"
          value={pedido.clientes?.name ?? "Sin cliente asociado"}
        />
        <MetadataItem label="Personal" value={formatAssignedWorkers(pedido)} />
        <MetadataItem
          label={
            pedido.workflow_type === WORKFLOW_TYPES.IMPRESION
              ? "Operación"
              : "Progreso"
          }
          value={getProgressLabel(pedido, taskProgress, tasksLoadError)}
        />
        <MetadataItem
          label="Entrega estimada"
          value={formatDate(pedido.estimated_delivery_date)}
        />
        <MetadataItem label="Pago" value={paymentLabel} />
      </MetadataGrid>

      <CopyableCode
        code={pedido.public_reference}
        helperText="Comparte este código con el cliente para consultar el estado público."
        className="mt-5 border-brand-primary/20 bg-brand-primary-soft"
      />

      {warnings.length > 0 ? (
        <div className="mt-5 grid gap-3">
          {warnings.map((warning) => (
            <Alert key={warning} variant="warning">
              {warning}
            </Alert>
          ))}
        </div>
      ) : null}
    </section>
  );
}
