import type { Role } from "@/lib/permissions";

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
