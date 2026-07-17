import type { WorkflowType } from "@/lib/workflow-types";
import type { Tables } from "@/types/database";

export type InternalCliente = Pick<
  Tables<"clientes">,
  "id" | "name" | "phone" | "email" | "created_at" | "updated_at"
>;

export type InternalClienteDetail = Pick<
  Tables<"clientes">,
  | "id"
  | "name"
  | "phone"
  | "email"
  | "notes"
  | "created_at"
  | "updated_at"
> & {
  pedidos: InternalClienteLinkedPedido[];
};

export type InternalClienteLinkedPedido = Pick<
  Tables<"pedidos">,
  "id" | "title" | "created_at"
> & {
  workflow_type: WorkflowType;
};
