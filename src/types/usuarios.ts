import type { Rol } from "@/constants/roles";

export type UsuarioId = string;

export type UsuarioBase = {
  id: UsuarioId;
  rol: Rol;
};

// TODO: ampliar cuando se implemente autenticacion y usuarios internos.
