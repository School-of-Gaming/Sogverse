"use client";

import { Sidebar } from "./sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      {/* scrollbar-gutter:stable reserves space for the scrollbar so content doesn't shift when it appears */}
      <main className="flex-1 overflow-auto bg-background [scrollbar-gutter:stable]">
        <div className="container mx-auto p-6">{children}</div>
      </main>
    </div>
  );
}
