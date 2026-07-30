import { redirect } from "next/navigation";

import {
  changeInitialPasswordAction,
  logoutFromInitialPasswordChange,
} from "./actions";
import { InitialPasswordChangeForm } from "@/components/auth/InitialPasswordChangeForm";
import { Alert, Button, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

type InitialPasswordProfile = {
  id: string;
  is_active: boolean | null;
  must_change_password: boolean | null;
};

export default async function InitialPasswordChangePage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("perfiles")
    .select("id, is_active, must_change_password")
    .eq("id", user.id)
    .maybeSingle<InitialPasswordProfile>();

  if (!profile?.is_active) {
    redirect("/acceso-denegado");
  }

  if (profile.must_change_password !== true) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-muted px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-primary">
            Godel Diseño
          </p>
          <h1 className="text-3xl font-bold text-text-primary">
            Define una nueva contraseña
          </h1>
          <p className="text-sm leading-6 text-text-secondary">
            Para activar tu acceso interno, reemplaza la contraseña temporal
            antes de entrar al panel.
          </p>
        </div>

        <Card variant="raised" padding="lg" className="space-y-6">
          <Alert variant="info">
            La contraseña temporal solo debe usarse una vez. Al completar este
            paso, quedarás habilitado para entrar al dashboard.
          </Alert>

          <InitialPasswordChangeForm action={changeInitialPasswordAction} />

          <form action={logoutFromInitialPasswordChange}>
            <Button type="submit" variant="secondary" className="w-full">
              Cerrar sesión
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
