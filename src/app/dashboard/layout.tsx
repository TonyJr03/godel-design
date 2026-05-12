import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 md:flex">
      <DashboardSidebar />
      <main className="w-full flex-1 px-6 py-8 md:px-10">{children}</main>
    </div>
  );
}
