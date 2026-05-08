"use client";

import { Sidebar } from "./sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  showSidebar: boolean;
}

export function DashboardLayout({ children, showSidebar }: DashboardLayoutProps) {
  return (
    <div className="flex pt-16">
      {showSidebar && <Sidebar />}
      <main className="flex-1 bg-background">
        <div className="container mx-auto p-6">{children}</div>
      </main>
    </div>
  );
}
