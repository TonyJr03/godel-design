import type { Enums, Tables, TablesInsert, TablesUpdate } from "@/types/database";

export type Profile = Tables<"profiles">;
export type ProfileInsert = TablesInsert<"profiles">;
export type ProfileUpdate = TablesUpdate<"profiles">;
export type UsuarioInterno = Profile;
export type Rol = Enums<"app_role">;

export type UsuarioId = Profile["id"];

export type UsuarioBase = {
  id: UsuarioId;
  rol: Rol;
};
