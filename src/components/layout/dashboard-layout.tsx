"use client";

import { Sidebar } from "./sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-background">
        <div className="container mx-auto p-6">{children}</div>
      </main>
    </div>
  );
}
