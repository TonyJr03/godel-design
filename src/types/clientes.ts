import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";

export type Cliente = Tables<"clientes">;
export type ClienteInsert = TablesInsert<"clientes">;
export type ClienteUpdate = TablesUpdate<"clientes">;

export type ClienteId = Cliente["id"];

export type ClienteBase = {
  id: ClienteId;
};
