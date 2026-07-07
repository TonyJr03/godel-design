import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { SkipLink } from "@/components/layout/SkipLink";
import { getCurrentProfile } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await getCurrentProfile();

  return (
    <div className="min-h-screen bg-background text-text-primary md:flex">
      <SkipLink />
      <DashboardSidebar role={profile?.role ?? null} />
      <main
        id="main-content"
        tabIndex={-1}
        className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-8 lg:px-10"
      >
        <div className="mx-auto w-full max-w-screen-2xl">{children}</div>
      </main>
    </div>
  );
}
