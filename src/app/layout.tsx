import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Godel Diseño",
  description: "Sistema de gestión de solicitudes y pedidos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
