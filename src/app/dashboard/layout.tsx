import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { getCurrentProfile } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await getCurrentProfile();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 md:flex">
      <DashboardSidebar role={profile?.role ?? null} />
      <main className="w-full flex-1 px-6 py-8 md:px-10">{children}</main>
    </div>
  );
}
