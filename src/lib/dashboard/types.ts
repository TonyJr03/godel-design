import type { Role } from "@/lib/permissions";
import type { Enums } from "@/types/database";

export type DashboardRole = Extract<
  Role,
  "admin" | "supervisor" | "trabajador"
>;

export type ManagementDashboardRole = Extract<
  DashboardRole,
  "admin" | "supervisor"
>;

export type WorkerDashboardRole = Extract<DashboardRole, "trabajador">;

export type ManagementDashboardMetrics = {
  solicitudesNuevas: number;
  solicitudesPendientes: number;
  solicitudesAprobadasPendientesConvertir: number;
  pedidosActivos: number;
  pedidosEnDiseno: number;
  pedidosEnProduccion: number;
  pedidosListosEntrega: number;
  pedidosAtrasados: number;
  pedidosProximosEntrega: number;
  clientesRegistrados: number;
};

export type WorkerDashboardMetrics = {
  pedidosAsignadosActivos: number;
  pedidosAsignadosEnDiseno: number;
  pedidosAsignadosEnProduccion: number;
  pedidosAsignadosListosEntrega: number;
  pedidosAsignadosAtrasados: number;
  pedidosAsignadosProximosEntrega: number;
  totalPedidosAsignados: number;
};

export type DashboardSummaryValue = {
  key: string;
  label: string;
  value: number;
};

export type ManagementDashboardSummary = {
  kind: "management";
  role: ManagementDashboardRole;
  metrics: ManagementDashboardMetrics;
  generatedAt: string;
};

export type WorkerDashboardSummary = {
  kind: "worker";
  role: WorkerDashboardRole;
  metrics: WorkerDashboardMetrics;
  generatedAt: string;
};

export type DashboardSummaryErrorReason =
  | "unauthorized"
  | "forbidden"
  | "error";

export type DashboardSummaryError = {
  ok: false;
  reason: DashboardSummaryErrorReason;
  message: string;
};

export type ManagementDashboardSummarySuccess = {
  ok: true;
  role: ManagementDashboardRole;
  summary: ManagementDashboardSummary;
};

export type WorkerDashboardSummarySuccess = {
  ok: true;
  role: WorkerDashboardRole;
  summary: WorkerDashboardSummary;
};

export type GetDashboardSummaryResult =
  | ManagementDashboardSummarySuccess
  | WorkerDashboardSummarySuccess
  | DashboardSummaryError;

export type GetWorkerDashboardSummaryResult =
  | WorkerDashboardSummarySuccess
  | DashboardSummaryError;

export type DashboardWorkItemsErrorReason =
  | "unauthorized"
  | "forbidden"
  | "error";

export type DashboardWorkItemsError = {
  ok: false;
  reason: DashboardWorkItemsErrorReason;
  message: string;
};

export type DashboardWorkItemsView = "management" | "worker";

export type DashboardPendingSolicitudItem = {
  id: string;
  href: string;
  clienteNombre: string;
  clienteTelefono: string;
  tipoServicio: string;
  estado: Enums<"solicitud_estado">;
  createdAt: string;
  fechaDeseada: string | null;
  convertedOrderId: string | null;
};

export type DashboardPedidoWorkItem = {
  id: string;
  href: string;
  numeroPedido: string;
  titulo: string;
  estado: Enums<"pedido_estado">;
  prioridad: Enums<"pedido_prioridad">;
  fechaEntregaEstimada: string | null;
  createdAt: string;
  clienteNombre: string | null;
  attention: {
    isOverdue: boolean;
    isDueSoon: boolean;
  };
};

export type ManagementDashboardWorkItems = {
  kind: "management";
  role: ManagementDashboardRole;
  solicitudesPendientes: DashboardPendingSolicitudItem[];
  pedidosAtencion: DashboardPedidoWorkItem[];
  generatedAt: string;
};

export type WorkerDashboardWorkItems = {
  kind: "worker";
  role: WorkerDashboardRole;
  pedidosAsignados: DashboardPedidoWorkItem[];
  generatedAt: string;
};

export type ManagementDashboardWorkItemsSuccess = {
  ok: true;
  role: ManagementDashboardRole;
  workItems: ManagementDashboardWorkItems;
};

export type WorkerDashboardWorkItemsSuccess = {
  ok: true;
  role: WorkerDashboardRole;
  workItems: WorkerDashboardWorkItems;
};

export type GetDashboardWorkItemsResult =
  | ManagementDashboardWorkItemsSuccess
  | WorkerDashboardWorkItemsSuccess
  | DashboardWorkItemsError;
