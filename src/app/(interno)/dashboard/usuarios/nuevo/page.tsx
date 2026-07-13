import { redirect } from "next/navigation";

export default function NuevoUsuarioLegacyPage() {
  redirect("/dashboard/configuracion/usuarios/nuevo");
}
