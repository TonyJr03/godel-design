import type { Enums, Tables, TablesInsert, TablesUpdate } from "@/types/database";

export type Profile = Tables<"perfiles">;
export type ProfileInsert = TablesInsert<"perfiles">;
export type ProfileUpdate = TablesUpdate<"perfiles">;
export type UsuarioInterno = Profile;
export type Rol = Enums<"app_role">;

export type UsuarioId = Profile["id"];

export type UsuarioBase = {
  id: UsuarioId;
  rol: Rol;
};
