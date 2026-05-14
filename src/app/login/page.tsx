import { LoginForm } from "@/components/auth/LoginForm";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PageHeader } from "@/components/ui/PageHeader";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <PageHeader
          title="Acceso interno"
          description="Ingresa con tus credenciales internas para acceder al panel operativo."
        />
        <div className="mt-8">
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
